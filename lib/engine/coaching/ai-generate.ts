import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Theme = {
  theme_id: string;
  priority?: number;
  rationale?: string;
  why_it_matters?: string;
};

type PlanV11 = {
  schema_version?: string;
  plan_id?: string;
  themes?: Theme[];
  // allow unknown extra fields
  [k: string]: any;
};

type SessionCoachV1 = {
  schema_version: "sessioncoach_v1";
  session_id: string;
  client_id: string;
  plan_id: string;
  created_at: string;
  display: {
    title: string;
    subtitle: string;
    session_summary: string;
    what_stood_out: string[];
    what_this_supports: string;
    next_session_focus: string;
    plan_status: "aligned" | "neutral" | "review_needed";
  };
  evidence: {
    primary_theme?: string;
    secondary_theme?: string | null;
    metrics_used?: string[];
    note?: string;
  };
  metadata?: Record<string, any>;
};

function requireInternal(req: NextRequest): boolean {
  const internalKey = process.env.INTERNAL_API_KEY || "";
  if (internalKey) {
    const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    return (req.headers.get("x-internal-key") || "") === internalKey || bearer === internalKey;
  }
  const expected =
    process.env.COACHING_GENERATE_SECRET ||
    process.env.STATS_RECOMPUTE_SECRET ||
    process.env.INTERNAL_API_KEY ||
    "";
  const got =
    req.headers.get("x-internal-secret") ||
    req.headers.get("x-coaching-generate-secret") ||
    req.headers.get("x-coaching-secret") ||
    req.headers.get("x-stats-secret") ||
    "";
  return !!expected && got === expected;
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Missing Supabase service env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    );
  return createClient(url, key, { auth: { persistSession: false } });
}

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParseObject(text: string): any | null {
  if (!text) return null;
  // try direct
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object") return v;
  } catch {}
  // try to extract first JSON object
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const v = JSON.parse(m[0]);
      if (v && typeof v === "object") return v;
    } catch {}
  }
  return null;
}

function clampArrayStrings(v: any, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
    if (out.length >= max) break;
  }
  return out;
}

function toString(v: any, fallback: string): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  return fallback;
}

function toPlanStatus(v: any): "aligned" | "neutral" | "review_needed" {
  if (v === "aligned" || v === "neutral" || v === "review_needed") return v;
  return "neutral";
}

function buildDeterministicBaseline(params: {
  session_id: string;
  client_id: string;
  plan_id: string;
  themes: Theme[];
  stats_json: any;
}): SessionCoachV1 {
  const { session_id, client_id, plan_id, themes, stats_json } = params;
  const primary = themes?.[0]?.theme_id || "general_progress";
  const secondary = themes?.[1]?.theme_id || null;

  // Light, safe deterministic content (keeps UI happy)
  const summary =
    typeof stats_json?.summary === "string"
      ? stats_json.summary
      : "Session stats received and reviewed. Coaching generated from your current plan themes and metrics snapshot.";

  const stoodOut: string[] = [];
  if (Array.isArray(stats_json?.highlights)) {
    for (const h of stats_json.highlights) {
      if (typeof h === "string" && h.trim()) stoodOut.push(h.trim());
      if (stoodOut.length >= 4) break;
    }
  }
  if (stoodOut.length === 0)
    stoodOut.push("Key metrics snapshot captured for this session.");

  const supports =
    themes?.[0]?.why_it_matters ||
    themes?.[0]?.rationale ||
    `This session supports your plan focus on “${primary}”.`;

  const nextFocus = `Next session: choose 1 behaviour to reinforce “${primary}” and track one measurable signal.`;

  const base: SessionCoachV1 = {
    schema_version: "sessioncoach_v1",
    session_id,
    client_id,
    plan_id,
    created_at: nowIso(),
    display: {
      title: "Session Coaching",
      subtitle: "AI-enhanced coaching (fallback-safe)",
      session_summary: summary,
      what_stood_out: stoodOut,
      what_this_supports: supports,
      next_session_focus: nextFocus,
      plan_status: "neutral",
    },
    evidence: {
      primary_theme: primary,
      secondary_theme: secondary,
      metrics_used: Array.isArray(stats_json?.metrics_used)
        ? stats_json.metrics_used
        : [],
      note: "Deterministic baseline",
    },
  };

  return base;
}

function validateAndNormalizeAi(
  ai: any,
  baseline: SessionCoachV1
): SessionCoachV1 | null {
  if (!ai || typeof ai !== "object") return null;

  const display =
    (ai as any).display && typeof (ai as any).display === "object"
      ? (ai as any).display
      : ai;

  const out: SessionCoachV1 = {
    ...baseline,
    created_at: nowIso(),
    display: {
      title: toString(display?.title, baseline.display.title),
      subtitle: toString(display?.subtitle, baseline.display.subtitle),
      session_summary: toString(
        display?.session_summary,
        baseline.display.session_summary
      ),
      what_stood_out:
        clampArrayStrings(display?.what_stood_out, 6) ||
        baseline.display.what_stood_out,
      what_this_supports: toString(
        display?.what_this_supports,
        baseline.display.what_this_supports
      ),
      next_session_focus: toString(
        display?.next_session_focus,
        baseline.display.next_session_focus
      ),
      plan_status: toPlanStatus(display?.plan_status),
    },
    evidence: {
      primary_theme: toString(
        (ai as any)?.evidence?.primary_theme,
        baseline.evidence.primary_theme || ""
      ),
      secondary_theme:
        (ai as any)?.evidence?.secondary_theme ??
        baseline.evidence.secondary_theme ??
        null,
      metrics_used: Array.isArray((ai as any)?.evidence?.metrics_used)
        ? (ai as any).evidence.metrics_used
        : baseline.evidence.metrics_used,
      note: toString(
        (ai as any)?.evidence?.note,
        baseline.evidence.note || ""
      ),
    },
  };

  // Required fields sanity
  if (!out.display.session_summary || out.display.what_stood_out.length === 0)
    return null;
  return out;
}

// Engine entrypoint: internal-only orchestration + AI generation.
// Phase 0 boundary: OpenAI/provider logic lives here, not in routes.
export async function handleInternalCoachingAiGenerate(req: NextRequest) {
  if (!requireInternal(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const request_id = crypto.randomUUID();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const session_id = (body?.session_id || "") as string;
  const client_id_in = (body?.client_id || "") as string;

  if (!session_id) {
    return NextResponse.json(
      { error: "session_id is required" },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabase();

  // Resolve client_id
  let client_id = client_id_in;
  if (!client_id) {
    const { data: sessRow, error: sessErr } = await supabase
      .from("sessions")
      .select("client_id")
      .eq("id", session_id)
      .maybeSingle();

    if (sessErr || !sessRow?.client_id) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }
    client_id = sessRow.client_id as string;
  }

  // Load stats snapshot (required)
  const { data: statsRow, error: statsErr } = await supabase
    .from("session_stats")
    .select("data_hash, stats_json")
    .eq("session_id", session_id)
    .maybeSingle();

  if (statsErr || !statsRow) {
    return NextResponse.json(
      { error: "session_stats not found" },
      { status: 404 }
    );
  }

  // Active plan pointer
  const { data: capRow, error: capErr } = await supabase
    .from("client_active_plans")
    .select("active_plan3m_id")
    .eq("client_id", client_id)
    .maybeSingle();

  if (capErr || !capRow?.active_plan3m_id) {
    return NextResponse.json(
      { error: "active_plan3m_id missing" },
      { status: 409 }
    );
  }

  const planVersionId = capRow.active_plan3m_id as string;

  const { data: planRow, error: planErr } = await supabase
    .from("coaching_versions")
    .select("id, content_json")
    .eq("id", planVersionId)
    .maybeSingle();

  if (planErr || !planRow?.content_json) {
    return NextResponse.json(
      { error: "active plan not found" },
      { status: 404 }
    );
  }

  const planJson = planRow.content_json as PlanV11;
  const schemaV = planJson?.schema_version || "";
  if (schemaV !== "plan3m_v1.1") {
    return NextResponse.json(
      {
        error: `active plan schema_version must be plan3m_v1.1 (got ${schemaV})`,
      },
      { status: 409 }
    );
  }

  const themes = (Array.isArray(planJson?.themes) ? planJson.themes : []) as Theme[];

  // Deterministic baseline
  const baseline = buildDeterministicBaseline({
    session_id,
    client_id,
    plan_id: planVersionId,
    themes,
    stats_json: (statsRow as any).stats_json,
  });

  const useAi = String(process.env.COACHING_USE_AI || "false") === "true";
  const openaiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.COACHING_AI_MODEL || "gpt-4o-mini";
  const timeoutMs = Number(process.env.COACHING_AI_TIMEOUT_MS || "8000");

  let finalOut: SessionCoachV1 = baseline;
  let generated_by: "ai" | "deterministic" = "deterministic";
  let ai_error: string | null = null;
  let latency_ms: number | null = null;

  if (useAi && openaiKey) {
    const openai = new OpenAI({ apiKey: openaiKey });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const tAi0 = Date.now();

    try {
      const system = [
        "You are STRYKLabs Session Coaching.",
        "Return ONLY valid JSON (no markdown, no code fences).",
        "Do not change structure outside the requested keys.",
        "Keys must match the schema: display:{title,subtitle,session_summary,what_stood_out[],what_this_supports,next_session_focus,plan_status} and evidence:{primary_theme,secondary_theme,metrics_used,note}.",
      ].join(" ");

      const user = {
        session_id,
        client_id,
        plan_id: planVersionId,
        themes,
        stats: (statsRow as any).stats_json,
        baseline: baseline.display,
      };

      const resp = await openai.responses.create(
        {
          model,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: system }],
            },
            {
              role: "user",
              content: [{ type: "input_text", text: JSON.stringify(user) }],
            },
          ],
        },
        { signal: controller.signal }
      );

      const text = (resp as any)?.output_text || "";
      latency_ms = Date.now() - tAi0;

      const parsed = safeJsonParseObject(text);
      const normalized = validateAndNormalizeAi(parsed, baseline);

      if (normalized) {
        finalOut = normalized;
        generated_by = "ai";
      } else {
        ai_error = "ai_output_invalid_or_unparseable";
      }
    } catch (e: any) {
      latency_ms = Date.now() - tAi0;
      ai_error = e?.name === "AbortError" ? "ai_timeout" : String(e?.message || e);
    } finally {
      clearTimeout(timer);
    }
  } else {
    ai_error = !useAi ? "ai_disabled" : !openaiKey ? "missing_openai_key" : null;
  }

  // write immutable version row (append-only)
  const metadata: Record<string, any> = {
    generated_by,
    model: generated_by === "ai" ? model : undefined,
    latency_ms: latency_ms ?? undefined,
    ai_error: ai_error ?? undefined,
    request_id,
    route: "internal_ai_generate",
  };

  finalOut.metadata = { ...(finalOut.metadata || {}), ...metadata };

  // Version index: next index for this session
  const { data: lastRow } = await supabase
    .from("coaching_versions")
    .select("version_index")
    .eq("client_id", client_id)
    .eq("session_id", session_id)
    .order("version_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextIndex =
    typeof (lastRow as any)?.version_index === "number"
      ? (lastRow as any).version_index + 1
      : 1;

  const { data: ins, error: insErr } = await supabase
    .from("coaching_versions")
    .insert({
      client_id,
      session_id,
      reason: "manual_regen",
      version_index: nextIndex,
      data_hash: (statsRow as any).data_hash,
      content_json: finalOut,
      generated_by,
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    return NextResponse.json(
      { error: "failed to write coaching_versions", details: insErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: ins?.id,
    session_id,
    client_id,
    generated_by,
    duration_ms: Date.now() - t0,
    metadata,
  });
}
