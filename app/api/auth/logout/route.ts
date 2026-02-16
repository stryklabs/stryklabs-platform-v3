import { jsonOk } from "../../_lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await getSupabaseServer();
  await supabase.auth.signOut().catch(() => null);
  return jsonOk({});
}
