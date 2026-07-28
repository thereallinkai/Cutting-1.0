import { z } from "zod";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const schema = z.object({ password: z.string().min(10).max(128) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("WEAK_PASSWORD", "Use at least 10 characters.", 422);
  if (isDevelopmentDemo()) return apiSuccess({ updated: true });
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return apiError("SESSION_EXPIRED", "Open a fresh reset link and try again.", 401);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return apiError("PASSWORD_UPDATE_FAILED", "The password could not be updated.", 400);
    return apiSuccess({ updated: true });
  } catch {
    return apiError("AUTH_UNAVAILABLE", "Password services are temporarily unavailable.", 503);
  }
}
