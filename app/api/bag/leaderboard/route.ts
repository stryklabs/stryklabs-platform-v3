import { requireUser, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function POST(req: Request) {
  const auth = await requireUser();
if (!("supabase" in auth)) return auth.res;

const { supabase, userId } = auth;


const body = await req.json().catch(() => ({}));
  const windowDays = Number(body?.window_days ?? 90);
  const allowed = new Set([30, 60, 90, 180]);
  const w = allowed.has(windowDays) ? windowDays : 90;

  // Per-user leaderboard from latest snapshot (best effort)
  const { data: snap, error: sErr } = await supabase
    .from("bag_snapshots")
    .select("id")
    .eq("user_id", userId)
    .eq("window_days", w)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sErr) return jsonErr(500, sErr.message);
  if (!snap) return jsonOk({ rows: [] });

  const { data: clubs, error: cErr } = await supabase
    .from("bag_snapshot_clubs")
    .select("id, club_key, distance_range_json, dispersion_json")
    .eq("snapshot_id", snap.id);

  if (cErr) return jsonErr(500, cErr.message);

  // compute score client-side? UI expects score/dispersion/distance_spread. We'll compute simple metrics from json if present.
  const rows = (clubs ?? []).map((r: any) => {
    const disp = r.dispersion_json?.p50 ?? r.dispersion_json?.dispersion ?? null;
    const dr = r.distance_range_json;
    const p10 = dr?.p10 ?? null;
    const p90 = dr?.p90 ?? null;
    const spread = (p90 != null && p10 != null) ? Number(p90) - Number(p10) : null;
    const score = (disp != null && spread != null) ? (0.7 * Number(disp) + 0.3 * Number(spread)) : null;
    return { id: r.id, club_key: r.club_key, score, dispersion: disp, distance_spread: spread };
  }).filter((r:any)=>r.score!=null).sort((a:any,b:any)=>a.score-b.score).slice(0,50);

  return jsonOk({ rows });
}
