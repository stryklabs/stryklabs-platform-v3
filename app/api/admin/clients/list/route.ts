import { requireAdmin, jsonOk, jsonErr } from "../../_lib/auth";

export async function GET() {
  const { supabase, res } = await requireAdmin();
  if (res) return res;

  const { data, error } = await supabase
    .from("clients")
    .select("id, name, created_at, owner_user_id, player_user_id")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return jsonErr(500, error.message);

  return jsonOk({ clients: data ?? [] });
}
