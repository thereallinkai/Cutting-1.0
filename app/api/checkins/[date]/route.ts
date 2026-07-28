import { z } from "zod";
import { parseLocalDate, localDateInTimeZone } from "@/src/lib/domain";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const updateSchema = z
  .object({
    breakfastCompleted: z.boolean(),
    lunchCompleted: z.boolean(),
    dinnerCompleted: z.boolean(),
    notes: z.string().trim().max(1_000).nullable().optional(),
  })
  .strict();

function validDate(value: string) {
  try {
    parseLocalDate(value);
    return true;
  } catch {
    return false;
  }
}

async function context() {
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  if (!validDate(date)) return apiError("INVALID_LOCAL_DATE", "Use a valid YYYY-MM-DD local date.", 422);
  if (isDevelopmentDemo()) {
    return apiSuccess({
      local_date: date,
      breakfast_completed: true,
      lunch_completed: true,
      dinner_completed: false,
      notes: null,
    });
  }
  try {
    const { supabase, user } = await context();
    if (!user) return apiError("SESSION_EXPIRED", "Log in to view check-ins.", 401);
    const { data, error } = await supabase
      .from("daily_checkins")
      .select("*")
      .eq("user_id", user.id)
      .eq("local_date", date)
      .maybeSingle();
    if (error) return apiError("CHECKIN_LOAD_FAILED", "The check-in could not be loaded.", 500);
    return apiSuccess(
      data ?? {
        local_date: date,
        breakfast_completed: false,
        lunch_completed: false,
        dinner_completed: false,
        notes: null,
      },
    );
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Check-in services are temporarily unavailable.", 503);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
  if (!validDate(date)) return apiError("INVALID_LOCAL_DATE", "Use a valid YYYY-MM-DD local date.", 422);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_CHECKIN", "Send the desired final state for all three meals.", 422);
  if (isDevelopmentDemo()) return apiSuccess({ localDate: date, ...parsed.data });

  try {
    const { supabase, user, timeZone } = await context();
    if (!user) return apiError("SESSION_EXPIRED", "Log in to update check-ins.", 401);
    if (date > localDateInTimeZone(new Date(), timeZone)) {
      return apiError("FUTURE_CHECKIN_DISABLED", "Future meal completion is disabled.", 409);
    }
    const { data, error } = await supabase.rpc("upsert_daily_checkin", {
      checkin_date: date,
      desired_breakfast_completed: parsed.data.breakfastCompleted,
      desired_lunch_completed: parsed.data.lunchCompleted,
      desired_dinner_completed: parsed.data.dinnerCompleted,
      ...(parsed.data.notes == null ? {} : { checkin_notes: parsed.data.notes }),
    });
    if (error) return apiError("CHECKIN_SAVE_FAILED", "The check-in could not be saved.", 500);
    return apiSuccess(data);
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Check-in services are temporarily unavailable.", 503);
  }
}
