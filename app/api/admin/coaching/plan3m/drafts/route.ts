import { requireAdmin, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!("supabase" in auth)) return auth.res;
  const { supabase } = auth;
const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  const limit = Number(url.searchParams.get("limit") ?? 50);
  if (!clientId) return jsonErr(400, "Missing client_id");

  const { data: drafts, error } = await supabase
    .from("coaching_versions")
    .select("id, version_index, created_at")
    .eq("client_id", clientId)
    .eq("reason", "initial")
    .order("created_at", { ascending: false })
    .limit(Number.isFinite(limit) ? limit : 50);

  if (error) return jsonErr(500, error.message);

  return jsonOk({ drafts: drafts ?? [] });
}
