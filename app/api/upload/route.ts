import { requireUser, jsonErr } from "@/app/api/_lib/auth";

export async function POST() {
  const auth = await requireUser();
  if (!("supabase" in auth)) return auth.res;
  return jsonErr(501, "Upload ingestion not implemented yet (Phase 1 wiring pending).");
}
