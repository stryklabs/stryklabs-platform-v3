import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { calcCostUsd } from "@/lib/ai/pricing";

type JsonObject = Record<string, unknown>;
type AjvInstance = InstanceType<typeof Ajv>;


const THEME_ENUM = ["dispersion_control","start_line_control","contact_quality","distance_control","face_to_path_control","low_point_control","club_selection_strategy","shot_shape_intent","short_game_proximity","putting_start_line_speed"] as const;
const METRIC_REGISTRY = ["carry_avg","total_distance_avg","ball_speed_avg","club_speed_avg","smash_factor_avg","launch_angle_avg","spin_rate_avg","offline_dispersion_p50","offline_dispersion_p90","start_line_sd","face_to_path_avg","attack_angle_avg","dynamic_loft_avg","fairway_pct","gir_pct","penalty_rate","shot_quality_pct"] as const;

const SESSIONCOACH_V1_SCHEMA: JsonObject = {"$schema":"http://json-schema.org/draft-07/schema#","$id":"https://stryklabs.com/schemas/sessioncoach_v1.json","title":"SessionCoach_V1","type":"object","additionalProperties":false,"required":["session_id","client_id","plan_id","created_at","display","metadata","schema_version"],"properties":{"session_id":{"type":"string","format":"uuid"},"client_id":{"type":"string","format":"uuid"},"plan_id":{"type":"string","format":"uuid"},"created_at":{"type":"string","format":"date-time"},"display":{"type":"object","additionalProperties":false,"required":["session_summary","what_stood_out","what_this_supports","next_session_focus","plan_status"],"properties":{"session_summary":{"type":"string","minLength":1,"maxLength":520},"what_stood_out":{"type":"array","minItems":1,"maxItems":2,"items":{"type":"string","minLength":1,"maxLength":180}},"what_this_supports":{"type":"string","minLength":1,"maxLength":220},"next_session_focus":{"type":"string","minLength":1,"maxLength":220},"plan_status":{"type":"string","enum":["aligned","neutral","review_needed"]}}},"metadata":{"type":"object","additionalProperties":false,"required":["primary_theme","secondary_theme","confidence_delta","plan_alignment","evidence"],"properties":{"primary_theme":{"type":"string","enum":["dispersion_control","start_line_control","contact_quality","distance_control","face_to_path_control","low_point_control","club_selection_strategy","shot_shape_intent","short_game_proximity","putting_start_line_speed"]},"secondary_theme":{"type":["string","null"],"enum":["dispersion_control","start_line_control","contact_quality","distance_control","face_to_path_control","low_point_control","club_selection_strategy","shot_shape_intent","short_game_proximity","putting_start_line_speed",null]},"confidence_delta":{"type":"string","enum":["up","flat","down"]},"plan_alignment":{"type":"string","enum":["aligned","neutral","review_needed"]},"evidence":{"type":"array","minItems":1,"maxItems":3,"items":{"type":"object","additionalProperties":false,"required":["theme_id","signal","metrics_used","note"],"properties":{"theme_id":{"type":"string","enum":["dispersion_control","start_line_control","contact_quality","distance_control","face_to_path_control","low_point_control","club_selection_strategy","shot_shape_intent","short_game_proximity","putting_start_line_speed"]},"signal":{"type":"string","enum":["positive","neutral","negative"]},"metrics_used":{"type":"array","minItems":1,"maxItems":4,"items":{"type":"object","additionalProperties":false,"required":["metric_id","value","baseline","unit"],"properties":{"metric_id":{"type":"string","enum":["carry_avg","total_distance_avg","ball_speed_avg","club_speed_avg","smash_factor_avg","launch_angle_avg","spin_rate_avg","offline_dispersion_p50","offline_dispersion_p90","start_line_sd","face_to_path_avg","attack_angle_avg","dynamic_loft_avg","fairway_pct","gir_pct","penalty_rate","shot_quality_pct"]},"value":{"type":"number"},"baseline":{"type":["number","null"]},"unit":{"type":"string","minLength":1,"maxLength":16}}}},"note":{"type":"string","minLength":1,"maxLength":160}}}}}},"schema_version":{"type":"string","const":"sessioncoach_v1"}}};

type SessionCoachV1 = {
  session_id: string;
  client_id: string;
  plan_id: string;
  created_at: string;
  display: {
    session_summary: string;
    what_stood_out: string[];
    what_this_supports: string;
    next_session_focus: string;
    plan_status: "aligned" | "neutral" | "review_needed";
  };
  metadata: {
    primary_theme: (typeof THEME_ENUM)[number];
    secondary_theme: (typeof THEME_ENUM)[number] | null;
    confidence_delta: "up" | "flat" | "down";
    plan_alignment: "aligned" | "neutral" | "review_needed";
    evidence: Array<{
      theme_id: (typeof THEME_ENUM)[number];
      signal: "positive" | "neutral" | "negative";
      metrics_used: Array<{
        metric_id: (typeof METRIC_REGISTRY)[number];
        value: number;
        baseline: number | null;
        unit: string;
      }>;
      note: string;
    }>;
  };
  schema_version: "sessioncoach_v1";
};

/** Stable deep stringify (key-sorted) for hashing */
function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const norm = (v: unknown): unknown => {
    if (v === null) return null;
    if (typeof v !== "object") return v;
    if (seen.has(v as object)) return "[Circular]";
    seen.add(v as object);

    if (Array.isArray(v)) return v.map(norm);

    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = norm(obj[k]);
    return out;
  };
  return JSON.stringify(norm(value));
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function ajvValidateOrThrow<T>(ajv: AjvInstance, schema: JsonObject, value: unknown, label: string): T {
  const validate = ajv.compile(schema);
  const ok = validate(value);
  if (!ok) {
    const errors = (validate.errors ?? []) as ErrorObject[];
    const msg = errors
      .slice(0, 6)
      .map((e) => `${e.instancePath || "(root)"} ${e.message ?? "invalid"}`)
      .join("; ");
    throw new Error(`${label} failed schema validation: ${msg}`);
  }
  return value as T;
}

function requireSecret(req: Request): boolean {
  const expected = process.env.COACHING_GENERATE_SECRET || "";
  if (!expected) return false;
  const got =
    req.headers.get("x-coaching-generate-secret") ||
    req.headers.get("x-internal-secret") ||
    "";
  return got === expected;
}

function pickActivePlan3mId(row: Record<string, unknown> | null): string | null {
  if (!row) return null;
  const v = row["active_plan3m_id"];
  return typeof v === "string" && v.length >= 16 ? v : null;
}

export async function handlePublicCoachingGenerate(req: Request) {
  const requestId = crypto.randomUUID();
  const t0 = Date.now();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const safeTelemetry = async (row: Record<string, unknown>) => {
    try {
      if (!supabaseUrl || !serviceKey) return;
      const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      await supabase.from("coaching_telemetry").insert(row);
    } catch {
      // never break request
    }
  };

  let session_id: string | null = null;
  let client_id: string | null = null;

  try {
    if (!requireSecret(req)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: false, error: "Missing Supabase env vars" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const openai = new OpenAI({ apiKey: openAiKey });

    // Input (tolerate empty POST body + allow query params)
    let body: Record<string, unknown> = {};
    try {
      const maybe = (await req.json()) as unknown;
      if (maybe && typeof maybe === "object") body = maybe as Record<string, unknown>;
    } catch {
      body = {};
    }
    const { searchParams } = new URL(req.url);

    session_id =
      (typeof body["session_id"] === "string" ? (body["session_id"] as string) : null) ??
      searchParams.get("session_id");

    const force =
      (typeof body["force"] === "boolean" ? (body["force"] as boolean) : null) ??
      (searchParams.get("force") === "true");

    if (!session_id) {
      return NextResponse.json({ ok: false, error: "session_id is required" }, { status: 400 });
    }

    // Resolve client_id from sessions (authoritative)
    const sess = await supabase
      .from("sessions")
      .select("id, client_id")
      .eq("id", session_id)
      .maybeSingle();

    if (sess.error || !sess.data?.client_id) {
      return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });
    }
    client_id = sess.data.client_id as string;

    // Load session snapshot (required)
    const statsQ = await supabase
      .from("session_stats")
      .select("data_hash, stats_json")
      .eq("session_id", session_id)
      .single();

    if (statsQ.error || !statsQ.data) {
      return NextResponse.json({ ok: false, error: "session_stats not found" }, { status: 404 });
    }

    const sessionStats = statsQ.data.stats_json as unknown;
    const snapshot_hash = statsQ.data.data_hash as string;

    // Rolling baseline (last 5 sessions for this client)
    const recentSessionsQ = await supabase
      .from("sessions")
      .select("id, created_at")
      .eq("client_id", client_id)
      .order("created_at", { ascending: false })
      .limit(6);

    const recentIds = (recentSessionsQ.data ?? [])
      .map((r) => (typeof r.id === "string" ? r.id : null))
      .filter((v): v is string => Boolean(v))
      .filter((id) => id !== session_id)
      .slice(0, 5);

    let baselineStats: unknown[] = [];
    if (recentIds.length > 0) {
      const baselineQ = await supabase
        .from("session_stats")
        .select("session_id, stats_json")
        .in("session_id", recentIds);

      baselineStats = (baselineQ.data ?? [])
        .map((r) => (r as { stats_json?: unknown }).stats_json)
        .filter((v): v is unknown => v !== undefined);
    }

    // Active plan pointer
    const activePlanQ = await supabase
      .from("client_active_plans")
      .select("active_plan3m_id")
      .eq("client_id", client_id)
      .maybeSingle();

    const active_plan3m_id = pickActivePlan3mId(
      (activePlanQ.data ?? null) as Record<string, unknown> | null
    );

    if (!active_plan3m_id) {
      return NextResponse.json(
        { ok: false, error: "No active 3-month plan. Create/activate plan3m_v1.1 first." },
        { status: 409 }
      );
    }

    // Load plan JSON
    const planQ = await supabase
      .from("coaching_versions")
      .select("id, content_json")
      .eq("id", active_plan3m_id)
      .maybeSingle();

    const planJson = (planQ.data?.content_json ?? null) as Record<string, unknown> | null;
    const planSchema = planJson ? String(planJson["schema_version"] ?? "") : "";
    if (!planJson || (planSchema !== "plan3m_v1.1" && planSchema !== "plan3m_v1")) {
      return NextResponse.json(
        { ok: false, error: `Active plan pointer is invalid (expected plan3m_v1.1)` },
        { status: 409 }
      );
    }

    const plan_id =
      typeof planJson["plan_id"] === "string" ? (planJson["plan_id"] as string) : active_plan3m_id;

    const planThemes = Array.isArray(planJson["themes"]) ? planJson["themes"] : [];

    // Deterministic prompt hash
    const promptInputs = {
      schema_version: "sessioncoach_v1",
      session_id,
      client_id,
      plan_version_id: active_plan3m_id,
      plan_id,
      snapshot_hash,
      session_stats: sessionStats,
      baseline_stats: baselineStats,
      plan_themes: planThemes,
    };
    const prompt_hash = sha256Hex(stableStringify(promptInputs));

    // Cache check: session_coaching is the client-facing truth layer
    const cachedQ = await supabase
      .from("session_coaching")
      .select("output_json")
      .eq("session_id", session_id)
      .eq("prompt_hash", prompt_hash)
      .eq("status", "ready")
      .maybeSingle();

    if (!force && cachedQ.data?.output_json) {
      await safeTelemetry({
        request_id: requestId,
        route: "coaching_generate_sessioncoach_v1",
        cache_status: "hit",
        status: "ok",
        client_id,
        session_id,
        duration_ms: Date.now() - t0,
      });

      return NextResponse.json({
        ok: true,
        cached: true,
        content_json: cachedQ.data.output_json,
      });
    }

    // OpenAI request contract (System + Developer + User)
    const systemPrompt =
      "You are a conservative, experienced golf coach. Output ONLY valid JSON that matches the provided JSON schema. No markdown, no extra keys.";

    const developerPrompt = {
      schema_version: "sessioncoach_v1",
      theme_enum: THEME_ENUM,
      metric_registry: METRIC_REGISTRY,
      json_schema: SESSIONCOACH_V1_SCHEMA,
      rules: [
        "Do not invent new goals or themes.",
        "Session coaching must reinforce the active plan, never redefine it.",
        "primary_theme and secondary_theme must be theme_ids that exist in the active plan themes provided.",
        "Return JSON only, matching schema exactly.",
      ],
    };

    const userPayload = {
      request_meta: {
        request_id: requestId,
        session_id,
        client_id,
        plan_id,
        plan_version_id: active_plan3m_id,
      },
      session_stats: sessionStats,
      baseline_stats: baselineStats,
      active_plan_themes: planThemes,
    };

    const model = "gpt-4.1-mini";
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "developer", content: JSON.stringify(developerPrompt) },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      response_format: { type: "json_object" },
    });

    const raw = (completion.choices?.[0]?.message?.content ?? "").trim();
    if (!raw) throw new Error("OpenAI returned empty response");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new Error("OpenAI returned non-JSON output");
    }

    // Force authoritative ids (prevents drift)
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      o.session_id = session_id;
      o.client_id = client_id;
      o.plan_id = plan_id;
      o.created_at = new Date().toISOString();
      o.schema_version = "sessioncoach_v1";
      parsed = o;
    }

      // AJV validation
      const ajv = new Ajv({ allErrors: true });
      addFormats(ajv);

      const contentJson = ajvValidateOrThrow<SessionCoachV1>(
          ajv,
          SESSIONCOACH_V1_SCHEMA,
          parsed,
          "sessioncoach_v1"
      );


    // Cross-object constraint: themes subset of plan themes
    const planThemeIds = new Set(
      (planThemes as Array<Record<string, unknown>>)
        .map((t) => (typeof t.theme_id === "string" ? t.theme_id : null))
        .filter((v): v is string => Boolean(v))
    );

    if (!planThemeIds.has(contentJson.metadata.primary_theme)) {
      throw new Error("primary_theme is not present in active plan themes");
    }
    if (contentJson.metadata.secondary_theme && !planThemeIds.has(contentJson.metadata.secondary_theme)) {
      throw new Error("secondary_theme is not present in active plan themes");
    }

    // Next version_index for coaching_versions (per session)
    const maxV = await supabase
      .from("coaching_versions")
      .select("version_index")
      .eq("session_id", session_id)
      .order("version_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextIndex =
      (typeof maxV.data?.version_index === "number" ? (maxV.data.version_index as number) : 0) + 1;

    // Insert immutable history row (schema columns only)
    const ins = await supabase
      .from("coaching_versions")
      .insert({
        client_id,
        session_id,
        version_index: nextIndex,
        reason: force ? "manual_regen" : "data_change_or_miss",
        data_hash: snapshot_hash,
        generated_by: "coaching_generate_sessioncoach_v1",
        content_json: contentJson,
        content_md: null,
      })
      .select("id")
      .single();

    if (ins.error || !ins.data?.id) {
      throw new Error(ins.error?.message || "failed to insert coaching_versions");
    }

    // Upsert client-facing session_coaching row (schema columns only)
    const up = await supabase
      .from("session_coaching")
      .upsert(
        {
          session_id,
          client_id,
          snapshot_hash,
          coaching_version: nextIndex,
          prompt_hash,
          model,
          temperature: null,
          input_json: promptInputs,
          output_json: contentJson,
          status: "ready",
          error: null,
          data_hash: snapshot_hash,
        },
        { onConflict: "session_id" }
      );

    if (up.error) {
      throw new Error(`session_coaching upsert failed: ${up.error.message}`);
    }

    const usage = completion.usage;
    const modelUsed = completion.model ?? model;

    await safeTelemetry({
      request_id: requestId,
      route: "coaching_generate_sessioncoach_v1",
      cache_status: "miss",
      status: "ok",
      client_id,
      session_id,
      duration_ms: Date.now() - t0,
      model: modelUsed,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      total_tokens: usage?.total_tokens ?? null,
      cost_usd: calcCostUsd(modelUsed, usage?.prompt_tokens, usage?.completion_tokens),
    });

    return NextResponse.json({
      ok: true,
      cached: false,
      coaching_version_id: ins.data.id,
      content_json: contentJson,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";

    await safeTelemetry({
      request_id: requestId,
      route: "coaching_generate_sessioncoach_v1",
      cache_status: "miss",
      status: "error",
      client_id,
      session_id,
      duration_ms: Date.now() - t0,
      error_code: "unhandled_error",
      error_message: msg.slice(0, 300),
    });

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
