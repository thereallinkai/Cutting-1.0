import { z } from "zod";
import { apiSuccess } from "@/src/lib/api-response";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const schema = z.object({ email: z.string().trim().email() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (parsed.success && !isDevelopmentDemo()) {
    try {
      const supabase = await createSupabaseServerClient();
      const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
      await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
      });
    } catch {
      // Deliberately return the same response to prevent account enumeration.
    }
  }
  return apiSuccess({ sent: true });
}
