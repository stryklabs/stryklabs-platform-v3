import { requireClient, jsonOk, jsonErr } from "../_lib/auth";

export async function GET(req: Request) {
  const { supabase, clientId, res } = await requireClient();
  if (res) return res;

  const url = new URL(req.url);
  const windowStr = url.searchParams.get("window") ?? "90";
  const windowDays = Number(windowStr);
  const allowed = new Set([30, 60, 90, 180, 365]);
  const days = allowed.has(windowDays) ? windowDays : 90;

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id, session_date, created_at, import_id")
    .eq("client_id", clientId)
    .gte("created_at", cutoff)
    .order("session_date", { ascending: false })
    .limit(200);

  if (error) return jsonErr(500, error.message);

  // shot counts (best-effort)
  const ids = (sessions ?? []).map((s: any) => s.id);
  let countsBySession: Record<string, number> = {};
  if (ids.length) {
    const { data: counts } = await supabase
      .from("shots")
      .select("session_id, id")
      .in("session_id", ids);

    for (const r of counts ?? []) {
      const sid = String((r as any).session_id);
      countsBySession[sid] = (countsBySession[sid] ?? 0) + 1;
    }
  }

  return jsonOk({
    sessions: (sessions ?? []).map((s: any) => ({
      session_id: s.id,
      session_date: s.session_date ?? null,
      created_at: s.created_at ?? null,
      shot_count: countsBySession[String(s.id)] ?? 0,
      import_id: s.import_id ?? null,
    })),
  });
}
