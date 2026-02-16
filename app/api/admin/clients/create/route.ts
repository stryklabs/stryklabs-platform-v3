import { requireAdmin, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!("supabase" in auth)) return auth.res;

  const { supabase, userId } = auth;

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim();
  const name = String(body?.name ?? "").trim();

  if (!email) return jsonErr(400, "missing_email");

  const { data, error } = await supabase
    .from("clients")
    .insert([{ email, name: name || null, created_by: userId }])
    .select("*")
    .single();

  if (error) return jsonErr(500, "insert_failed", { detail: error.message });

  return jsonOk({ client: data });
}
