import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/app/lib/supabase/server";
import { getAuthedUserId, resolveClientId, type ProfileRow } from "@/app/lib/auth/resolveClientId";

export function jsonOk(data: any = {}, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, { status: 200, ...init });
}

export function jsonErr(status: number, error: string, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

export async function requireClient(): Promise<
  | { supabase: any; userId: string; clientId: string; profile?: ProfileRow | null; res: NextResponse }
  | { res: NextResponse }
> {
  const supabase = await getSupabaseServer();
  const userId = await getAuthedUserId(supabase);
  if (!userId) return { res: jsonErr(401, "unauthorized") };

  const { clientId, profile } = await resolveClientId(supabase, userId);
  if (!clientId) return { res: jsonErr(403, "no_client") };

  return { supabase, userId, clientId, profile: profile ?? null, res: NextResponse.next() };
}

export async function requireAdmin(): Promise<
  | { supabase: any; userId: string; profile?: ProfileRow | null; res: NextResponse }
  | { res: NextResponse }
> {
  const supabase = await getSupabaseServer();
  const userId = await getAuthedUserId(supabase);
  if (!userId) return { res: jsonErr(401, "unauthorized") };

  const { profile } = await resolveClientId(supabase, userId);

  const isAdmin = Boolean((profile as any)?.is_admin) || (profile as any)?.role === "admin";
  if (!isAdmin) return { res: jsonErr(403, "forbidden") };

  return { supabase, userId, profile: profile ?? null, res: NextResponse.next() };
}
