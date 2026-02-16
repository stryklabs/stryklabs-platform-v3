import { requireAdmin, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!("supabase" in auth)) return auth.res;
  const { supabase } = auth;
const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  const versionId = url.searchParams.get("version_id");
  if (!clientId || !versionId) return jsonErr(400, "Missing client_id or version_id");

  const { data: plan, error } = await supabase
    .from("coaching_versions")
    .select("*")
    .eq("client_id", clientId)
    .eq("id", versionId)
    .maybeSingle();

  if (error) return jsonErr(500, error.message);
  if (!plan) return jsonErr(404, "Version not found");

  return jsonOk({ plan });
}
