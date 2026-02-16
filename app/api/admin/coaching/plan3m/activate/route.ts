import { requireAdmin, jsonOk, jsonErr } from "../../../_lib/auth";

export async function POST(req: Request) {
  const { supabase, userId, res } = await requireAdmin();
  if (res) return res;

  const body = await req.json().catch(() => ({}));
  const clientId = String(body?.client_id ?? "").trim();
  const versionId = String(body?.version_id ?? "").trim();
  if (!clientId || !versionId) return jsonErr(400, "Missing client_id or version_id");

  // upsert client_active_plans
  const { error } = await supabase.from("client_active_plans").upsert({
    client_id: clientId,
    active_plan3m_id: versionId,
    updated_by: userId,
    plan3m_touched_at: new Date().toISOString(),
  }, { onConflict: "client_id" });

  if (error) return jsonErr(500, error.message);

  return jsonOk({ active_plan3m_id: versionId });
}
