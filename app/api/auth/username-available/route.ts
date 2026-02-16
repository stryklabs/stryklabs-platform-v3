import { jsonOk, jsonErr } from "@/app/api/_lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await getSupabaseServer();
  const body = await req.json().catch(() => ({}));
  const username = String(body?.username ?? "").trim().toLowerCase();

  if (!/^[a-z0-9_]{3,20}$/.test(username)) return jsonErr(400, "Invalid username");

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .limit(1);

  if (error) return jsonErr(500, error.message);

  return jsonOk({ available: (data?.length ?? 0) === 0 });
}
