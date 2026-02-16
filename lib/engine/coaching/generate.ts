import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { calcCostUsd } from "@/lib/ai/pricing";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const INTERNAL_COACHING_GENERATE_TEMPERATURE = 0.4;

type CoachingOutput = {
  summary: string;
  priorities: Array<{ title: string; why: string }>;
  drills: Array<{
    name: string;
    steps: string[];
    reps: string;
    frequency: string;
    success_metric: string;
  }>;
  next_session_targets: Array<{ target: string; measure: string }>;
};

/**
 * Phase 0 canonical engine entrypoint for internal coaching generation.
 * Owns provider calls, prompt construction, caching, telemetry, and persistence.
 */
export async function handleInternalCoachingGenerate(req: NextRequest) {
  // Variables we may want in catch/telemetry
  let session_id: string | null = null;
  let client_id: string | null = null;

  try {
    // 1) Secret gate (internal only)
    const secret = req.headers.get("x-coaching-secret");
    if (!process.env.COACHING_GENERATE_SECRET || secret !== process.env.COACHING_GENERATE_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const t0 = Date.now();
    const requestId = crypto.randomUUID();
    const route = "internal";

    const openAiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Supabase client can be created early; service role bypasses RLS
    const supabase = createClient(supabaseUrl || "", serviceKey || "");

    const safeTelemetry = async (row: Record<string, any>) => {
      try {
        if (!supabaseUrl || !serviceKey) return;
        const s = createClient(supabaseUrl, serviceKey);
        await s.from("coaching_telemetry").insert(row);
      } catch {
        // never break user flow
      }
    };

    if (!openAiKey) {
      await safeTelemetry({
        request_id: requestId,
        route,
        cache_status: "miss",
        status: "error",
        duration_ms: Date.now() - t0,
        error_code: "env_missing",
        error_message: "Missing OPENAI_API_KEY",
      });
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    if (!supabaseUrl || !serviceKey) {
      await safeTelemetry({
        request_id: requestId,
        route,
        cache_status: "miss",
        status: "error",
        duration_ms: Date.now() - t0,
        error_code: "env_missing",
        error_message: "Missing Supabase env vars",
      });
      return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey: openAiKey });

    // Input
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    session_id = (body?.session_id ?? null) as string | null;
    const force = Boolean(body?.force);

    if (!session_id) {
      await safeTelemetry({
        request_id: requestId,
        route,
        cache_status: "miss",
        status: "error",
        duration_ms: Date.now() - t0,
        error_code: "bad_request",
        error_message: "session_id is required",
      });
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }

    // 2) Resolve client_id from sessions table
    const { data: sessRow, error: sessErr } = await supabase
      .from("sessions")
      .select("client_id")
      .eq("id", session_id)
      .maybeSingle();

    if (sessErr || !sessRow?.client_id) {
      await safeTelemetry({
        request_id: requestId,
        route,
        cache_status: "miss",
        status: "error",
        duration_ms: Date.now() - t0,
        error_code: "session_not_found",
        error_message: "session not found",
        session_id,
      });
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }

    client_id = sessRow.client_id as string;

    // 3) Load session_stats (required)
    const { data: statsRow, error: statsErr } = await supabase
      .from("session_stats")
      .select("data_hash, stats_json")
      .eq("session_id", session_id)
      .maybeSingle();

    if (statsErr || !statsRow) {
      await safeTelemetry({
        request_id: requestId,
        route,
        cache_status: "miss",
        status: "error",
        client_id,
        session_id,
        duration_ms: Date.now() - t0,
        error_code: "stats_missing",
        error_message: "session_stats not found",
      });
      return NextResponse.json({ error: "session_stats not found" }, { status: 404 });
    }

    await safeTelemetry({
      request_id: requestId,
      route,
      cache_status: "miss",
      status: "ok",
      client_id,
      session_id,
      duration_ms: Date.now() - t0,
      event: "stats_loaded",
    });

    // 3b) Load most recent published coaching for continuity
    const { data: prevCoaching } = await supabase
      .from("session_coaching")
      .select("session_id, snapshot_hash, coaching_version, output_json, created_at")
      .eq("client_id", client_id)
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4) Cache lookup
    const { data: existing } = await supabase
      .from("coaching_summary")
      .select("content_json, content_md, data_hash")
      .eq("client_id", client_id)
      .eq("session_id", session_id)
      .maybeSingle();

    // 4b) Latest coaching version
    const { data: lastVersion } = await supabase
      .from("coaching_versions")
      .select("version_index, data_hash, reason, created_at, content_json, content_md")
      .eq("client_id", client_id)
      .eq("session_id", session_id)
      .order("version_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    // internal route never honors "force" (regen is admin-only)

    // Cache hit path
    {
      if (lastVersion && (lastVersion as any).data_hash === (statsRow as any).data_hash) {
        const content_json = (existing as any)?.content_json ?? (lastVersion as any).content_json;
        const content_md = (existing as any)?.content_md ?? (lastVersion as any).content_md;

        // Self-heal cache
        if (!existing && content_json && content_md) {
          await supabase.from("coaching_summary").upsert({
            client_id,
            session_id,
            data_hash: (lastVersion as any).data_hash,
            content_json,
            content_md,
          });
        }

        await safeTelemetry({
          request_id: requestId,
          route,
          cache_status: "hit",
          status: "ok",
          client_id,
          session_id,
          duration_ms: Date.now() - t0,
        });

        // Persist coaching to session_coaching (even on cache hit)
        await supabase.from("session_coaching").upsert(
          {
            session_id,
            client_id,
            snapshot_hash: (lastVersion as any).data_hash,
            data_hash: (lastVersion as any).data_hash,
            coaching_version: (lastVersion as any).version_index,
            is_published: true,
            prompt_hash: crypto.createHash("sha256").update("cache").digest("hex"),
            model: null,
            temperature: null,
            input_json: (statsRow as any).stats_json,
            output_json: content_json,
            status: "ready",
            error: null,
            created_at: new Date().toISOString(),
          },
          { onConflict: "session_id" }
        );

        return NextResponse.json({
          cached: true,
          content_json,
          content_md,
          meta: {
            version_index: (lastVersion as any).version_index,
            reason: (lastVersion as any).reason,
            created_at: (lastVersion as any).created_at,
          },
        });
      }

      if (existing && (existing as any).data_hash === (statsRow as any).data_hash) {
        await safeTelemetry({
          request_id: requestId,
          route,
          cache_status: "hit",
          status: "ok",
          client_id,
          session_id,
          duration_ms: Date.now() - t0,
        });

        await supabase.from("session_coaching").upsert(
          {
            session_id,
            client_id,
            snapshot_hash: (existing as any).data_hash,
            data_hash: (existing as any).data_hash,
            coaching_version: (lastVersion as any)?.version_index ?? 0,
            is_published: true,
            prompt_hash: crypto.createHash("sha256").update("cache").digest("hex"),
            model: null,
            temperature: null,
            input_json: (statsRow as any).stats_json,
            output_json: (existing as any).content_json,
            status: "ready",
            error: null,
            created_at: new Date().toISOString(),
          },
          { onConflict: "session_id" }
        );

        return NextResponse.json({
          cached: true,
          content_json: (existing as any).content_json,
          content_md: (existing as any).content_md,
        });
      }
    }

    // Force: delete existing cached row
    if (force && existing) {
      await supabase.from("coaching_summary").delete().eq("client_id", client_id).eq("session_id", session_id);
    }

    // 5) OpenAI (JSON mode)
    const systemPrompt = `
You are a professional golf performance coach.

Your job is to analyse session statistics and return actionable coaching advice.

You MUST return valid JSON with exactly this shape:

{
  "summary": "string",
  "priorities": [
    { "title": "string", "why": "string" },
    { "title": "string", "why": "string" },
    { "title": "string", "why": "string" }
  ],
  "drills": [
    {
      "name": "string",
      "frequency": "string",
      "reps": "string",
      "success_metric": "string",
      "steps": ["string","string","string"]
    },
    {
      "name": "string",
      "frequency": "string",
      "reps": "string",
      "success_metric": "string",
      "steps": ["string","string","string"]
    },
    {
      "name": "string",
      "frequency": "string",
      "reps": "string",
      "success_metric": "string",
      "steps": ["string","string","string"]
    }
  ],
  "next_session_targets": [
    { "target": "string", "measure": "string" },
    { "target": "string", "measure": "string" },
    { "target": "string", "measure": "string" }
  ]
}

Rules:
- priorities MUST contain 3 items
- drills MUST contain 3 items
- next_session_targets MUST contain 3 items
- steps MUST contain at least 3 strings per drill
- All fields must be present, never null
`.trim();

    const inputContext = {
      session_id,
      client_id,
      snapshot_hash: (statsRow as any).data_hash,
      stats_json: (statsRow as any).stats_json,
      previous_published_coaching: prevCoaching
        ? {
            session_id: (prevCoaching as any).session_id,
            snapshot_hash: (prevCoaching as any).snapshot_hash,
            coaching_version: (prevCoaching as any).coaching_version,
            created_at: (prevCoaching as any).created_at,
            output_json: (prevCoaching as any).output_json,
          }
        : null,
    };

    const userPrompt = `Context (JSON):\n${JSON.stringify(inputContext, null, 2)}`;

    const model = "gpt-4o-mini";

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: INTERNAL_COACHING_GENERATE_TEMPERATURE,
    });

    const modelUsed = completion.model ?? model;
    const usage = completion.usage;

    let contentText = completion.choices?.[0]?.message?.content ?? "";
    if (!contentText) contentText = "{}";

    let contentJson: CoachingOutput;
    try {
      contentJson = JSON.parse(contentText) as CoachingOutput;
    } catch {
      throw new Error("Invalid JSON returned by OpenAI");
    }

    const content_md = [
      `# Coaching`,
      ``,
      `## Summary`,
      `${contentJson.summary ?? ""}`,
      ``,
      `## Priorities`,
      ...(contentJson.priorities ?? []).map((p) => `- **${p.title}** — ${p.why}`),
      ``,
      `## Drills`,
      ...(contentJson.drills ?? []).flatMap((d) => [
        `### ${d.name}`,
        `- Frequency: ${d.frequency}`,
        `- Reps: ${d.reps}`,
        `- Success metric: ${d.success_metric}`,
        `- Steps:`,
        ...(d.steps ?? []).map((s) => `  - ${s}`),
        ``,
      ]),
      `## Next session targets`,
      ...(contentJson.next_session_targets ?? []).map((t) => `- **${t.target}** — ${t.measure}`),
      ``,
    ].join("\n");

    // 6) Telemetry (success)
    await safeTelemetry({
      request_id: requestId,
      route,
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

    const requestedReason = typeof body?.reason === "string" ? body.reason : null;
    const reason = requestedReason ?? (force && existing ? "manual_regen" : existing ? "data_change" : "initial");

    const nextVersionIndex = ((lastVersion as any)?.version_index ?? 0) + 1;

    const { error: verErr } = await supabase.from("coaching_versions").insert({
      client_id,
      session_id,
      data_hash: (statsRow as any).data_hash,
      content_json: contentJson,
      content_md,
      reason,
    });
    if (verErr) throw verErr;

    // Deterministic prompt hash
    const prompt_hash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ model, temperature: INTERNAL_COACHING_GENERATE_TEMPERATURE, systemPrompt, userPrompt }))
      .digest("hex");

    // Next coaching version for this session + snapshot hash
    const { data: maxRow } = await supabase
      .from("session_coaching")
      .select("coaching_version")
      .eq("session_id", session_id)
      .eq("snapshot_hash", (statsRow as any).data_hash)
      .order("coaching_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = ((maxRow as any)?.coaching_version ?? 0) + 1;

    // Ensure only one published coaching per session
    await supabase.from("session_coaching").update({ is_published: false }).eq("session_id", session_id).eq("is_published", true);

    await supabase.from("session_coaching").insert({
      session_id,
      client_id,
      snapshot_hash: (statsRow as any).data_hash,
      data_hash: (statsRow as any).data_hash,
      coaching_version: nextVersion,
      is_published: true,
      prompt_hash,
      model: modelUsed,
      temperature: INTERNAL_COACHING_GENERATE_TEMPERATURE,
      input_json: inputContext,
      output_json: contentJson,
      status: "ready",
      error: null,
      created_at: new Date().toISOString(),
    });

    // 7) Upsert cache
    await supabase.from("coaching_summary").upsert({
      client_id,
      session_id,
      version_index: nextVersionIndex,
      data_hash: (statsRow as any).data_hash,
      content_json: contentJson,
      content_md,
    });

    await supabase.from("session_coaching").upsert(
      {
        session_id,
        client_id,
        snapshot_hash: (statsRow as any).data_hash,
        data_hash: (statsRow as any).data_hash,
        coaching_version: nextVersionIndex,
        is_published: true,
        prompt_hash: crypto
          .createHash("sha256")
          .update(`${modelUsed}|${INTERNAL_COACHING_GENERATE_TEMPERATURE}|${systemPrompt}`)
          .digest("hex"),
        model: modelUsed,
        temperature: INTERNAL_COACHING_GENERATE_TEMPERATURE,
        input_json: (statsRow as any).stats_json,
        output_json: contentJson,
        status: "ready",
        error: null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    );

    return NextResponse.json({
      cached: false,
      content_json: contentJson,
      content_md,
      meta: {
        reason,
      },
    });
  } catch (e: any) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && serviceKey && session_id && client_id) {
        const supabase = createClient(supabaseUrl, serviceKey);
        await supabase.from("coaching_telemetry").insert({
          request_id: crypto.randomUUID(),
          route: "internal",
          cache_status: "miss",
          status: "error",
          client_id,
          session_id,
          error_code: "unhandled_error",
          error_message: (e?.message ?? "Unknown error").toString().slice(0, 300),
        });
      }
    } catch {
      // swallow
    }

    return NextResponse.json(
      { error: (e?.message ?? "Unknown error").toString() },
      { status: 500 }
    );
  }
}
