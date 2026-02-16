/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { calcCostUsd } from "@/lib/ai/pricing";

type JsonObject = Record<string, unknown>;
type AjvInstance = InstanceType<typeof Ajv>;

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// ===== Enum + Schema (authoritative) =====
const THEME_ENUM = [
  "dispersion_control",
  "start_line_control",
  "contact_quality",
  "distance_control",
  "face_to_path_control",
  "low_point_control",
  "club_selection_strategy",
  "shot_shape_intent",
  "short_game_proximity",
  "putting_start_line_speed",
] as const;

const ALLOWED_METRIC_IDS = new Set([
    "carry_avg",
    "total_distance_avg",
    "ball_speed_avg",
    "club_speed_avg",
    "smash_factor_avg",
    "launch_angle_avg",
    "spin_rate_avg",
    "offline_dispersion_p50",
    "offline_dispersion_p90",
    "start_line_sd",
    "face_to_path_avg",
    "attack_angle_avg",
    "dynamic_loft_avg",
    "fairway_pct",
    "gir_pct",
    "penalty_rate",
    "shot_quality_pct",
]);

const PLAN6M_V1_SCHEMA: JsonObject = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://stryklabs.com/schemas/plan6m_v1.json",
  "title": "Plan6M_V1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "plan_id",
    "client_id",
    "created_at",
    "time_window",
    "plan_stability",
    "plan_confidence",
    "themes",
    "what_good_looks_like",
    "schema_version",
  ],
  "properties": {
    "plan_id": { "type": "string", "format": "uuid" },
    "client_id": { "type": "string", "format": "uuid" },
    "created_at": { "type": "string", "format": "date-time" },
    "time_window": {
      "type": "object",
      "additionalProperties": false,
      "required": ["start", "end"],
      "properties": {
        "start": { "type": "string", "format": "date-time" },
        "end": { "type": "string", "format": "date-time" },
      },
    },
    "plan_stability": {
      "type": "string",
      "enum": ["unchanged", "minor_refinement", "reprioritised"],
    },
    "plan_confidence": { "type": "string", "enum": ["low", "medium", "high"] },
    "themes": {
      "type": "array",
      "minItems": 1,
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "theme_id",
          "priority",
          "rationale",
          "progress_metrics",
          "confidence",
          "confidence_label",
        ],
        "properties": {
          "theme_id": { "type": "string", "enum": THEME_ENUM as unknown as string[] },
          "priority": { "type": "integer", "minimum": 1, "maximum": 3 },
          "rationale": { "type": "string", "minLength": 1, "maxLength": 220 },
          "progress_metrics": {
            "type": "array",
            "minItems": 1,
            "maxItems": 4,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["metric_id", "direction", "target_hint"],
              "properties": {
                "metric_id": {
                  "type": "string",
                  "enum": [
                    "carry_avg",
                    "total_distance_avg",
                    "ball_speed_avg",
                    "club_speed_avg",
                    "smash_factor_avg",
                    "launch_angle_avg",
                    "spin_rate_avg",
                    "offline_dispersion_p50",
                    "offline_dispersion_p90",
                    "start_line_sd",
                    "face_to_path_avg",
                    "attack_angle_avg",
                    "dynamic_loft_avg",
                    "fairway_pct",
                    "gir_pct",
                    "penalty_rate",
                    "shot_quality_pct",
                  ],
                },
                "direction": { "type": "string", "enum": ["up", "down", "flat"] },
                "target_hint": { "type": "string", "minLength": 1, "maxLength": 120 },
              },
            },
          },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "confidence_label": { "type": "string", "enum": ["low", "medium", "high"] },
        },
      },
    },
    "what_good_looks_like": {
      "type": "array",
      "minItems": 1,
      "maxItems": 6,
      "items": { "type": "string", "minLength": 1, "maxLength": 160 },
    },
    "change_reason": { "type": ["string", "null"], "maxLength": 220 },
    "schema_version": { "type": "string", "const": "plan6m_v1" },
  },
};

type Plan6mV1 = {
  schema_version: "plan6m_v1";
  [k: string]: unknown;
};

// ===== Helpers =====
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

function ajvValidateOrThrow<T>(
  ajv: AjvInstance,
  schema: JsonObject,
  value: unknown,
  label: string
): T {
  const validate = ajv.compile(schema);
  const ok = validate(value);
  if (!ok) {
    const errors = (validate.errors ?? []) as ErrorObject[];
    const msg = errors
      .slice(0, 8)
      .map((e) => {
        const path = (e as any).instancePath ?? (e as any).dataPath ?? "(root)";
        return `${path} ${e.message ?? "invalid"}`;
      })
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

async function getSupabaseServer() {
  const cookieStore = await (await import("next/headers")).cookies();
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon)
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const { createServerClient } = await import("@supabase/ssr");
  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        cookieStore.set(name, value, options);
      },
      remove(name: string, options: any) {
        cookieStore.set(name, "", { ...options, maxAge: 0 });
      },
    },
  });
}

/**
 * Allow regen either via:
 * - x-coaching-generate-secret (server-to-server), OR
 * - admin cookie session (browser admin)
 */
async function requireSecretOrAdmin(req: Request): Promise<{ userId?: string } | null> {
  if (requireSecret(req)) return {};
  // Cookie-admin path
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;
  if (userErr || !userId) return null;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: prof, error: profErr } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) return null;
  if ((prof as any)?.is_admin !== true) return null;

  return { userId };
}

function toStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function handleAdminPlan6mRegen(req: Request) {
  const requestId = crypto.randomUUID();
  const t0 = Date.now();

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const safeTelemetry = async (row: Record<string, unknown>) => {
    try {
      if (!supabaseUrl || !serviceKey) return;
      const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false },
      });
      await supabase.from("coaching_telemetry").insert(row);
    } catch {
      // never break request
    }
  };

  let client_id: string | null = null;

    try {
        const gate = await requireSecretOrAdmin(req);
        if (!gate) {
            return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const openAiKey = process.env.OPENAI_API_KEY;
        if (!openAiKey) {
            return NextResponse.json(
                { ok: false, error: "Missing OPENAI_API_KEY" },
                { status: 500 }
            );
        }
        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json(
                { ok: false, error: "Missing Supabase env vars" },
                { status: 500 }
            );
        }

        const supabase = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false },
        });
        const openai = new OpenAI({ apiKey: openAiKey });

        // Input:
        // { client_id, reason, mode?: "noop"|"force" } OR { client_id, reason, force?: boolean }
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        client_id = toStringOrNull(body["client_id"]);
        const reason = toStringOrNull(body["reason"]) ?? "admin_plan_regen";
        const modeRaw = toStringOrNull(body["mode"]);
        const force = Boolean(body["force"]) || modeRaw === "force";
        const mode = force ? "force" : "noop";

        if (!client_id) {
            return NextResponse.json(
                { ok: false, error: "client_id is required" },
                { status: 400 }
            );
        }

        // Load current active pointer (strict pointer model; no fallback selection)
        const activePtrQ = await supabase
            .from("client_active_plans")
            .select("active_plan6m_id")
            .eq("client_id", client_id)
            .maybeSingle();

        const active_plan6m_id =
            typeof (activePtrQ.data as any)?.active_plan6m_id === "string"
                ? ((activePtrQ.data as any).active_plan6m_id as string)
                : null;

        // Load recent sessions + snapshots (rolling window). Keep it simple and deterministic.
        const recentSessionsQ = await supabase
            .from("sessions")
            .select("id, created_at")
            .eq("client_id", client_id)
            .order("created_at", { ascending: false })
            .limit(12);

        const recentIds = (recentSessionsQ.data ?? [])
            .map((r: any) => (typeof r.id === "string" ? r.id : null))
            .filter((v: any): v is string => Boolean(v))
            .slice(0, 10);

        let snapshots: unknown[] = [];
        if (recentIds.length > 0) {
            const snapsQ = await supabase
                .from("session_stats")
                .select("session_id, data_hash, stats_json, created_at")
                .in("session_id", recentIds);

            snapshots = (snapsQ.data ?? []).map((r: any) => r);
        }

        if (snapshots.length === 0) {
            return NextResponse.json(
                {
                    ok: false,
                    error:
                        "No session_stats found for this client (need at least 1 session snapshot)",
                },
                { status: 409 }
            );
        }

        // Deterministic input hash for auditing (stored in coaching_versions.data_hash)
        const inputForHash = {
            schema_version: "plan6m_v1",
            client_id,
            snapshots,
            theme_enum: THEME_ENUM,
        };
        const data_hash = sha256Hex(stableStringify(inputForHash));

        // If we have an active plan and mode=noop, allow NOOP regen when data_hash matches.
        // This prevents plan churn by default.
        if (!force && active_plan6m_id) {
            const activePlanQ = await supabase
                .from("coaching_versions")
                .select("id, data_hash, content_json, version_index")
                .eq("id", active_plan6m_id)
                .eq("client_id", client_id)
                .eq("session_id", NIL_UUID)
                .maybeSingle();

            const activeDataHash = toStringOrNull((activePlanQ.data as any)?.data_hash);

            if (activeDataHash && activeDataHash === data_hash) {
                await safeTelemetry({
                    request_id: requestId,
                    route: "admin_plan6m_regen_v1",
                    status: "ok",
                    cache_status: "noop_hit",
                    client_id,
                    duration_ms: Date.now() - t0,
                    mode,
                });

                return NextResponse.json({
                    ok: true,
                    cached: true,
                    cache_kind: "noop_active_same_data_hash",
                    plan_version_id: active_plan6m_id,
                    data_hash,
                    content_json: (activePlanQ.data as any)?.content_json ?? null,
                });
            }
        }

        // OPTIONAL: reuse if same data_hash already exists for plan (unless force)
        if (!force) {
            const existing = await supabase
                .from("coaching_versions")
                .select("id, data_hash, content_json, version_index")
                .eq("client_id", client_id)
                .eq("session_id", NIL_UUID)
                .eq("data_hash", data_hash)
                .order("version_index", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (existing.data?.id) {
                // Ensure pointer is set (idempotent + stabilises active pointer)
                await supabase
                    .from("client_active_plans")
                    .upsert(
                        {
                            client_id,
                            active_plan6m_id: existing.data.id,
                            updated_at: new Date().toISOString(),
                            updated_by: null,
                        },
                        { onConflict: "client_id" }
                    );

                await safeTelemetry({
                    request_id: requestId,
                    route: "admin_plan6m_regen_v1",
                    status: "ok",
                    cache_status: "hit",
                    client_id,
                    duration_ms: Date.now() - t0,
                    mode,
                });

                return NextResponse.json({
                    ok: true,
                    cached: true,
                    cache_kind: "reuse_existing_by_data_hash",
                    plan_version_id: existing.data.id,
                    data_hash,
                    content_json: (existing.data as any).content_json,
                    repointed_from: active_plan6m_id,
                });
            }
        }

        // OpenAI contract: strict JSON only, schema validated.
        const systemPrompt = `
You are an expert golf coach building a 12-week (6-month) improvement plan.
Plans change slowly. Be stable, conservative, and practical.
Use ONLY the provided theme_id enums.
Output MUST be VALID JSON that matches the provided JSON schema.
No markdown. No commentary. No extra keys. Never invent metric_id values; only use those allowed by the schema.

`.trim();

        const developerPrompt = `
THEME_ENUM (authoritative)
${JSON.stringify(THEME_ENUM)}

JSON_SCHEMA (authoritative)
${JSON.stringify(PLAN6M_V1_SCHEMA)}

RULES
- schema_version MUST be "plan6m_v1"
- Use ONLY theme_id values from THEME_ENUM
- Max 3 themes
- Do not reference devices, brands, or UI.
- No free-text new themes.
- progress_metrics.metric_id MUST be one of:
  carry_avg, total_distance_avg, ball_speed_avg, club_speed_avg, smash_factor_avg,
  launch_angle_avg, spin_rate_avg, offline_dispersion_p50, offline_dispersion_p90,
  start_line_sd, face_to_path_avg, attack_angle_avg, dynamic_loft_avg,
  fairway_pct, gir_pct, penalty_rate, shot_quality_pct
- Do NOT invent new metric_id values.
`.trim();

        const userPrompt = `
INPUT
client_id: ${client_id}

session_snapshots (most recent first):
${JSON.stringify(snapshots, null, 2)}

TASK
Regenerate the 6-month plan. Default behaviour is stable: if the existing plan remains valid, output "unchanged".
Return JSON ONLY matching the schema.
`.trim();

        const model = "gpt-4.1-mini";
        const temperature = 0.1;

        const completion = await openai.chat.completions.create({
            model,
            temperature,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "developer", content: developerPrompt },
                { role: "user", content: userPrompt },
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

        // Enforce schema_version + created_at/client_id deterministically
        if (parsed && typeof parsed === "object") {
            const o = parsed as Record<string, unknown>;

            const themes = (o as { themes?: unknown }).themes;
            if (Array.isArray(themes)) {
                for (const theme of themes as Array<Record<string, unknown>>) {
                    const pm = (theme as { progress_metrics?: unknown }).progress_metrics;
                    if (Array.isArray(pm)) {
                        (theme as any).progress_metrics = (pm as Array<{ metric_id?: unknown }>).filter(
                            (m) =>
                                typeof m?.metric_id === "string" && ALLOWED_METRIC_IDS.has(m.metric_id)
                        );
                    }
                }
            }

            parsed = o;
        }


        const ajv = new Ajv({ allErrors: true });
        addFormats(ajv);

        const planJson = ajvValidateOrThrow<Plan6mV1>(
            ajv,
            PLAN6M_V1_SCHEMA,
            parsed,
            "plan6m_v1"
        );

        // Extra guardrail: all theme_ids used must be in THEME_ENUM
        const planThemes = (planJson as any)?.themes;
        if (Array.isArray(planThemes)) {
            for (const t of planThemes) {
                const theme_id = (t as any)?.theme_id;
                if (
                    typeof theme_id === "string" &&
                    !THEME_ENUM.includes(theme_id as any)
                ) {
                    throw new Error(`plan contains invalid theme_id: ${theme_id}`);
                }
            }
        }

        // version_index: next integer for (client_id, session_id=NIL_UUID)
        const maxV = await supabase
            .from("coaching_versions")
            .select("version_index")
            .eq("client_id", client_id)
            .eq("session_id", NIL_UUID)
            .order("version_index", { ascending: false })
            .limit(1)
            .maybeSingle();

        const nextIndex =
            (typeof (maxV.data as any)?.version_index === "number"
                ? (maxV.data as any).version_index
                : 0) + 1;

        // Insert immutable plan row
        const safeReason = (reason || "admin_plan_regen").slice(0, 60);
     

    const ins = await supabase
      .from("coaching_versions")
      .insert({
        client_id,
        session_id: NIL_UUID,
        data_hash,
        version_index: nextIndex,
        reason: active_plan6m_id ? "data_change" : "initial",
        generated_by: "admin_plan6m_regen",
        content_json: planJson,
        content_md: null,
      })
      .select("id")
      .single();

    if (ins.error || !ins.data?.id) {
      throw new Error(
        ins.error?.message || "failed to insert coaching_versions (plan3m)"
      );
    }

    const plan_version_id = ins.data.id as string;

    // NOTE: This route generates an immutable draft only. Activation is a separate admin step.

    const usage = completion.usage;
    const modelUsed = completion.model ?? model;

    await safeTelemetry({
      request_id: requestId,
      route: "admin_plan6m_regen_v1",
      status: "ok",
      cache_status: "miss",
      client_id,
      duration_ms: Date.now() - t0,
      mode,
      model: modelUsed,
      temperature,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      total_tokens: usage?.total_tokens ?? null,
      cost_usd: calcCostUsd(
        modelUsed,
        usage?.prompt_tokens,
        usage?.completion_tokens
      ),
    });

    return NextResponse.json({
      ok: true,
      cached: false,
      mode,
      previous_plan_id: active_plan6m_id,
      plan_version_id,
      data_hash,
      content_json: planJson,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";

    await safeTelemetry({
      request_id: requestId,
      route: "admin_plan6m_regen_v1",
      status: "error",
      client_id,
      duration_ms: Date.now() - t0,
      error_message: msg.slice(0, 300),
    });

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
