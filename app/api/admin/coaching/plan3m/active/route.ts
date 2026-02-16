import { requireAdmin, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("res" in auth && !("supabase" in auth)) return auth.res;
  const { supabase } = auth;
const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  if (!clientId) return jsonErr(400, "Missing client_id");

  const { data: active, error } = await supabase
    .from("client_active_plans")
    .select("active_plan3m_id, updated_at, updated_by")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) return jsonErr(500, error.message);

  return jsonOk({ active_plan3m_id: active?.active_plan3m_id ?? null, meta: active ?? null });
}
