import { requireClient, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireClient();
  if (!("supabase" in auth)) return auth.res;
  const { supabase, clientId } = auth;
const { sessionId } = await ctx.params;
  const clean = String(sessionId).replace(/[^a-f0-9-]/gi, "");

  const { data: row, error } = await supabase
    .from("session_stats")
    .select("session_id, created_at, stats_json")
    .eq("session_id", clean)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return jsonErr(500, error.message);

  return jsonOk(row ?? null);
}
