import { requireClient, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireClient();
  if (!("supabase" in auth)) return auth.res;
  const { supabase, clientId } = auth;
const { sessionId } = await ctx.params;
  const clean = String(sessionId).replace(/[^a-f0-9-]/gi, "");

  // ensure session belongs to client
  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("id, import_id")
    .eq("id", clean)
    .eq("client_id", clientId)
    .maybeSingle();

  if (sErr) return jsonErr(500, sErr.message);
  if (!session) return jsonErr(404, "Session not found");

  const { data: shots, error } = await supabase
    .from("shots")
    .select("id, shot_number, carry, total, side, ball_speed, club_speed, launch_angle, back_spin, side_spin, club, created_at")
    .eq("session_id", clean)
    .order("shot_number", { ascending: true });

  if (error) return jsonErr(500, error.message);

  return jsonOk({ shots: shots ?? [] });
}
