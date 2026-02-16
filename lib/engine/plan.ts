import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

/**
 * POST /api/internal/plans/plan3m-recompute
 *
 * ✅ Append-only: inserts a new coaching_versions row every run.
 * ✅ Pointer update: moves client_active_plans.active_plan3m_id to the new row.
 * ✅ Bootstrap: if active_plan3m_id is NULL or points to a missing row, create first plan3m_v1.1.
 * ✅ Deterministic inputs snapshot: stores inputs_snapshot + inputs_hash inside content_json (no schema changes).
 * ✅ Skill-tier aware: derives skill_tier from handicap (if present) and adapts baseline + AI prompt.
 * ✅ Rich AI (optional): if OPENAI_API_KEY present and PLAN3M_USE_AI !== "false", generates richer display + content_md.
 *
 * Writes only to existing tables/columns:
 * - coaching_versions: client_id, session_id, version_index, data_hash, content_json, generated_by, reason
 * - client_active_plans: active_plan3m_id, plan3m_touched_at, updated_at
 */

const PLAN3M_ANCHOR_SESSION_ID = "00000000-0000-0000-0000-000000000000";
const PLAN3M_SCHEMA_VERSION = "plan3m_v1.1";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

type SkillTier = "scratch" | "advanced" | "intermediate" | "beginner" | "unknown";

type WeekPlan = {
  week_number: number;
  title: string;
  min_sessions: number;
  clubs: string[];
  aim: string;
  drills: string[];
  constraints: string[];
  checkpoints: string[];
  success_criteria: string[];
  date_window: { start: string; end: string };
};

type Plan3mDisplay = {
  headline: string;
  summary: string[];
  success_criteria: string[];
  weeks: WeekPlan[];
  content_md?: string;
};

function isJsonObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function getNumberDeep(obj: unknown, paths: string[]): number | null {
  if (!isJsonObject(obj)) return null;

  for (const p of paths) {
    const parts = p.split(".");
    let cur: unknown = obj;

    let ok = true;
    for (const part of parts) {
      if (!isJsonObject(cur)) {
        ok = false;
        break;
      }
      cur = cur[part];
    }
    if (!ok) continue;

    if (typeof cur === "number" && Number.isFinite(cur)) return cur;
    if (typeof cur === "string") {
      const n = Number(cur);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function deriveSkillTier(handicap: number | null): SkillTier {
  if (handicap === null) return "unknown";
  // Conservative tiers; adjust later without schema change.
  if (handicap <= 0.5) return "scratch";
  if (handicap <= 5) return "advanced";
  if (handicap <= 12) return "intermediate";
  return "beginner";
}

function generateBaselineDisplay(args: { startDateIso?: string; tier: SkillTier; handicap: number | null }): Plan3mDisplay {
  const start = args.startDateIso ? new Date(`${args.startDateIso}T00:00:00.000Z`) : new Date();
  const startDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));

  const tier = args.tier;
  const hcpLabel = args.handicap !== null ? ` (hcp ${args.handicap})` : "";

  const headline =
    tier === "scratch" || tier === "advanced"
      ? `Your 3‑Month Performance Plan${hcpLabel}`
      : `Your 3‑Month Plan${hcpLabel}`;

  const summary =
    tier === "scratch" || tier === "advanced"
      ? [
          "Optimise scoring with tighter dispersion, wedge proximity bands, and repeatable start lines.",
          "Train under constraints: randomised targets, pressure reps, and performance tests.",
          "Convert practice into strokes: strategy, miss-management, and predictable shot windows.",
        ]
      : [
          "Build repeatable contact and start-to-target control.",
          "Prioritise quality reps over volume; track what changes your ball flight.",
          "Use each session to confirm one thing, not fix ten things.",
        ];

  const success_criteria =
    tier === "scratch" || tier === "advanced"
      ? [
          "Your dispersion windows tighten (driver/7‑iron/wedge) with clear stock start + curve.",
          "Wedge proximity improves inside 120y with consistent distance bands.",
          "You can reproduce a ‘tournament swing’ under pressure reps and keep routine stable.",
        ]
      : [
          "You can describe your stock ball flight for driver/7‑iron/wedge and reproduce it on demand.",
          "You have a simple pre‑shot routine and one swing cue that holds under pressure.",
          "Your dispersion narrows week‑to‑week (trend, not perfection).",
        ];

  const clubsByWeek: string[][] =
    tier === "scratch" || tier === "advanced"
      ? [
          ["driver", "7-iron", "wedge"],
          ["3-wood", "6-iron", "wedge"],
          ["driver", "5-iron", "pitching-wedge"],
          ["7-iron", "9-iron", "wedge"],
        ]
      : [
          ["driver", "7-iron", "wedge"],
          ["8-iron", "pw", "wedge"],
          ["driver", "5-iron", "wedge"],
          ["7-iron", "9-iron", "wedge"],
        ];

  const baseMinSessions = tier === "scratch" ? 4 : tier === "advanced" ? 4 : 3;

  const weeks: WeekPlan[] = Array.from({ length: 12 }).map((_, i) => {
    const week_number = i + 1;
    const windowStart = addDays(startDay, i * 7);
    const windowEnd = addDays(startDay, i * 7 + 6);

    const clubs = clubsByWeek[i % clubsByWeek.length];

    const title =
      tier === "scratch" || tier === "advanced"
        ? week_number <= 4
          ? "Shot windows & dispersion"
          : week_number <= 8
            ? "Pressure & scoring edge"
            : "Tournament readiness"
        : week_number <= 4
          ? "Baseline consistency"
          : week_number <= 8
            ? "Pressure-proof patterns"
            : "Scoring focus";

    const aim =
      tier === "scratch" || tier === "advanced"
        ? week_number <= 4
          ? "Define and own your stock shot windows (start line + curve) and tighten dispersion."
          : week_number <= 8
            ? "Train decision-making and recovery under constraints; turn misses into predictable outcomes."
            : "Sharpen scoring: wedge proximity, tee‑shot placement, and pressure simulation."
        : week_number <= 4
          ? "Establish baseline contact and predictable start line."
          : week_number <= 8
            ? "Lock in one pattern and learn how to recover when it slips."
            : "Turn practice into scoring: start lines, distance control, and constraints.";

    const drills =
      tier === "scratch" || tier === "advanced"
        ? [
            "Dispersion window test: 30 balls, score start line + curve + strike (track L/R & long/short).",
            "Wedge banding: 60/80/100/120y — 10 balls each, record proximity and carry variance.",
            "Pressure ladder: must hit 3 consecutive ‘green-light’ shots before moving back a club.",
            "Random target switching: every shot new target + club; simulate course decisions.",
          ]
        : [
            "Random practice ladder: alternate targets every 2 balls (no autopilot).",
            "3-ball test: pick one cue, score contact (1–5), start line (1–5), curve (1–5).",
            "Wedge distance control: 30/50/70 with a fixed finish position.",
          ];

    const constraints =
      tier === "scratch" || tier === "advanced"
        ? [
            "Every rep has a target and intended shot window; stop when you lose intention.",
            "Add consequence: if you miss your window, do a reset routine before next ball.",
            "Video only to confirm start-line/face-to-path hypothesis; no rabbit holes.",
          ]
        : [
            "Stop after a great rep and write what caused it (don’t chase more).",
            "No more than 2 cues in a session; if it gets messy, reset to tempo + balance.",
            "Film 3 swings max; use video only to confirm the cue, not to diagnose endlessly.",
          ];

    const checkpoints =
      tier === "scratch" || tier === "advanced"
        ? [
            "You can describe your stock start line + curve for each key club and reproduce it.",
            "Your wedges hold a repeatable carry band (variance shrinking week-to-week).",
            "Routine stays stable under ‘must-hit’ reps.",
          ]
        : [
            "You can name your stock miss (start + curve) and your best counter.",
            "Your routine stays the same even after a poor strike.",
            "Your wedge carry numbers are within a predictable band.",
          ];

    const weekSuccess =
      tier === "scratch" || tier === "advanced"
        ? [
            "You log dispersion/proximity numbers and one clear adjustment to test next session.",
            "At least 1 pressure session completed (constraints + consequence).",
            "You finish with a single ‘performance cue’ and a single ‘strategy cue’.",
          ]
        : [
            "At least 2/3 sessions complete with clear notes on what improved and why.",
            "Dispersion feels tighter than last week (trend confirmation).",
            "You finish the week with a single ‘next focus’ for the next session.",
          ];

    return {
      week_number,
      title,
      min_sessions: baseMinSessions,
      clubs,
      aim,
      drills,
      constraints,
      checkpoints,
      success_criteria: weekSuccess,
      date_window: { start: isoDateOnly(windowStart), end: isoDateOnly(windowEnd) },
    };
  });

  const content_md =
    tier === "scratch" || tier === "advanced"
      ? `## 3‑Month Performance Plan${hcpLabel}\n\nThis is a performance-first starter plan. As you upload sessions, it will adapt around your actual trends (dispersion, proximity, scoring).\n\n**This week:** define your stock shot windows and prove them under constraints.\n`
      : `## 3‑Month Plan${hcpLabel}\n\nThis is your starter plan. As you upload sessions, this will evolve into a personalised weekly programme.\n\n**This week:** keep it simple — one cue, quality reps, and notes after each block.\n`;

  return { headline, summary, success_criteria, weeks, content_md };
}

function normalizeDisplay(x: unknown): Plan3mDisplay | null {
  if (!isJsonObject(x)) return null;

  const headline = typeof x.headline === "string" ? x.headline : null;
  const summary = Array.isArray(x.summary) ? x.summary.filter((v) => typeof v === "string") : null;
  const success = Array.isArray(x.success_criteria) ? x.success_criteria.filter((v) => typeof v === "string") : null;
  const weeksRaw = Array.isArray(x.weeks) ? x.weeks : null;

  if (!headline || !summary || !success || !weeksRaw) return null;

  const weeks: WeekPlan[] = [];
  for (const w of weeksRaw) {
    if (!isJsonObject(w)) continue;

    const week_number = typeof w.week_number === "number" ? w.week_number : null;
    const title = typeof w.title === "string" ? w.title : null;
    const min_sessions = typeof w.min_sessions === "number" ? w.min_sessions : null;
    const clubs = Array.isArray(w.clubs) ? w.clubs.filter((v) => typeof v === "string") : null;
    const aim = typeof w.aim === "string" ? w.aim : null;
    const drills = Array.isArray(w.drills) ? w.drills.filter((v) => typeof v === "string") : null;
    const constraints = Array.isArray(w.constraints) ? w.constraints.filter((v) => typeof v === "string") : null;
    const checkpoints = Array.isArray(w.checkpoints) ? w.checkpoints.filter((v) => typeof v === "string") : null;
    const sc = Array.isArray(w.success_criteria) ? w.success_criteria.filter((v) => typeof v === "string") : null;

    const dw = isJsonObject(w.date_window) ? w.date_window : null;
    const dwStart = dw && typeof dw.start === "string" ? dw.start : null;
    const dwEnd = dw && typeof dw.end === "string" ? dw.end : null;

    if (
      week_number === null ||
      !title ||
      min_sessions === null ||
      !clubs ||
      !aim ||
      !drills ||
      !constraints ||
      !checkpoints ||
      !sc ||
      !dwStart ||
      !dwEnd
    ) {
      continue;
    }

    weeks.push({
      week_number,
      title,
      min_sessions,
      clubs,
      aim,
      drills,
      constraints,
      checkpoints,
      success_criteria: sc,
      date_window: { start: dwStart, end: dwEnd },
    });
  }

  if (weeks.length !== 12) return null;

  const content_md = typeof x.content_md === "string" ? x.content_md : undefined;
  return { headline, summary, success_criteria: success, weeks, content_md };
}

async function callOpenAIForPlan(args: {
  apiKey: string;
  model: string;
  snapshot: Record<string, Json>;
  baseline: Plan3mDisplay;
  tier: SkillTier;
}): Promise<Plan3mDisplay | null> {
  const { apiKey, model, snapshot, baseline, tier } = args;

  const system = [
    "You are a world-class golf performance coach.",
    "Generate a 12-week 3-month plan in British English.",
    "Output MUST be JSON only matching the required schema.",
    "Be specific, progressive, and practical. No fluff.",
    "Use the snapshot (stats + previous plan if any) to personalise the plan.",
    tier === "scratch"
      ? "Player is scratch: avoid fundamentals. Focus on dispersion, wedge proximity, strategy, pressure simulation, and scoring edge."
      : tier === "advanced"
        ? "Player is advanced: focus on performance optimisation, dispersion, proximity, and pressure reps; avoid beginner fundamentals."
        : tier === "intermediate"
          ? "Player is intermediate: blend core mechanics with constraint-based practice and scoring habits."
          : tier === "beginner"
            ? "Player is beginner: prioritise strike, low-point control, and simple repeatable cues."
            : "Skill tier unknown: keep plan balanced and avoid overly technical assumptions.",
  ].join(" ");

  const user = {
    task: "Generate a rich 3-month plan for the client.",
    required_schema: {
      headline: "string",
      summary: "string[] (3-6 bullets)",
      success_criteria: "string[] (3-6 bullets)",
      content_md: "string (markdown narrative; optional but preferred)",
      weeks: [
        {
          week_number: "1..12",
          title: "string",
          min_sessions: "number (2-4)",
          clubs: "string[]",
          aim: "string",
          drills: "string[] (3-5)",
          constraints: "string[] (2-4)",
          checkpoints: "string[] (2-4)",
          success_criteria: "string[] (2-4)",
          date_window: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" },
        },
      ],
    },
    baseline_example: baseline,
    snapshot,
  };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "text", text: system }] },
        { role: "user", content: [{ type: "text", text: JSON.stringify(user) }] },
      ],
      temperature: 0.4,
      max_output_tokens: 2600,
    }),
  });

  if (!resp.ok) return null;

  const data: unknown = await resp.json();
  if (!isJsonObject(data)) return null;

  const output = Array.isArray(data.output) ? data.output : null;
  if (!output) return null;

  let text: string | null = null;
  for (const item of output) {
    if (!isJsonObject(item)) continue;
    const content = Array.isArray(item.content) ? item.content : null;
    if (!content) continue;

    for (const c of content) {
      if (!isJsonObject(c)) continue;
      if (c.type === "output_text" && typeof c.text === "string") {
        text = c.text;
        break;
      }
    }
    if (text) break;
  }

  if (!text) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  return normalizeDisplay(parsed);
}

export async function handlePlan3mRecompute(req: Request) {
  const internalKey = req.headers.get("x-internal-key") || "";
  if (!process.env.INTERNAL_API_KEY || internalKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Server misconfigured: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = (await req.json()) as { client_id?: string; reason?: string };
    const client_id = body?.client_id;
    const reason = body?.reason ?? "session_upload";

    if (!client_id) {
      return NextResponse.json({ error: "client_id is required" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // 1) Read current active plan pointer (authoritative)
    const { data: cap, error: capErr } = await supabase
      .from("client_active_plans")
      .select("active_plan3m_id")
      .eq("client_id", client_id)
      .single();

    if (capErr) {
      return NextResponse.json({ error: "failed to read client_active_plans", details: capErr.message }, { status: 500 });
    }

    const prevPlanId = (cap?.active_plan3m_id as string | null | undefined) ?? null;

    // 2) Validate pointer row exists (NULL / invalid pointers bootstrap a new plan)
    let prevDisplayRaw: unknown = null;
    let prevPlanIdValid = false;

    if (prevPlanId) {
      const { data: prevRow, error: prevErr } = await supabase
        .from("coaching_versions")
        .select("content_json")
        .eq("id", prevPlanId)
        .maybeSingle();

      if (!prevErr && prevRow && isJsonObject(prevRow) && "content_json" in prevRow) {
        const content = (prevRow as { content_json?: unknown }).content_json;
        if (isJsonObject(content)) {
          prevPlanIdValid = true;
          prevDisplayRaw = content.display ?? null;
        }
      }
    }

    // 3) Pull latest session_stats snapshot (may be null; no regression)
    const { data: statRow } = await supabase
      .from("session_stats")
      .select("stats_json, created_at")
      .eq("client_id", client_id)
      .eq("stat_type", "snapshot")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const stats_json: Json | null =
      statRow && isJsonObject(statRow) && "stats_json" in statRow ? ((statRow as { stats_json?: unknown }).stats_json as Json) : null;

    // 3a) Extract handicap (if present) WITHOUT schema changes
    const handicap = getNumberDeep(stats_json, [
      "player_profile.handicap",
      "profile.handicap",
      "handicap",
      "golf.handicap",
    ]);

    const skill_tier = deriveSkillTier(handicap);

    // 4) Compute next version_index for plan3m thread (anchor session_id + schema_version)
    const { data: latestPlan, error: latestErr } = await supabase
      .from("coaching_versions")
      .select("version_index")
      .eq("client_id", client_id)
      .eq("session_id", PLAN3M_ANCHOR_SESSION_ID)
      .eq("content_json->>schema_version", PLAN3M_SCHEMA_VERSION)
      .order("version_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) {
      return NextResponse.json({ error: "failed to compute next version_index", details: latestErr.message }, { status: 500 });
    }

    const nextVersionIndex = (typeof latestPlan?.version_index === "number" ? latestPlan.version_index : 0) + 1;

    // 5) Deterministic baseline display (tier-aware)
    const baseline = generateBaselineDisplay({ tier: skill_tier, handicap });

    // If prior plan had a valid display payload, we can carry it forward as a fallback.
    const prevDisplay = prevDisplayRaw ? normalizeDisplay(prevDisplayRaw) : null;

    // 6) Deterministic inputs snapshot + hash (no schema changes)
    const inputs_snapshot: Record<string, Json> = {
      schema_version: PLAN3M_SCHEMA_VERSION,
      client_id,
      now_iso: nowIso,
      reason,
      previous_plan_id: prevPlanIdValid ? prevPlanId : null,
      player_profile: { handicap, skill_tier },
      latest_session_stats_snapshot: stats_json,
    };

    const inputs_hash = sha256Hex(JSON.stringify(inputs_snapshot));

    // 7) Optional AI generation
    const allowAi = !!process.env.OPENAI_API_KEY && process.env.PLAN3M_USE_AI !== "false";
    const model = process.env.PLAN3M_OPENAI_MODEL || "gpt-4.1-mini";

    let display: Plan3mDisplay = baseline;
    let generatedBy: "openai" | "system" = "system";

    if (allowAi && process.env.OPENAI_API_KEY) {
      const ai = await callOpenAIForPlan({
        apiKey: process.env.OPENAI_API_KEY,
        model,
        snapshot: inputs_snapshot,
        baseline,
        tier: skill_tier,
      });

      if (ai) {
        display = ai;
        generatedBy = "openai";
      } else if (prevDisplay) {
        display = prevDisplay;
      }
    } else if (prevDisplay) {
      display = prevDisplay;
    }

    // 8) content_json payload
    const content_json = {
      schema_version: PLAN3M_SCHEMA_VERSION,
      display,
      inputs_snapshot,
      inputs_hash,
      recompute_triggered_at: nowIso,
      previous_plan_id: prevPlanIdValid ? prevPlanId : null,
      meta: { generated_by: generatedBy, reason, bootstrap: !prevPlanIdValid, skill_tier },
    };

    // 9) data_hash (NOT NULL) - stable + does not depend on full content_json
    const data_hash = sha256Hex(
      JSON.stringify({
        client_id,
        session_id: PLAN3M_ANCHOR_SESSION_ID,
        schema_version: PLAN3M_SCHEMA_VERSION,
        previous_plan_id: prevPlanIdValid ? prevPlanId : null,
        reason,
        inputs_hash,
      })
    );

    // 10) Append new plan version row
    const { data: newCv, error: insErr } = await supabase
      .from("coaching_versions")
      .insert({
        client_id,
        session_id: PLAN3M_ANCHOR_SESSION_ID,
        version_index: nextVersionIndex,
        generated_by: generatedBy,
        reason,
        content_json,
        data_hash,
      })
      .select("id")
      .single();

    if (insErr || !newCv?.id) {
      return NextResponse.json(
        { error: "failed to write coaching_versions (plan3m)", details: insErr?.message ?? "no_id_returned" },
        { status: 500 }
      );
    }

    // 11) Move pointer
    const { error: updErr } = await supabase
      .from("client_active_plans")
      .update({ active_plan3m_id: newCv.id, plan3m_touched_at: nowIso, updated_at: nowIso })
      .eq("client_id", client_id);

    if (updErr) {
      return NextResponse.json({ error: "failed to update client_active_plans", details: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      client_id,
      previous_plan_id: prevPlanIdValid ? prevPlanId : null,
      new_plan_id: newCv.id,
      version_index: nextVersionIndex,
      touched_at: nowIso,
      ai_used: generatedBy === "openai",
      inputs_hash,
      skill_tier,
      handicap,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json({ error: "Unhandled error", details: msg }, { status: 500 });
  }
}
