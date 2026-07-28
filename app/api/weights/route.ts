import { z } from "zod";
import { convertWeight, localDateInTimeZone, parseLocalDate } from "@/src/lib/domain";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const entrySchema = z
  .object({
    localDate: z.string(),
    weight: z.number().positive(),
    unit: z.enum(["kg", "lb"]),
  })
  .strict();

async function authContext() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, user: null, timeZone: "UTC" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("time_zone")
    .eq("user_id", data.user.id)
    .maybeSingle();
  return { supabase, user: data.user, timeZone: profile?.time_zone ?? "UTC" };
}

export async function GET(request: Request) {
  if (isDevelopmentDemo()) return apiSuccess([]);
  try {
    const { supabase, user } = await authContext();
    if (!user) return apiError("SESSION_EXPIRED", "Log in to view weight entries.", 401);
    const url = new URL(request.url);
    const limit = Math.min(365, Math.max(1, Number(url.searchParams.get("limit") ?? 90)));
    const { data, error } = await supabase
      .from("weight_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("local_date", { ascending: true })
      .limit(limit);
    if (error) return apiError("WEIGHTS_LOAD_FAILED", "Weight entries could not be loaded.", 500);
    return apiSuccess(data);
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Weight services are temporarily unavailable.", 503);
  }
}

export async function POST(request: Request) {
  const parsed = entrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_WEIGHT", "Enter a valid positive weight and local date.", 422);
  try {
    parseLocalDate(parsed.data.localDate);
  } catch {
    return apiError("INVALID_LOCAL_DATE", "Use a valid YYYY-MM-DD local date.", 422);
  }
  const weightKg = convertWeight(parsed.data.weight, parsed.data.unit, "kg");
  if (weightKg < 20 || weightKg > 500) {
    return apiError("WEIGHT_OUT_OF_RANGE", "Enter a weight between 20 and 500 kilograms equivalent.", 422);
  }
  if (isDevelopmentDemo()) {
    return apiSuccess({ localDate: parsed.data.localDate, weightKg, sourceDisplayUnit: parsed.data.unit }, 201);
  }

  try {
    const { supabase, user, timeZone } = await authContext();
    if (!user) return apiError("SESSION_EXPIRED", "Log in to save weight entries.", 401);
    if (parsed.data.localDate > localDateInTimeZone(new Date(), timeZone)) {
      return apiError("FUTURE_WEIGHT_DISABLED", "A weight entry cannot use a future local date.", 409);
    }
    const { data, error } = await supabase
      .from("weight_entries")
      .upsert(
        {
          user_id: user.id,
          local_date: parsed.data.localDate,
          weight_kg: weightKg,
          source_display_unit: parsed.data.unit,
        },
        { onConflict: "user_id,local_date" },
      )
      .select()
      .single();
    if (error) return apiError("WEIGHT_SAVE_FAILED", "The weight entry could not be saved.", 500);
    return apiSuccess(data, 201);
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Weight services are temporarily unavailable.", 503);
  }
}
