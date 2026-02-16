import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type UserContext = {
  user_id: string;
  client_id: string | null;
  is_admin: boolean;
  role: string | null;
};

/**
 * Canonical user -> client resolution.
 *
 * Invariants:
 * - auth.uid() === profiles.id
 * - profiles.client_id === clients.id
 * - sessions.client_id stores clients.id (NOT auth.uid)
 */
export async function resolveUserContext(
  supabase: SupabaseClient,
  userId: string
): Promise<UserContext> {
  // Prefer profiles.client_id (canonical)
  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("client_id, is_admin, role")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) {
    // If profiles lookup fails, fall back to legacy mapping below.
    // Never throw here: session pages should fail softly, not 500 due to a profile row glitch.
  }

  const profileClientId =
    prof && typeof (prof as any).client_id === "string" && (prof as any).client_id.length > 0
      ? String((prof as any).client_id)
      : null;

  const isAdmin =
    !!(prof as any)?.is_admin || String((prof as any)?.role ?? "") === "admin";

  // Legacy support: older data used clients.owner_user_id/player_user_id
  if (!profileClientId) {
    try {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id")
        .or(`owner_user_id.eq.${userId},player_user_id.eq.${userId},id.eq.${userId}`)
        .maybeSingle();

      const mappedId =
        clientRow && typeof (clientRow as any).id !== "undefined" ? String((clientRow as any).id) : null;

      return { user_id: userId, client_id: mappedId ?? null, is_admin: isAdmin, role: (prof as any)?.role ?? null };
    } catch {
      return { user_id: userId, client_id: null, is_admin: isAdmin, role: (prof as any)?.role ?? null };
    }
  }

  return { user_id: userId, client_id: profileClientId, is_admin: isAdmin, role: (prof as any)?.role ?? null };
}
