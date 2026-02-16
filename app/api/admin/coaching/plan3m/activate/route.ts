import { requireAdmin, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!("supabase" in auth)) return auth.res;

  const { supabase } = auth;

  const body = await req.json().catch(() => ({}));
  const planId = body?.planId ?? body?.id ?? null;

  if (!planId) return jsonErr(400, "missing_planId");

  // Minimal activation: mark selected plan active and others inactive.
  // (No guessing beyond this; assumes coaching_plans table exists and supports active flag.)
  const { error: deactivateErr } = await supabase
    .from("coaching_plans")
    .update({ active: false })
    .eq("duration", "3m");

  if (deactivateErr)
    return jsonErr(500, "deactivate_failed", { detail: deactivateErr.message });

  const { data, error: activateErr } = await supabase
    .from("coaching_plans")
    .update({ active: true })
    .eq("id", planId)
    .select("*")
    .single();

  if (activateErr)
    return jsonErr(500, "activate_failed", { detail: activateErr.message });

  return jsonOk({ activePlan: data });
}
