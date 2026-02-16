import { NextResponse } from "next/server";
import { requireClient, jsonOk } from "@/app/api/_lib/auth";

export async function GET() {
  const auth = await requireClient();
  if ("res" in auth && !("supabase" in auth)) return auth.res;
  const { supabase, userId, clientId, profile } = auth;
return jsonOk({
    user_id: userId,
    client_id: clientId,
    profile: profile ?? null,
  });
}
