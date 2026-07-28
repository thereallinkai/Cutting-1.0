import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  SettingsView,
  type SettingsInitialData,
} from "@/components/settings-view";
import {
  getAIProviderMode,
  isDevelopmentDemo,
} from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

const demoSettings: SettingsInitialData = {
  mode: "demo",
  account: {
    email: "demo@cuttingplan.local",
    createdAt: null,
  },
  profile: {
    fullName: "Jamie Rivera",
    preferredWeightUnit: "kg",
    timeZone: "America/New_York",
    allergies: ["Peanuts"],
    dietaryRestrictions: [],
    dislikedFoods: ["Mushrooms"],
    trainingDaysPerWeek: 3,
    safetyContext: "",
  },
  goal: {
    id: "demo-goal",
    goalType: "fat_loss",
    targetWeightKg: 72,
    targetDate: "2026-10-16",
  },
  mealPreferences: [
    {
      mealType: "breakfast",
      foodId: "demo-oats",
      foodName: "Oats",
      sortOrder: 0,
    },
    {
      mealType: "lunch",
      foodId: "demo-chicken",
      foodName: "Chicken Breast",
      sortOrder: 0,
    },
    {
      mealType: "dinner",
      foodId: "demo-salmon",
      foodName: "Salmon",
      sortOrder: 0,
    },
  ],
  privateLabelFoods: [],
  aiProviderMode: "mock",
  loadError: null,
};

export default async function SettingsPage() {
  if (isDevelopmentDemo()) {
    return <SettingsView initialData={demoSettings} />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect("/login");

  const userId = auth.user.id;
  const [
    profileResult,
    goalResult,
    mealPreferencesResult,
    privateFoodsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name,preferred_weight_unit,time_zone,allergies,dietary_restrictions,disliked_foods,training_days_per_week,safety_context",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("goals")
      .select("id,goal_type,target_weight_kg,target_date")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meal_preferences")
      .select("meal_type,food_id,sort_order")
      .eq("user_id", userId)
      .order("meal_type")
      .order("sort_order"),
    supabase
      .from("foods")
      .select(
        `
          id,
          english_name,
          verification_status,
          created_at,
          food_nutrition (
            measurement_basis,
            serving_weight_grams,
            calories,
            protein_g,
            carbohydrate_g,
            fat_g,
            fiber_g,
            sodium_mg,
            source_reference
          )
        `,
      )
      .eq("owner_user_id", userId)
      .eq("ownership_type", "private")
      .order("created_at"),
  ]);

  const preferenceFoodIds = [
    ...new Set(
      (mealPreferencesResult.data ?? []).map(
        (preference) => preference.food_id,
      ),
    ),
  ];
  const preferenceFoodsResult = preferenceFoodIds.length
    ? await supabase
        .from("foods")
        .select("id,english_name")
        .in("id", preferenceFoodIds)
    : { data: [], error: null };
  const preferenceFoodNames = new Map(
    (preferenceFoodsResult.data ?? []).map((food) => [
      food.id,
      food.english_name,
    ]),
  );

  const profile = profileResult.data;
  const goal = goalResult.data;
  const loadError =
    profileResult.error ||
    goalResult.error ||
    mealPreferencesResult.error ||
    privateFoodsResult.error ||
    preferenceFoodsResult.error
      ? "Stored settings could not be loaded completely. Saving is disabled to avoid overwriting unknown values; reload the page or try again later."
      : null;

  const initialData: SettingsInitialData = {
    mode: "authenticated",
    account: {
      email: auth.user.email ?? "Email unavailable",
      createdAt: auth.user.created_at,
    },
    profile: {
      fullName:
        profile?.full_name ??
        String(auth.user.user_metadata.full_name ?? "Member"),
      preferredWeightUnit: profile?.preferred_weight_unit ?? "kg",
      timeZone: profile?.time_zone ?? "UTC",
      allergies: profile?.allergies ?? [],
      dietaryRestrictions: profile?.dietary_restrictions ?? [],
      dislikedFoods: profile?.disliked_foods ?? [],
      trainingDaysPerWeek: profile?.training_days_per_week ?? null,
      safetyContext: profile?.safety_context ?? "",
    },
    goal: goal
      ? {
          id: goal.id,
          goalType: goal.goal_type,
          targetWeightKg: goal.target_weight_kg,
          targetDate: goal.target_date,
        }
      : null,
    mealPreferences: (mealPreferencesResult.data ?? []).map((preference) => ({
      mealType: preference.meal_type,
      foodId: preference.food_id,
      foodName:
        preferenceFoodNames.get(preference.food_id) ?? "Unavailable food",
      sortOrder: preference.sort_order,
    })),
    privateLabelFoods: (privateFoodsResult.data ?? []).map((food) => {
      const nutrition = food.food_nutrition.find(
        (row) => row.measurement_basis === "label_serving",
      );
      const hasCoreNutrition =
        nutrition?.serving_weight_grams != null &&
        nutrition.calories != null &&
        nutrition.protein_g != null &&
        nutrition.carbohydrate_g != null &&
        nutrition.fat_g != null;
      return {
        id: food.id,
        name: food.english_name,
        verificationStatus: food.verification_status,
        createdAt: food.created_at,
        nutrition:
          nutrition && hasCoreNutrition
            ? {
                servingWeightGrams: nutrition.serving_weight_grams!,
                calories: nutrition.calories!,
                proteinGrams: nutrition.protein_g!,
                carbohydrateGrams: nutrition.carbohydrate_g!,
                fatGrams: nutrition.fat_g!,
                fiberGrams: nutrition.fiber_g,
                sodiumMilligrams: nutrition.sodium_mg,
                sourceNote: nutrition.source_reference ?? "",
              }
            : null,
      };
    }),
    aiProviderMode: getAIProviderMode(),
    loadError,
  };

  return <SettingsView initialData={initialData} />;
}
