import { requireUser, jsonErr } from "../_lib/auth";

export async function POST() {
  const { res } = await requireUser();
  if (res) return res;

  return jsonErr(501, "Upload ingestion not implemented yet (Phase 1 wiring pending).");
}
