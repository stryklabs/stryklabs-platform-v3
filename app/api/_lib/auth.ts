import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getAuthedUserId, resolveClientId } from "@/app/lib/auth/resolveClientId";

export async function supabaseFromRequest() {
  return getSupabaseServer();
}

export async function requireUser() {
  const supabase = await supabaseFromRequest();
  const userId = await getAuthedUserId(supabase);
  if (!userId) return { supabase, userId: null, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { supabase, userId, res: null as any };
}

export async function requireClient() {
  const { supabase, userId, res } = await requireUser();
  if (!userId) return { supabase, userId: null, clientId: null, profile: null, res };
  const { clientId, profile } = await resolveClientId(supabase, userId);
  if (!clientId) return { supabase, userId, clientId: null, profile, res: NextResponse.json({ error: "Missing client_id" }, { status: 400 }) };
  return { supabase, userId, clientId, profile: profile ?? null, res: null as any };
}

export async function requireAdmin() {
  const ctx = await requireClient();
  if (ctx.res) return ctx as any;
  const isAdmin = Boolean(ctx.profile?.is_admin);
  if (!isAdmin) return { ...ctx, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ...ctx, res: null as any };
}

export function jsonOk(data: any, init?: number) {
  return NextResponse.json({ ok: true, ...data }, { status: init ?? 200 });
}

export function jsonErr(status: number, message: string, extra: any = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}
