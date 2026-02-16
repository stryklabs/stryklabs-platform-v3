import { requireAdmin, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function POST(req: Request) {
  const { supabase, userId, res } = await requireAdmin();
  if (res) return res;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!name) return jsonErr(400, "Missing name");

  const { data, error } = await supabase
    .from("clients")
    .insert({ name, owner_user_id: userId })
    .select("id, name, created_at, player_user_id")
    .maybeSingle();

  if (error) return jsonErr(500, error.message);

  return jsonOk({ client: data });
}
