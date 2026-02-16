import { requireClient, jsonErr } from "@/app/api/_lib/auth";

export async function GET(_req: Request, _ctx: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireClient();
  if ("res" in auth && !("supabase" in auth)) return auth.res;
return jsonErr(501, "Explain not implemented yet");
}
