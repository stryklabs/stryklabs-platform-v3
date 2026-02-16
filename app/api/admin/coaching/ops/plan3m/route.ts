import { requireAdmin, jsonErr } from "@/app/api/_lib/auth";

export async function POST() {
  const auth = await requireAdmin();
  if (!("supabase" in auth)) return auth.res;
  return jsonErr(501, "Coaching ops plan3m generator not implemented yet.");
}
