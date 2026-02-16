import { requireClient, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function GET() {
  const auth = await requireClient();
  if (!("supabase" in auth)) return auth.res;
  const { supabase, clientId } = auth;
const { data: active, error } = await supabase
    .from("client_active_plans")
    .select("active_plan3m_id")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) return jsonErr(500, error.message);

  const planId = active?.active_plan3m_id ?? null;
  if (!planId) return jsonOk({ has_active_plan: false, active_plan_id: null, weeks_with_entries: [] });

  const { data: rows, error: jErr } = await supabase
    .from("plan_week_journal")
    .select("week_number")
    .eq("client_id", clientId)
    .eq("plan_id", planId);

  if (jErr) return jsonErr(500, jErr.message);

  const set = new Set<number>();
  for (const r of rows ?? []) set.add(Number((r as any).week_number));

  return jsonOk({ has_active_plan: true, active_plan_id: planId, weeks_with_entries: Array.from(set).sort((a,b)=>a-b) });
}
