import { requireClient, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function GET() {
  const auth = await requireClient();
  if (!("supabase" in auth)) return auth.res;
  const { supabase, clientId } = auth;
const { data: active, error } = await supabase
    .from("client_active_plans")
    .select("active_plan6m_id")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) return jsonErr(500, error.message);

  const activeId = active?.active_plan6m_id ?? null;
  if (!activeId) return jsonOk({ has_active_plan: false, active_plan6m_id: null, plan: null });

  const { data: plan, error: pErr } = await supabase
    .from("coaching_versions")
    .select("*")
    .eq("id", activeId)
    .maybeSingle();

  if (pErr) return jsonErr(500, pErr.message);

  return jsonOk({ has_active_plan: true, active_plan6m_id: activeId, plan: plan ?? null });
}
