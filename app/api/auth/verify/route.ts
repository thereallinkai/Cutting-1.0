import { z } from "zod";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const schema = z.object({
  email: z.string().trim().email(),
  token: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_CODE", "Enter a valid six-digit code.", 422);
  if (isDevelopmentDemo()) {
    return parsed.data.token === "123456"
      ? apiSuccess({ verified: true, redirectTo: "/onboarding?step=3" })
      : apiError("INVALID_OR_EXPIRED_CODE", "That code is invalid or expired.", 400);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.token,
      type: "email",
    });
    if (error || !data.user) {
      return apiError("INVALID_OR_EXPIRED_CODE", "That code is invalid or expired.", 400);
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", data.user.id)
      .single();
    if (profileError) {
      return apiError("PROFILE_SETUP_FAILED", "Email was verified, but profile setup needs to be retried.", 500);
    }
    return apiSuccess({ verified: true, redirectTo: "/onboarding?step=3" });
  } catch {
    return apiError("AUTH_UNAVAILABLE", "Verification services are temporarily unavailable.", 503);
  }
}
