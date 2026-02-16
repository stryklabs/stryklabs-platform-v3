import { requireClient, jsonErr, jsonOk } from "@/app/api/_lib/auth";

export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { supabase, clientId, res } = await requireClient();
  if (res) return res;

  const { sessionId } = await ctx.params;
  const clean = String(sessionId).replace(/[^a-f0-9-]/gi, "");

  const { data: row, error } = await supabase
    .from("coaching_versions")
    .select("id, version_index, content_json, content_md, created_at")
    .eq("session_id", clean)
    .eq("client_id", clientId)
    .order("version_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return jsonErr(500, error.message);
  if (!row) return jsonErr(404, "Coaching not available yet");

  return jsonOk({
    status: "ready",
    coaching_version_id: row.id,
    version_index: row.version_index,
    plan: row.content_json,
    content_md: row.content_md ?? null,
    created_at: row.created_at,
  });
}
