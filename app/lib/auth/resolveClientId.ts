import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileRow = {
  id: string;
  client_id: string | null;
  role: string | null;
  is_admin: boolean | null;
  full_name: string | null;
  username: string | null;
};

export async function getAuthedUserId(supabase: any): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user?.id ?? null;
}

/**
 * Canonical client id resolution:
 * 1) public.profiles.client_id (preferred)
 * 2) fallback to legacy mapping via public.clients.owner_user_id/player_user_id
 * 3) final fallback: userId (legacy sessions.client_id == auth.uid())
 */
export async function resolveClientId(
  supabase: any,
  userId: string
): Promise<{ clientId: string; profile?: ProfileRow | null }> {
  // 1) profiles.client_id
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, client_id, role, is_admin, full_name, username")
      .eq("id", userId)
      .maybeSingle();

    const p = (prof ?? null) as ProfileRow | null;
    if (p?.client_id) return { clientId: String(p.client_id), profile: p };
  } catch {
    // ignore
  }

  // 2) legacy clients mapping
  try {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("id")
      .or(`owner_user_id.eq.${userId},player_user_id.eq.${userId},id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const mappedId =
      clientRow && typeof (clientRow as { id?: unknown }).id !== "undefined"
        ? String((clientRow as { id: unknown }).id)
        : null;

    return { clientId: mappedId ?? userId, profile: null };
  } catch {
    return { clientId: userId, profile: null };
  }
}

export function profileNeedsOnboarding(p: ProfileRow | null | undefined): boolean {
  // IMPORTANT:
  // Middleware must never hard-block users due to missing optional fields.
  // Treat missing profile rows as "not onboarded" only inside onboarding flows,
  // not as a global redirect condition.
  if (!p) return false;
  // required to be considered “onboarded” (minimal)
  if (!p.client_id) return true;
  return false;
}
