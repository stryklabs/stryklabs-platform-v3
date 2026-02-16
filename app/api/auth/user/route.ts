import { requireUser, jsonErr } from "@/app/api/_lib/auth";

export async function GET() {
  const auth = await requireUser();

  if (!("supabase" in auth)) {
    return auth.res;
  }

  const { supabase, userId } = auth;

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return jsonErr(401, "Unauthorized");
  }

  return Response.json({
    ok: true,
    userId,
    email: data.user.email,
  });
}
