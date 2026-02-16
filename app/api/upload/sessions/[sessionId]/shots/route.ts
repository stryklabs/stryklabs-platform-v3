import { requireUser, jsonErr } from "@/app/api/_lib/auth";

export async function GET() {
  const auth = await requireUser();
  if ("res" in auth && !("supabase" in auth)) return auth.res;
return jsonErr(501, "Upload session shots not implemented yet.");
}
