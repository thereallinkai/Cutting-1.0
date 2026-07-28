import { z } from "zod";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  const generic = "The email or password was not accepted.";
  if (!parsed.success) return apiError("INVALID_CREDENTIALS", generic, 401);
  if (isDevelopmentDemo()) return apiSuccess({ redirectTo: "/today" });
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !data.user) return apiError("INVALID_CREDENTIALS", generic, 401);
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_status")
      .eq("user_id", data.user.id)
      .maybeSingle();
    const redirectTo =
      profile?.onboarding_status === "completed"
        ? "/today"
        : "/onboarding?step=3";
    return apiSuccess({ redirectTo });
  } catch {
    return apiError("AUTH_UNAVAILABLE", "Account services are temporarily unavailable.", 503);
  }
}
