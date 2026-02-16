import { requireUser, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function GET() {
  const { supabase, userId, res } = await requireUser();
  if (res) return res;

  const { data: u, error } = await supabase.auth.getUser();
  if (error || !u?.user) return jsonErr(401, "Unauthorized");

  // Profile is optional; do not fail if missing
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  return jsonOk({
    user: { id: u.user.id, email: u.user.email ?? null },
    profile: profile ?? null,
  });
}
