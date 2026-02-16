import { requireAdmin, jsonErr } from "../../../_lib/auth";

export async function POST() {
  const { res } = await requireAdmin();
  if (res) return res;
  return jsonErr(501, "Coaching ops plan3m generator not implemented yet.");
}
