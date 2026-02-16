import { requireUser, jsonErr } from "@/app/api/_lib/auth";

export async function GET() {
  const auth = await requireUser();
  if (!("supabase" in auth)) return auth.res;
  return jsonErr(501, "Upload sessions listing not implemented yet.");
}
