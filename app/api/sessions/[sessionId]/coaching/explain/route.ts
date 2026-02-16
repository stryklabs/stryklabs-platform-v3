import { requireClient, jsonErr } from "@/app/api/_lib/auth";

export async function GET(_req: Request, _ctx: { params: Promise<{ sessionId: string }> }) {
  const { res } = await requireClient();
  if (res) return res;

  return jsonErr(501, "Explain not implemented yet");
}
