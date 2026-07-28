import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/src/types/database";
import { getServerEnv } from "@/src/lib/env";

export function createSupabaseAdminClient() {
  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Trusted Supabase server configuration is unavailable. Run npm run bootstrap.",
    );
  }

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
