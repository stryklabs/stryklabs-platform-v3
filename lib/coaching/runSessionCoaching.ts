// lib/coaching/runSessionCoaching.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type CoachingStatus = "pending" | "generated" | "skipped" | "failed";

export type RunSessionCoachingOptions = {
  /**
   * Absolute origin, e.g. https://yourdomain.com
   * Used to call the internal generator route.
   */
  origin: string;

  /** Secret expected by /api/coaching/sessioncoach/create (x-coaching-generate-secret). */
  coachingGenerateSecret: string;

  /** Optional pause gate; when true we mark sessions as skipped rather than silently no-op. */
  generationPaused?: boolean;

  /** Optional: infer/override whether to only backfill sessions missing persisted coaching. */
  backfillOnly?: boolean;

  /** Optional: also trigger stats recompute prior to coaching generation. */
  backfillStats?: boolean;

  /** Secret expected by /api/internal/stats/recompute (x-stats-secret) OR INTERNAL_API_KEY. */
  statsSecret?: string;
  internalApiKey?: string;
};

export type RunResult = {
  session_id: string;
  ok: boolean;
  status: CoachingStatus;
  cached?: boolean;
  reason?: string;
  error?: string;
};

type SessionRow = {
  id: string;
  coaching_status: CoachingStatus | null;
  coaching_attempts: number | null;
};

async function bumpSessionStatus(
  db: SupabaseClient,
  sid: string,
  patch: Partial<{
    coaching_status: CoachingStatus;
    coaching_generated_at: string | null;
    coaching_error: string | null;
    coaching_attempts: number;
  }>
) {
  const { error } = await db.from("sessions").update(patch).eq("id", sid);
  if (error) throw new Error(error.message);
}

async function readAttempts(db: SupabaseClient, sid: string): Promise<number> {
  const { data, error } = await db
    .from("sessions")
    .select("coaching_attempts")
    .eq("id", sid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const n = Number((data as { coaching_attempts?: number | null } | null)?.coaching_attempts ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function sessionHasPersistedCoaching(db: SupabaseClient, sid: string, client_id: string) {
  const { data, error } = await db
    .from("coaching_versions")
    .select("id, content_json")
    .eq("client_id", client_id)
    .eq("session_id", sid)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw new Error(error.message);

  return (data ?? []).some((row: any) => row?.content_json?.schema_version === "sessioncoach_v1");
}

async function sessionHasSessionCoachingRow(db: SupabaseClient, sid: string) {
  const { data, error } = await db.from("session_coaching").select("id").eq("session_id", sid).maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(error.message); // ignore "0 rows" style errors
  return !!data?.id;
}

async function callStatsRecompute(origin: string, headers: Record<string, string>, sid: string) {
  const res = await fetch(`${origin}/api/internal/stats/recompute`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ session_id: sid }),
    cache: "no-store",
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(raw || `stats recompute failed: ${res.status}`);
  }
}

async function callGenerator(origin: string, secret: string, client_id: string, sid: string) {
  const res = await fetch(`${origin}/api/coaching/sessioncoach/create`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-coaching-generate-secret": secret,
    },
    body: JSON.stringify({ client_id, session_id: sid }),
    cache: "no-store",
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(raw || `generator failed: ${res.status}`);
  }
}

/**
 * Canonical runner: safe to call repeatedly.
 * - Never overwrites existing coaching (session_coaching row OR coaching_versions sessioncoach_v1)
 * - Writes status back to sessions for observability
 */
export async function runSessionCoachingForSession(
  db: SupabaseClient,
  session_id: string,
  client_id: string,
  opts: RunSessionCoachingOptions
): Promise<RunResult> {
  // Basic validation
  if (!opts.origin) return { session_id, ok: false, status: "failed", error: "Missing origin" };
  if (!opts.coachingGenerateSecret) return { session_id, ok: false, status: "failed", error: "Missing secret" };

  // Load session state (attempts for failures)
  const { data: srow, error: sErr } = await db
    .from("sessions")
    .select("id, coaching_status, coaching_attempts")
    .eq("id", session_id)
    .maybeSingle();

  if (sErr) return { session_id, ok: false, status: "failed", error: sErr.message };
  if (!srow?.id) return { session_id, ok: false, status: "failed", error: "Session not found" };

  // If we already have persisted coaching, treat as generated.
  const hasRow = await sessionHasSessionCoachingRow(db, session_id);
  const hasPersisted = await sessionHasPersistedCoaching(db, session_id, client_id);
  if (hasRow || hasPersisted) {
    await bumpSessionStatus(db, session_id, {
      coaching_status: "generated",
      coaching_generated_at: new Date().toISOString(),
      coaching_error: null,
    });
    return { session_id, ok: true, status: "generated", cached: true };
  }

  if (opts.generationPaused) {
    await bumpSessionStatus(db, session_id, { coaching_status: "skipped", coaching_error: "generation paused" });
    return { session_id, ok: true, status: "skipped", reason: "paused" };
  }

  // Respect backfillOnly (skip if coaching exists in persistence even if session_coaching row doesn't)
  if (opts.backfillOnly) {
    const exists = await sessionHasPersistedCoaching(db, session_id, client_id);
    if (exists) {
      await bumpSessionStatus(db, session_id, {
        coaching_status: "generated",
        coaching_generated_at: new Date().toISOString(),
        coaching_error: null,
      });
      return { session_id, ok: true, status: "generated", cached: true };
    }
  }

  try {
    await bumpSessionStatus(db, session_id, { coaching_status: "pending", coaching_error: null });

    if (opts.backfillStats) {
      const headers: Record<string, string> = {};
      if (opts.statsSecret) headers["x-stats-secret"] = opts.statsSecret;
      if (opts.internalApiKey) headers["x-internal-key"] = opts.internalApiKey;
      await callStatsRecompute(opts.origin, headers, session_id);
    }

    await callGenerator(opts.origin, opts.coachingGenerateSecret, client_id, session_id);

    await bumpSessionStatus(db, session_id, {
      coaching_status: "generated",
      coaching_generated_at: new Date().toISOString(),
      coaching_error: null,
    });

    return { session_id, ok: true, status: "generated" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const attempts = await readAttempts(db, session_id);

    await bumpSessionStatus(db, session_id, {
      coaching_status: "failed",
      coaching_error: msg,
      coaching_attempts: attempts + 1,
    });

    return { session_id, ok: false, status: "failed", error: msg };
  }
}
