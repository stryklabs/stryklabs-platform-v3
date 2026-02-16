import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

type Reason = "initial" | "data_change" | "manual_regen";

type Theme = {
  theme_id: string;
  priority?: number;
  rationale?: string;
  why_it_matters?: string;
  progress_metrics?: Array<{
    metric_id?: string;
    direction?: string;
    target_hint?: string;
  }>;
  confidence?: number;
  confidence_label?: string;
};

type SessionCoachV1 = {
  schema_version: "sessioncoach_v1";
  session_id: string;
  client_id: string;
  plan_id: string;
  created_at: string;
  display?: { title?: string; subtitle?: string };

  session_summary: string;
  what_stood_out: string[];
  what_this_supports: string;
  next_session_focus: string;
  plan_status: "aligned" | "neutral" | "review_needed";

  evidence: {
    primary_theme?: string;
    secondary_theme?: string | null;
    metrics_used?: string[];
    note?: string;
  };

  // Safe additive metadata (UI should ignore unknown keys)
  metadata?: {
    generated_by: "ai" | "deterministic";
    model?: string;
    latency_ms?: number;
    ai_error?: string;
  };
};

function toStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const helper = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
      if (Array.isArray(v)) return v.map(helper);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = helper(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(helper(value));
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(url, key, { auth: { persistSession: false } });
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.COACHING_GENERATE_SECRET || "";
  const got = req.headers.get("x-coaching-generate-secret") || "";
  if (expected && got && got === expected) return true;

  // Optional internal key (server-to-server)
  const internalExpected = process.env.INTERNAL_API_KEY || "";
  const internalGot = req.headers.get("x-internal-api-key") || "";
  if (internalExpected && internalGot && internalGot === internalExpected) return true;

  return false;
}

async function readActivePlan3m(serviceSb: ReturnType<typeof getServiceSupabase>, client_id: string) {
  const ptr = await serviceSb
    .from("client_active_plans")
    .select("active_plan3m_id")
    .eq("client_id", client_id)
    .maybeSingle();

  if (ptr.error) throw new Error(`client_active_plans lookup failed: ${ptr.error.message}`);
  const active_plan3m_id =
    typeof (ptr.data as any)?.active_plan3m_id === "string" ? (ptr.data as any).active_plan3m_id : null;
  return active_plan3m_id;
}

async function readPlanVersion(serviceSb: ReturnType<typeof getServiceSupabase>, planVersionId: string) {
  const row = await serviceSb
    .from("coaching_versions")
    .select("id, client_id, session_id, content_json, created_at")
    .eq("id", planVersionId)
    .maybeSingle();

  if (row.error) throw new Error(`coaching_versions(plan) lookup failed: ${row.error.message}`);
  return row.data as any;
}

function extractThemesFromPlanContent(content_json: any): Theme[] {
  // v1.1: themes at root: content_json.themes
  const rootThemes = content_json?.themes;
  if (Array.isArray(rootThemes) && rootThemes.length > 0) return rootThemes as Theme[];

  // Some older shapes: content_json.plan.themes
  const nestedThemes = content_json?.plan?.themes;
  if (Array.isArray(nestedThemes) && nestedThemes.length > 0) return nestedThemes as Theme[];

  // Some shapes: content_json.content_json.themes (defensive)
  const nested2 = content_json?.content_json?.themes;
  if (Array.isArray(nested2) && nested2.length > 0) return nested2 as Theme[];

  return [];
}

async function nextVersionIndex(
  serviceSb: ReturnType<typeof getServiceSupabase>,
  client_id: string,
  session_id: string,
): Promise<number> {
  const q = await serviceSb
    .from("coaching_versions")
    .select("version_index")
    .eq("client_id", client_id)
    .eq("session_id", session_id)
    .order("version_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (q.error) throw new Error(`version_index lookup failed: ${q.error.message}`);
  const maxIdx = typeof (q.data as any)?.version_index === "number" ? (q.data as any).version_index : 0;
  return maxIdx + 1;
}

async function readLatestSnapshot(serviceSb: ReturnType<typeof getServiceSupabase>, session_id: string) {
  const snap = await serviceSb
    .from("session_stats")
    .select("stats_json, created_at")
    .eq("session_id", session_id)
    .eq("stat_type", "snapshot")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snap.error) throw new Error(`session_stats snapshot lookup failed: ${snap.error.message}`);
  return (snap.data as any)?.stats_json ?? null;
}

function shouldUseAI(): boolean {
  return (process.env.COACHING_USE_AI || "").toLowerCase() === "true" && !!process.env.OPENAI_API_KEY;
}

function safeJsonParseObject(text: string): any | null {
  const raw = (text || "").trim();
  if (!raw) return null;

  // 1) direct parse
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") return obj;
  } catch {}

  // 2) strip code fences
  const unfenced = raw.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
  if (unfenced !== raw) {
    try {
      const obj = JSON.parse(unfenced);
      if (obj && typeof obj === "object") return obj;
    } catch {}
  }

  // 3) attempt to extract first JSON object substring
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = raw.slice(firstBrace, lastBrace + 1);
    try {
      const obj = JSON.parse(slice);
      if (obj && typeof obj === "object") return obj;
    } catch {}
  }

  return null;
}

function clampString(s: unknown, max = 800): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function normalizeAIIntoSessionCoach(
  parsed: any,
  base: Omit<SessionCoachV1, "session_summary" | "what_stood_out" | "what_this_supports" | "next_session_focus" | "plan_status" | "metadata">,
  aiMeta: { model?: string; latency_ms?: number; ai_error?: string } | null,
): SessionCoachV1 | null {
  const session_summary = clampString(parsed?.session_summary, 1200);
  const what_this_supports = clampString(parsed?.what_this_supports, 1200);
  const next_session_focus = clampString(parsed?.next_session_focus, 1200);

  const wsoRaw = parsed?.what_stood_out;
  const what_stood_out =
    Array.isArray(wsoRaw) ? wsoRaw.map((x: any) => clampString(x, 200)).filter((x: any): x is string => !!x) : null;

  const ps = clampString(parsed?.plan_status, 40);
  const plan_status: SessionCoachV1["plan_status"] | null =
    ps === "aligned" || ps === "neutral" || ps === "review_needed" ? (ps as any) : null;

  if (!session_summary || !what_this_supports || !next_session_focus || !what_stood_out || !what_stood_out.length || !plan_status) {
    return null;
  }

  return {
    ...base,
    session_summary,
    what_stood_out,
    what_this_supports,
    next_session_focus,
    plan_status,
    metadata: {
      generated_by: "ai",
      model: aiMeta?.model,
      latency_ms: aiMeta?.latency_ms,
      ai_error: aiMeta?.ai_error,
    },
  };
}

async function tryGenerateAI(
  args: {
    client_id: string;
    session_id: string;
    plan_id: string;
    primary: Theme;
    secondary: Theme | null;
    latestSnapshot: any;
  },
  timeoutMs: number,
): Promise<{ parsed: any; model: string; latency_ms: number } | null> {
  if (!shouldUseAI()) return null;

  const model = process.env.COACHING_AI_MODEL || "gpt-4o-mini";
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  try {
    const prompt = {
      schema: "sessioncoach_v1",
      session_id: args.session_id,
      client_id: args.client_id,
      plan_id: args.plan_id,
      primary_theme: {
        theme_id: args.primary?.theme_id,
        rationale: args.primary?.rationale ?? null,
        why_it_matters: args.primary?.why_it_matters ?? null,
        progress_metrics: Array.isArray(args.primary?.progress_metrics) ? args.primary.progress_metrics : [],
      },
      secondary_theme: args.secondary ? { theme_id: args.secondary.theme_id } : null,
      latest_snapshot: args.latestSnapshot ?? null,
      required_output: {
        // AI must fill these exactly; validator enforces
        session_summary: "string",
        what_stood_out: "string[]",
        what_this_supports: "string",
        next_session_focus: "string",
        plan_status: "aligned|neutral|review_needed",
      },
      style: { tone: "coach-like, direct, encouraging", length: "short" },
    };

    const resp: any = await openai.responses.create(
      {
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "Return ONLY a valid JSON object (no prose, no markdown). Keys must be EXACTLY: session_summary (string), what_stood_out (string[]), what_this_supports (string), next_session_focus (string), plan_status ('aligned'|'neutral'|'review_needed'). Do not add extra keys.",
              },
            ],
          },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(prompt) }] },
        ],
      },
      { signal: controller.signal } as any,
    );

    const latency_ms = Date.now() - t0;

    const outText =
      typeof resp?.output_text === "string" && resp.output_text.trim().length
        ? resp.output_text
        : typeof resp?.output?.[0]?.content?.[0]?.text === "string"
          ? resp.output[0].content[0].text
          : null;

    if (!outText) return null;

    const parsed = safeJsonParseObject(outText);
    if (!parsed) return null;

    return { parsed, model, latency_ms };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /api/coaching/sessioncoach/create
 * Body: { client_id, session_id, reason? }
 * Auth: x-coaching-generate-secret (COACHING_GENERATE_SECRET)
 *
 * Writes an immutable coaching_versions row with schema_version=sessioncoach_v1 for the session.
 */
export async function handleSessionCoachCreate(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "unauthorized", request_id: requestId }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const client_id = toStringOrNull(body["client_id"]);
    const session_id = toStringOrNull(body["session_id"]);
    const reasonIn = toStringOrNull(body["reason"]) as Reason | null;

    if (!client_id || !session_id) {
      return NextResponse.json(
        { ok: false, error: "client_id and session_id are required", request_id: requestId },
        { status: 400 },
      );
    }

    const reason: Reason = reasonIn === "data_change" || reasonIn === "manual_regen" ? reasonIn : "initial";

    const serviceSb = getServiceSupabase();

    // 1) Get active plan pointer
    const active_plan3m_id = await readActivePlan3m(serviceSb, client_id);
    if (!active_plan3m_id) {
      return NextResponse.json(
        { ok: false, error: "No active plan3m for client (admin must create one)", request_id: requestId },
        { status: 400 },
      );
    }

    // 2) Load plan version content
    const planRow = await readPlanVersion(serviceSb, active_plan3m_id);
    const planContent = planRow?.content_json ?? null;

    // Only accept v1.1 plans as input truth (your platform standard)
    const schemaVersion = typeof planContent?.schema_version === "string" ? planContent.schema_version : null;
    if (schemaVersion !== "plan3m_v1.1") {
      return NextResponse.json(
        {
          ok: false,
          error: `Active plan schema_version is not plan3m_v1.1 (got ${schemaVersion ?? "null"})`,
          request_id: requestId,
        },
        { status: 400 },
      );
    }

    const themes = extractThemesFromPlanContent(planContent);
    if (!themes.length) {
      return NextResponse.json({ ok: false, error: "Active plan has no themes", request_id: requestId }, { status: 400 });
    }

    // 3) Pull latest snapshot (optional, used to make output minimally contextual)
    const latestSnapshot = await readLatestSnapshot(serviceSb, session_id);

    // 4) Deterministic baseline (always valid; used as fallback)
    const primary = themes.slice().sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))[0] ?? themes[0];
    const secondary = themes.find((t) => t.theme_id !== primary.theme_id) ?? null;

    const metricsUsed = Array.isArray(primary?.progress_metrics)
      ? primary.progress_metrics
          .map((m) => m.metric_id)
          .filter((x: string | undefined): x is string => typeof x === "string" && x.length > 0)
      : [];

    const baseDeterministic: SessionCoachV1 = {
      schema_version: "sessioncoach_v1",
      session_id,
      client_id,
      plan_id: active_plan3m_id,
      created_at: new Date().toISOString(),
      display: { title: "Session coaching", subtitle: "Autocompute" },
      session_summary:
        "This session has been logged successfully. Coaching is based on your active 3‑month plan focus and latest session snapshot.",
      what_stood_out: [
        `Primary focus: ${primary.theme_id}`,
        ...(secondary ? [`Secondary focus: ${secondary.theme_id}`] : []),
        ...(latestSnapshot ? ["Snapshot captured for this session."] : ["No snapshot found; coaching is plan-driven."]),
      ],
      what_this_supports:
        primary?.why_it_matters ||
        primary?.rationale ||
        "This supports the current plan focus and provides direction for next practice.",
      next_session_focus:
        "Repeat the key drill(s) for the primary theme and log a short journal note on what changed versus last time.",
      plan_status: "aligned",
      evidence: {
        primary_theme: primary.theme_id,
        secondary_theme: secondary?.theme_id ?? null,
        metrics_used: metricsUsed.length ? metricsUsed : undefined,
        note: latestSnapshot ? "Uses latest session snapshot + active plan themes." : "Uses active plan themes.",
      },
      metadata: { generated_by: "deterministic" },
    };

    let out: SessionCoachV1 = baseDeterministic;
    let generated_by: "ai" | "deterministic" = "deterministic";

    // 4b) AI attempt (AI-first when enabled; silent fallback)
    const timeoutMs = Number(process.env.COACHING_AI_TIMEOUT_MS || "8000");
    const ai = await tryGenerateAI(
      { client_id, session_id, plan_id: active_plan3m_id, primary, secondary, latestSnapshot },
      Number.isFinite(timeoutMs) ? timeoutMs : 8000,
    );

    if (ai?.parsed) {
      const aiOut = normalizeAIIntoSessionCoach(
        ai.parsed,
        {
          schema_version: "sessioncoach_v1",
          session_id,
          client_id,
          plan_id: active_plan3m_id,
          created_at: new Date().toISOString(),
          display: { title: "Session coaching", subtitle: "AI" },
          evidence: baseDeterministic.evidence,
        },
        { model: ai.model, latency_ms: ai.latency_ms },
      );

      if (aiOut) {
        out = aiOut;
        generated_by = "ai";
      }
    }

    // Ensure deterministic metadata present even when AI fails
    if (generated_by === "deterministic") {
      out = { ...out, metadata: { ...(out.metadata || {}), generated_by: "deterministic" } };
    }

    // 5) Append-only write to coaching_versions for this session
    const version_index = await nextVersionIndex(serviceSb, client_id, session_id);
    const stable = stableStringify(out);
    const data_hash = sha256Hex(stable);

    const insert = await serviceSb.from("coaching_versions").insert({
      id: crypto.randomUUID(),
      client_id,
      session_id,
      version_index,
      reason,
      data_hash,
      content_json: out,
      generated_by, // top-level column (if present)
      created_at: new Date().toISOString(),
    });

    if (insert.error) {
      return NextResponse.json(
        { ok: false, error: `insert coaching_versions failed: ${insert.error.message}`, request_id: requestId },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        request_id: requestId,
        client_id,
        session_id,
        plan_version_id: active_plan3m_id,
        schema_version: out.schema_version,
        version_index,
        generated_by,
      },
      { status: 200 },
    );
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json({ ok: false, error: msg, request_id: requestId }, { status: 500 });
  }
}
