import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getAuthedUserId,
  resolveClientId,
  type ProfileRow,
} from "@/app/lib/auth/resolveClientId";

export function jsonOk(data: any = {}, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, { status: 200, ...init });
}

export function jsonErr(
  status: number,
  error: string,
  extra?: Record<string, any>
) {
  return NextResponse.json(
    { ok: false, error, ...(extra ?? {}) },
    { status }
  );
}

export async function requireUser(): Promise<
  { supabase: any; userId: string } | { res: NextResponse }
> {
  const supabase = await getSupabaseServer();
  const userId = await getAuthedUserId(supabase);
  if (!userId) return { res: jsonErr(401, "unauthorized") };
  return { supabase, userId };
}

export async function requireClient(): Promise<
  { supabase: any; userId: string; clientId: string; profile?: ProfileRow | null } | { res: NextResponse }
> {
  const base = await requireUser();
  if ("res" in base) return base;

  const { supabase, userId } = base;
  const { clientId, profile } = await resolveClientId(supabase, userId);
  if (!clientId) return { res: jsonErr(403, "no_client") };

  return { supabase, userId, clientId, profile: profile ?? null };
}

export async function requireAdmin(): Promise<
  { supabase: any; userId: string; profile?: ProfileRow | null } | { res: NextResponse }
> {
  const ctx = await requireClient();
  if ("res" in ctx) return ctx;

  const isAdmin = Boolean(ctx.profile?.is_admin) || ctx.profile?.role === "admin";
  if (!isAdmin) return { res: jsonErr(403, "forbidden") };

  return { supabase: ctx.supabase, userId: ctx.userId, profile: ctx.profile ?? null };
}
