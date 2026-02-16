import { requireClient, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function GET(req: Request) {
  const auth = await requireClient();
  if ("res" in auth && !("supabase" in auth)) return auth.res;
  const { supabase, clientId } = auth;
const url = new URL(req.url);
  const weekStr = url.searchParams.get("week_number");
  const weekNum = weekStr ? Number(weekStr) : null;

  const { data: active, error } = await supabase
    .from("client_active_plans")
    .select("active_plan3m_id")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) return jsonErr(500, error.message);

  const planId = active?.active_plan3m_id ?? null;
  if (!planId) return jsonOk({ has_active_plan: false, active_plan_id: null, entries: [] });

  let q = supabase
    .from("plan_week_journal")
    .select("id, week_number, entry, created_at, created_by")
    .eq("client_id", clientId)
    .eq("plan_id", planId)
    .order("created_at", { ascending: false });

  if (weekNum && Number.isFinite(weekNum)) q = q.eq("week_number", weekNum);

  const { data: rows, error: jErr } = await q;

  if (jErr) return jsonErr(500, jErr.message);

  return jsonOk({ has_active_plan: true, active_plan_id: planId, entries: rows ?? [] });
}
