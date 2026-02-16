import { requireClient, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function GET(req: Request) {
  const { supabase, clientId, res } = await requireClient();
  if (res) return res;

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) return jsonErr(400, "Missing session_id");

  const clean = String(sessionId).replace(/[^a-f0-9-]/gi, "");

  // active plan3m (best effort)
  const { data: active } = await supabase
    .from("client_active_plans")
    .select("active_plan3m_id")
    .eq("client_id", clientId)
    .maybeSingle();

  let activePlan3m: any = null;
  if (active?.active_plan3m_id) {
    const { data: planRow } = await supabase
      .from("coaching_versions")
      .select("id, version_index, content_json, content_md, created_at")
      .eq("id", active.active_plan3m_id)
      .maybeSingle();
    activePlan3m = planRow ?? null;
  }

  // sessioncoach (best effort)
  const { data: sessioncoach } = await supabase
    .from("session_coaching")
    .select("*")
    .eq("client_id", clientId)
    .eq("session_id", clean)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return jsonOk({
    request_id: null,
    client_id: clientId,
    session_id: clean,
    active_plan3m: activePlan3m,
    sessioncoach: sessioncoach ?? null,
  });
}
