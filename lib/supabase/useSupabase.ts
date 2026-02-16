"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "./browser";

export function useSupabase() {
  const [client, setClient] = useState<SupabaseClient | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    setClient(supabase);
  }, []);

  return client;
}
