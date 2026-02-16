import { requireAdmin, jsonOk, jsonErr } from "../../_lib/auth";

export async function GET(req: Request) {
  const { supabase, res } = await requireAdmin();
  if (res) return res;

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  if (!clientId) return jsonErr(400, "Missing client_id");

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id, session_date, created_at, import_id, coaching_status")
    .eq("client_id", clientId)
    .order("session_date", { ascending: false })
    .limit(200);

  if (error) return jsonErr(500, error.message);

  return jsonOk({ sessions: sessions ?? [] });
}
