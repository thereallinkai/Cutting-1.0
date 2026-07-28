import { z } from "zod";
import type { Json } from "@/src/types/database";
import { localDateInTimeZone } from "@/src/lib/domain";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const mealSchema = z.object({
  breakfast: z.array(z.string()).max(50),
  lunch: z.array(z.string()).max(50),
  dinner: z.array(z.string()).max(50),
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
  currentWeightKg: z.number().positive().max(500),
  targetWeightKg: z.number().positive().max(500),
  completed: z.literal(true),
});

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
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
  if (isDevelopmentDemo()) return apiSuccess({ completed: true, goalId: "demo-goal" });

  try {
    const { supabase, user } = await requireUser();
    if (!user) return apiError("SESSION_EXPIRED", "Log in to complete onboarding.", 401);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("age,gender")
      .eq("user_id", user.id)
      .single();
    if (profileError || !profile) {
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
    const heightValue = Number(parsed.data.height.replace(/[^\d.]/g, ""));
    const trainingValue = Number(parsed.data.trainingDays);

    const { data: goalId, error } = await supabase.rpc("complete_onboarding", {
      profile_gender_value: profile.gender,
      profile_age: profile.age,
      profile_height_cm: Number.isFinite(heightValue) && heightValue > 0 ? heightValue : null,
      profile_weight_unit: parsed.data.unit,
      profile_time_zone: parsed.data.timeZone,
      profile_activity_level: activityMap[parsed.data.activity as keyof typeof activityMap] ?? null,
      profile_training_days:
        Number.isInteger(trainingValue) && trainingValue >= 0 && trainingValue <= 7
          ? trainingValue
          : null,
      profile_dietary_restrictions: parsed.data.restrictions
        ? parsed.data.restrictions.split(",").map((item) => item.trim()).filter(Boolean)
        : [],
      profile_allergies: parsed.data.allergies
        ? parsed.data.allergies.split(",").map((item) => item.trim()).filter(Boolean)
        : [],
      profile_disliked_foods: [],
      profile_safety_context: parsed.data.safety.join("; ") || null,
      profile_notes: parsed.data.notes || null,
      selected_goal_type: goalMap[parsed.data.goalType],
      current_weight_kg: parsed.data.currentWeightKg,
      target_weight_kg: parsed.data.targetWeightKg,
      plan_start_date: localDateInTimeZone(
        new Date(),
        parsed.data.timeZone,
      ),
      target_date: parsed.data.targetDate,
      preferences: toJson(preferences),
      acknowledged_warnings: toJson(parsed.data.acknowledgedWarnings),
    });
    if (error) {
      return apiError("ONBOARDING_SAVE_FAILED", "The final onboarding step could not be saved.", 500);
    }
    return apiSuccess({ completed: true, goalId });
  } catch {
    return apiError("SERVICE_UNAVAILABLE", "Onboarding services are temporarily unavailable.", 503);
  }
}
