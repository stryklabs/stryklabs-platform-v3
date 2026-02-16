import { requireUser, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!("supabase" in auth)) return auth.res;
  const { supabase, userId } = auth;
const body = await req.json().catch(() => ({}));

  // Only allow known fields (avoid accidental schema drift)
  const patch: any = {
    id: userId,
  };

  const allow = [
    "username",
    "full_name",
    "handicap",
    "golf_experience",
    "has_home_sim",
    "launch_monitor",
    "client_id",
    "role",
    "is_admin",
  ];

  for (const k of allow) {
    if (k in body) patch[k] = body[k];
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(patch, { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (error) return jsonErr(500, error.message);

  return jsonOk({ profile: data ?? null });
}
