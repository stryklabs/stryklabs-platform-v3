import { requireUser, jsonOk, jsonErr } from "@/app/api/_lib/auth";

export async function GET() {
  const { supabase, userId, res } = await requireUser();
  if (res) return res;

  const { data: profile, error: pErr } = await supabase
    .from("bag_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (pErr) return jsonErr(500, pErr.message);

  const { data: rows, error: rErr } = await supabase
    .from("bag_clubs")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (rErr) return jsonErr(500, rErr.message);

  return jsonOk({ bag_profile: profile ?? null, clubs: rows ?? [] });
}

export async function POST(req: Request) {
  const { supabase, userId, res } = await requireUser();
  if (res) return res;

  const body = await req.json().catch(() => ({}));
  const bag_name = typeof body?.bag_name === "string" ? body.bag_name : null;
  const clubs = Array.isArray(body?.clubs) ? body.clubs : null;

  if (!clubs) return jsonErr(400, "Missing clubs[]");

  // upsert bag profile
  const { error: pErr } = await supabase.from("bag_profiles").upsert({ user_id: userId, bag_name }, { onConflict: "user_id" });
  if (pErr) return jsonErr(500, pErr.message);

  // replace clubs (simple approach)
  await supabase.from("bag_clubs").delete().eq("user_id", userId);

  const toInsert = clubs.map((c: any) => ({
    user_id: userId,
    slot: String(c?.slot ?? "").trim(),
    brand: c?.brand ?? null,
    model: c?.model ?? null,
    shaft: c?.shaft ?? null,
    notes: c?.notes ?? null,
    is_active: true,
  })).filter((c:any)=>c.slot.length>0);

  if (toInsert.length) {
    const { error } = await supabase.from("bag_clubs").insert(toInsert);
    if (error) return jsonErr(500, error.message);
  }

  return jsonOk({ saved_at: new Date().toISOString() });
}
