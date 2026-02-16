import { requireClient, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function POST(req: Request) {
  const { supabase, clientId, res } = await requireClient();
  if (res) return res;

  const body = await req.json().catch(() => ({}));
  const guidanceId = String(body?.guidance_id ?? "").trim();
  const decision = String(body?.decision ?? "").trim();

  if (!guidanceId) return jsonErr(400, "Missing guidance_id");
  if (decision !== "accepted" && decision !== "declined") return jsonErr(400, "Invalid decision");

  const { data: g, error: gErr } = await supabase
    .from("plan_guidance_versions")
    .select("id, client_id")
    .eq("id", guidanceId)
    .maybeSingle();

  if (gErr) return jsonErr(500, gErr.message);
  if (!g || String((g as any).client_id) !== String(clientId)) return jsonErr(404, "Guidance not found");

  const { error } = await supabase.from("plan_guidance_decisions").insert({
    guidance_id: guidanceId,
    actor_client_id: clientId,
    decision,
    note: body?.note ?? null,
  });

  if (error) return jsonErr(500, error.message);

  return jsonOk({});
}
