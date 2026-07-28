"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/src/types/database";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Local Supabase is not configured. Run npm run bootstrap.");
  }
  return createBrowserClient<Database>(url, key);
}
