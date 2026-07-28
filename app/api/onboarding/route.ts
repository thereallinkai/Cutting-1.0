import { z } from "zod";
import type { Database, Json } from "@/src/types/database";
import { localDateInTimeZone } from "@/src/lib/domain";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import { isDevelopmentDemo } from "@/src/lib/env";
import {
  normalizeMealFoodSlugs,
  parseOptionalHeight,
} from "@/src/lib/onboarding-input";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const mealSelectionSchema = z
  .array(z.string().min(1).max(120))
  .max(50)
  .transform(normalizeMealFoodSlugs);

const mealSchema = z.object({
  breakfast: mealSelectionSchema,
  lunch: mealSelectionSchema,
  dinner: mealSelectionSchema,
});

const draftSchema = z
  .object({
    meals: mealSchema,
    currentWeight: z.string().max(30),
    targetWeight: z.string().max(30),
    unit: z.enum(["kg", "lb"]),
    goalType: z.enum(["fat_loss", "muscle_gain", "maintenance", "recomposition"]),
    targetDate: z.string().max(10),
    height: z.string().max(30),
    activity: z.string().max(40),
    trainingDays: z.string().max(2),
    restrictions: z.string().max(1_000),
    allergies: z.string().max(1_000),
    timeZone: z.string().min(1).max(100),
    safety: z.array(z.string().max(120)).max(10),
    notes: z.string().max(2_000),
    acknowledgedWarnings: z
      .array(
        z.object({
          mealType: z.enum(["breakfast", "lunch", "dinner"]),
          warningCode: z.enum([
            "missing_carbohydrate",
            "missing_protein",
            "missing_vegetable",
          ]),
          contextVersion: z.literal("meal-composition-v1"),
        }),
      )
      .max(8),
  })
  .strict();

const patchSchema = z.object({
  currentStep: z.number().int().min(3).max(6),
  draft: draftSchema,
});

const completionSchema = draftSchema.extend({
  activity: z.enum(["low", "light", "moderate", "high"]),
  trainingDays: z.string().refine((value) => {
    const trainingDays = Number(value);
    return value.trim().length > 0
      && Number.isInteger(trainingDays)
      && trainingDays >= 0
      && trainingDays <= 7;
  }),
  currentWeightKg: z.number().min(20).max(500),
  targetWeightKg: z.number().min(20).max(500),
  completed: z.literal(true),
});

type CompleteOnboardingArgs =
  Database["public"]["Functions"]["complete_onboarding"]["Args"];
type NullableCompleteOnboardingArgs = Omit<
  CompleteOnboardingArgs,
  "profile_height_cm" | "profile_notes" | "profile_safety_context"
> & {
  profile_height_cm: number | null;
  profile_notes: string | null;
  profile_safety_context: string | null;
};

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf())
    && date.toISOString().slice(0, 10) === value;
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function GET() {
  if (isDevelopmentDemo()) return apiSuccess({ currentStep: null, draft: null });
  try {
    const { supabase, user } = await requireUser();
    if (!user) return apiError("SESSION_EXPIRED", "Log in to resume onboarding.", 401);
    const { data, error } = await supabase
      .from("onboarding_drafts")
      .select("current_step,validated_data")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return apiError("DRAFT_LOAD_FAILED", "Onboarding progress could not be loaded.", 500);
    return apiSuccess({
      currentStep: data?.current_step ?? null,
      draft: data?.validated_data ?? null,
    });
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Onboarding services are temporarily unavailable.", 503);
  }
}

export async function PATCH(request: Request) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_DRAFT", "The onboarding draft was not valid.", 422);
  if (isDevelopmentDemo()) return apiSuccess({ saved: true });
  try {
    const { supabase, user } = await requireUser();
    if (!user) return apiError("SESSION_EXPIRED", "Log in to save onboarding progress.", 401);
    const { error } = await supabase.from("onboarding_drafts").upsert({
      user_id: user.id,
      current_step: parsed.data.currentStep,
      validated_data: toJson(parsed.data.draft),
    });
    if (error) return apiError("DRAFT_SAVE_FAILED", "Onboarding progress could not be saved.", 500);
    return apiSuccess({ saved: true });
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Onboarding services are temporarily unavailable.", 503);
  }
}

export async function PUT(request: Request) {
  const parsed = completionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("INVALID_ONBOARDING", "Review the required goal and profile details.", 422);
  }
  if (!parsed.data.targetDate) {
    return apiError("TARGET_DATE_REQUIRED", "Choose a target date before completing onboarding.", 422);
  }
  const parsedHeight = parseOptionalHeight(parsed.data.height);
  if (!parsedHeight.ok) {
    return apiError(
      "INVALID_HEIGHT",
      "Enter a height from 50 to 300 cm, such as 175 cm or 5 ft 9 in, or leave it blank.",
      422,
    );
  }
  if (isDevelopmentDemo()) return apiSuccess({ completed: true, goalId: "demo-goal" });

  try {
    const { supabase, user } = await requireUser();
    if (!user) return apiError("SESSION_EXPIRED", "Log in to complete onboarding.", 401);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("age,gender")
      .eq("user_id", user.id)
      .single();
    if (
      profileError
      || !profile
      || profile.gender === null
      || profile.age === null
    ) {
      return apiError("PROFILE_REQUIRED", "Complete the account profile before onboarding.", 409);
    }

    const allSlugs = [...new Set(Object.values(parsed.data.meals).flat())];
    const { data: catalog, error: foodError } = await supabase
      .from("foods")
      .select("id,slug")
      .in("slug", allSlugs)
      .eq("ownership_type", "catalog");
    if (foodError || (catalog?.length ?? 0) !== allSlugs.length) {
      return apiError("FOOD_SELECTION_CHANGED", "One or more selected foods are no longer available.", 409);
    }
    const foodIds = new Map(catalog!.map((food) => [food.slug, food.id]));
    const preferences = (["breakfast", "lunch", "dinner"] as const).flatMap((mealType) =>
      parsed.data.meals[mealType].map((slug, sortOrder) => ({
        mealType,
        foodId: foodIds.get(slug)!,
        sortOrder,
      })),
    );

    const activityMap = {
      low: "sedentary",
      light: "lightly_active",
      moderate: "moderately_active",
      high: "very_active",
    } as const;
    const goalMap = {
      fat_loss: "fat_loss",
      muscle_gain: "muscle_gain",
      maintenance: "maintenance",
      recomposition: "body_recomposition",
    } as const;
    const trainingValue = Number(parsed.data.trainingDays);
    let planStartDate: string;
    try {
      planStartDate = localDateInTimeZone(new Date(), parsed.data.timeZone);
    } catch {
      return apiError(
        "INVALID_TIME_ZONE",
        "Choose a supported time zone before completing onboarding.",
        422,
      );
    }
    if (!isCalendarDate(parsed.data.targetDate)
      || parsed.data.targetDate < planStartDate) {
      return apiError(
        "INVALID_TARGET_DATE",
        "Choose a target date that is today or later.",
        422,
      );
    }
    const dietaryRestrictions = parsed.data.restrictions
      ? parsed.data.restrictions.split(",").map((item) => item.trim()).filter(Boolean)
      : [];
    const allergies = parsed.data.allergies
      ? parsed.data.allergies.split(",").map((item) => item.trim()).filter(Boolean)
      : [];
    if (dietaryRestrictions.length > 50 || allergies.length > 50) {
      return apiError(
        "TOO_MANY_RESTRICTIONS",
        "Use no more than 50 comma-separated allergies or dietary restrictions.",
        422,
      );
    }

    const completeOnboardingArgs = {
      profile_gender_value: profile.gender,
      profile_age: profile.age,
      profile_height_cm: parsedHeight.heightCm,
      profile_weight_unit: parsed.data.unit,
      profile_time_zone: parsed.data.timeZone,
      profile_activity_level: activityMap[parsed.data.activity],
      profile_training_days: trainingValue,
      profile_dietary_restrictions: dietaryRestrictions,
      profile_allergies: allergies,
      profile_disliked_foods: [],
      profile_safety_context: parsed.data.safety.join("; ") || null,
      profile_notes: parsed.data.notes || null,
      selected_goal_type: goalMap[parsed.data.goalType],
      current_weight_kg: parsed.data.currentWeightKg,
      target_weight_kg: parsed.data.targetWeightKg,
      plan_start_date: planStartDate,
      target_date: parsed.data.targetDate,
      preferences: toJson(preferences),
      acknowledged_warnings: toJson(parsed.data.acknowledgedWarnings),
    } satisfies NullableCompleteOnboardingArgs;

    // PostgreSQL accepts NULL for these nullable parameters. Supabase CLI
    // 2.109.1 omits those null unions from its generated RPC argument type.
    const { data: goalId, error } = await supabase.rpc(
      "complete_onboarding",
      completeOnboardingArgs as CompleteOnboardingArgs,
    );
    if (error) {
      console.error("complete_onboarding RPC failed", {
        code: error.code,
      });
      if (
        error.code === "23514"
        && error.message.includes("Terms and privacy acceptance")
      ) {
        return apiError(
          "LEGAL_ACCEPTANCE_REQUIRED",
          "Your Terms and Privacy acceptance could not be verified. Sign in again or recreate this test account.",
          409,
        );
      }
      if (error.code === "23505") {
        return apiError(
          "DUPLICATE_MEAL_FOOD",
          "A food was selected more than once for the same meal. Review the meal selections and try again.",
          409,
        );
      }
      return apiError("ONBOARDING_SAVE_FAILED", "The final onboarding step could not be saved.", 500);
    }
    return apiSuccess({ completed: true, goalId });
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Onboarding services are temporarily unavailable.", 503);
  }
}
