import { z } from "zod";
import { apiError, apiSuccess } from "@/src/lib/api-response";
import { isValidIanaTimeZone } from "@/src/lib/domain";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

const profileSchema = z
  .object({
    section: z.literal("profile"),
    fullName: z.string().trim().min(1).max(120),
    preferredWeightUnit: z.enum(["kg", "lb"]),
    timeZone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(isValidIanaTimeZone),
  })
  .strict();

const goalSchema = z
  .object({
    section: z.literal("goal"),
    goalType: z.enum([
      "fat_loss",
      "muscle_gain",
      "maintenance",
      "body_recomposition",
    ]),
  })
  .strict();

const preferenceItemSchema = z.string().trim().min(1).max(120);

const preferencesSchema = z
  .object({
    section: z.literal("preferences"),
    allergies: z.array(preferenceItemSchema).max(50),
    dietaryRestrictions: z.array(preferenceItemSchema).max(50),
    dislikedFoods: z.array(preferenceItemSchema).max(100),
    trainingDaysPerWeek: z.number().int().min(0).max(7).nullable(),
    safetyContext: z.string().trim().max(4000),
  })
  .strict();

const labelFoodSchema = z
  .object({
    section: z.literal("labelFood"),
    productName: z.string().trim().min(1).max(160),
    servingWeightGrams: z.number().positive().max(10000),
    calories: z.number().min(0).max(10000),
    proteinGrams: z.number().min(0).max(10000),
    carbohydrateGrams: z.number().min(0).max(10000),
    fatGrams: z.number().min(0).max(10000),
    fiberGrams: z.number().min(0).max(10000).nullable(),
    sodiumMilligrams: z.number().min(0).max(1000000).nullable(),
    sourceNote: z.string().trim().max(1000),
  })
  .strict();

const settingsUpdateSchema = z.discriminatedUnion("section", [
  profileSchema,
  goalSchema,
  preferencesSchema,
  labelFoodSchema,
]);

function uniqueItems(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLocaleLowerCase("en-US");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function privateFoodSlug(productName: string) {
  const normalized = productName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/g, "");
  const prefix = normalized || "label-food";
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function PATCH(request: Request) {
  const parsed = settingsUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return apiError(
      "INVALID_SETTINGS",
      "Review the settings fields and try again.",
      422,
    );
  }

  if (isDevelopmentDemo()) {
    return apiSuccess({
      saved: true,
      persisted: false,
      section: parsed.data.section,
    });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      return apiError(
        "SESSION_EXPIRED",
        "Log in again before saving settings.",
        401,
      );
    }

    if (parsed.data.section === "profile") {
      const { data: profile, error } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: auth.user.id,
            full_name: parsed.data.fullName,
            preferred_weight_unit: parsed.data.preferredWeightUnit,
            time_zone: parsed.data.timeZone,
          },
          { onConflict: "user_id" },
        )
        .select("full_name,preferred_weight_unit,time_zone")
        .single();
      if (error) {
        return apiError(
          "PROFILE_SAVE_FAILED",
          "Profile settings could not be saved.",
          500,
        );
      }

      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          ...auth.user.user_metadata,
          full_name: parsed.data.fullName,
        },
      });

      return apiSuccess({
        saved: true,
        persisted: true,
        section: "profile" as const,
        profile,
        displayMetadataUpdated: !metadataError,
      });
    }

    if (parsed.data.section === "goal") {
      const { data: goal, error } = await supabase
        .from("goals")
        .update({ goal_type: parsed.data.goalType })
        .eq("user_id", auth.user.id)
        .eq("status", "active")
        .select("id,goal_type,status,target_weight_kg,target_date")
        .maybeSingle();
      if (error) {
        return apiError(
          "GOAL_SAVE_FAILED",
          "The active goal could not be updated.",
          500,
        );
      }
      if (!goal) {
        return apiError(
          "ACTIVE_GOAL_REQUIRED",
          "There is no active goal to update.",
          409,
        );
      }
      return apiSuccess({
        saved: true,
        persisted: true,
        section: "goal" as const,
        goal,
      });
    }

    if (parsed.data.section === "preferences") {
      const { data: profile, error } = await supabase
        .from("profiles")
        .update({
          allergies: uniqueItems(parsed.data.allergies),
          dietary_restrictions: uniqueItems(
            parsed.data.dietaryRestrictions,
          ),
          disliked_foods: uniqueItems(parsed.data.dislikedFoods),
          training_days_per_week: parsed.data.trainingDaysPerWeek,
          safety_context: parsed.data.safetyContext || null,
        })
        .eq("user_id", auth.user.id)
        .select(
          "allergies,dietary_restrictions,disliked_foods,training_days_per_week,safety_context",
        )
        .maybeSingle();
      if (error) {
        return apiError(
          "PREFERENCES_SAVE_FAILED",
          "Preferences could not be saved.",
          500,
        );
      }
      if (!profile) {
        return apiError(
          "PROFILE_REQUIRED",
          "Create a profile before saving preferences.",
          409,
        );
      }
      return apiSuccess({
        saved: true,
        persisted: true,
        section: "preferences" as const,
        profile,
      });
    }

    const sourceReference =
      parsed.data.sourceNote ||
      "Nutrition facts entered by the account owner.";
    const { data: food, error: foodError } = await supabase
      .from("foods")
      .insert({
        slug: privateFoodSlug(parsed.data.productName),
        english_name: parsed.data.productName,
        icon_ref: "package",
        source: "User-entered nutrition label",
        ownership_type: "private",
        owner_user_id: auth.user.id,
        verification_status: "user_label",
      })
      .select(
        "id,english_name,slug,verification_status,created_at",
      )
      .single();
    if (foodError || !food) {
      return apiError(
        "LABEL_FOOD_SAVE_FAILED",
        "The private label food could not be created.",
        500,
      );
    }

    const { data: nutrition, error: nutritionError } = await supabase
      .from("food_nutrition")
      .insert({
        food_id: food.id,
        measurement_basis: "label_serving",
        reference_quantity: 1,
        reference_unit: "serving",
        serving_weight_grams: parsed.data.servingWeightGrams,
        calories: parsed.data.calories,
        protein_g: parsed.data.proteinGrams,
        carbohydrate_g: parsed.data.carbohydrateGrams,
        fat_g: parsed.data.fatGrams,
        fiber_g: parsed.data.fiberGrams,
        sodium_mg: parsed.data.sodiumMilligrams,
        source_name: "User-entered nutrition label",
        source_reference: sourceReference,
        verification_status: "user_label",
      })
      .select(
        "id,serving_weight_grams,calories,protein_g,carbohydrate_g,fat_g,fiber_g,sodium_mg,source_reference",
      )
      .single();
    if (nutritionError || !nutrition) {
      const { error: cleanupError } = await supabase
        .from("foods")
        .delete()
        .eq("id", food.id)
        .eq("owner_user_id", auth.user.id);
      return apiError(
        "LABEL_NUTRITION_SAVE_FAILED",
        cleanupError
          ? "Nutrition could not be saved. The incomplete private food may still be visible; reload before trying again."
          : "Nutrition could not be saved, so the new private food was removed.",
        500,
      );
    }

    return apiSuccess(
      {
        saved: true,
        persisted: true,
        section: "labelFood" as const,
        food: {
          ...food,
          nutrition,
        },
      },
      201,
    );
  } catch {
    return apiError(
      "SERVICE_UNAVAILABLE",
      "Settings services are temporarily unavailable.",
      503,
    );
  }
}
