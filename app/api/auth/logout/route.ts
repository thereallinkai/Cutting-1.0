import { apiError, apiSuccess } from "@/src/lib/api-response";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export async function POST() {
  if (isDevelopmentDemo()) return apiSuccess({ loggedOut: true });
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return apiSuccess({ loggedOut: true });
  } catch {
    return apiError("AUTH_UNAVAILABLE", "Logout could not be completed.", 503);
  }
}
