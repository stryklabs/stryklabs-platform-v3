import { requireUser, jsonErr } from "../../_lib/auth";

export async function GET() {
  const { res } = await requireUser();
  if (res) return res;

  return jsonErr(501, "Upload sessions listing not implemented yet.");
}
