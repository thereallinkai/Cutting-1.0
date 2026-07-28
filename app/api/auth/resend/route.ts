import { z } from "zod";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const schema = z.object({ email: z.string().trim().email() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_EMAIL", "Enter a valid email.", 422);
  if (isDevelopmentDemo()) return apiSuccess({ sent: true });
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resend({ email: parsed.data.email, type: "signup" });
    return apiSuccess({ sent: true });
  } catch {
    return apiError("AUTH_UNAVAILABLE", "Verification email is temporarily unavailable.", 503);
  }
}
