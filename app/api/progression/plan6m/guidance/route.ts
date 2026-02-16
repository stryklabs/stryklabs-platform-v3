import { requireClient, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function GET() {
  const { supabase, clientId, res } = await requireClient();
  if (res) return res;

  const { data: active, error } = await supabase
    .from("client_active_plans")
    .select("active_plan6m_id")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) return jsonErr(500, error.message);

  const activePlanId = active?.active_plan6m_id ?? null;
  if (!activePlanId) {
    return jsonOk({ has_active_plan: false, active_plan_id: null, guidance: [], decisions_by_guidance_id: {} });
  }

  const { data: guidance, error: gErr } = await supabase
    .from("plan_guidance_versions")
    .select("id, week_start, week_end, title, rationale, proposed_changes, created_at, created_by")
    .eq("client_id", clientId)
    .eq("plan_version_id", activePlanId)
    .eq("plan_kind", "plan6m")
    .eq("status", "active")
    .order("week_start", { ascending: true });

  if (gErr) return jsonErr(500, gErr.message);

  const gids = (guidance ?? []).map((g: any) => g.id);
  let decisionsBy: Record<string, any> = {};

  if (gids.length) {
    const { data: decs } = await supabase
      .from("plan_guidance_decisions")
      .select("guidance_id, decision, created_at, note")
      .eq("actor_client_id", clientId)
      .in("guidance_id", gids)
      .order("created_at", { ascending: false });

    for (const d of decs ?? []) {
      const gid = String((d as any).guidance_id);
      if (!(gid in decisionsBy)) decisionsBy[gid] = {
        guidance_id: gid,
        decision: (d as any).decision,
        created_at: (d as any).created_at,
        note: (d as any).note ?? null,
      };
    }
  }

  return jsonOk({
    has_active_plan: true,
    active_plan_id: activePlanId,
    guidance: guidance ?? [],
    decisions_by_guidance_id: decisionsBy,
  });
}
