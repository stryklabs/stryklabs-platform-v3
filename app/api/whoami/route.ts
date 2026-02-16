import { NextResponse } from "next/server";
import { requireClient, jsonOk } from "../_lib/auth";

export async function GET() {
  const { supabase, userId, clientId, profile, res } = await requireClient();
  if (res) return res;

  return jsonOk({
    user_id: userId,
    client_id: clientId,
    profile: profile ?? null,
  });
}
