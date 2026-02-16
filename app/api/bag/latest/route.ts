import { requireUser, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function POST(req: Request) {
  const { supabase, userId, res } = await requireUser();
  if (res) return res;

  const body = await req.json().catch(() => ({}));
  const windowDays = Number(body?.window_days ?? 90);
  const allowed = new Set([30, 60, 90, 180]);
  const w = allowed.has(windowDays) ? windowDays : 90;

  const { data: snap, error: sErr } = await supabase
    .from("bag_snapshots")
    .select("*")
    .eq("user_id", userId)
    .eq("window_days", w)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sErr) return jsonErr(500, sErr.message);
  if (!snap) return jsonOk({ snapshot: null, clubs: [] });

  const { data: clubs, error: cErr } = await supabase
    .from("bag_snapshot_clubs")
    .select("*")
    .eq("snapshot_id", snap.id);

  if (cErr) return jsonErr(500, cErr.message);

  return jsonOk({ snapshot: snap, clubs: clubs ?? [] });
}
