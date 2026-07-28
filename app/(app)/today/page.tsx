import type { Metadata } from "next";
import { format, parseISO } from "date-fns";
import {
  TodayDashboard,
  type TodayWeightPoint,
} from "@/components/today-dashboard";
import {
  addLocalDays,
  calculateNutritionEstimate,
  localDateInTimeZone,
  remainingDays,
  resolvePlanDay,
} from "@/src/lib/domain";
import { isDevelopmentDemo } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  if (isDevelopmentDemo()) return <TodayDashboard />;

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return <TodayDashboard />;

  const [profileResult, goalResult, weightsResult, planResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "full_name,time_zone,age,height_cm,gender,activity_level,safety_context",
        )
        .eq("user_id", auth.user.id)
        .single(),
      supabase
        .from("goals")
        .select("goal_type,target_weight_kg,target_date,plan_start_date")
        .eq("user_id", auth.user.id)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("weight_entries")
        .select("local_date,weight_kg,is_onboarding_baseline")
        .eq("user_id", auth.user.id)
        .order("local_date", { ascending: false })
        .limit(30),
      supabase
        .from("plans")
        .select("id,provider,model")
        .eq("user_id", auth.user.id)
        .eq("status", "accepted")
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const profile = profileResult.data;
  const goal = goalResult.data;
  const timeZone = profile?.time_zone ?? "UTC";
  const today = localDateInTimeZone(new Date(), timeZone);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const weekStart = addLocalDays(today, -((weekday + 6) % 7));
  const [checkinResult, weekResult] = await Promise.all([
    supabase
      .from("daily_checkins")
      .select(
        "breakfast_completed,lunch_completed,dinner_completed",
      )
      .eq("user_id", auth.user.id)
      .eq("local_date", today)
      .maybeSingle(),
    supabase
      .from("daily_checkins")
      .select(
        "breakfast_completed,lunch_completed,dinner_completed",
      )
      .eq("user_id", auth.user.id)
      .gte("local_date", weekStart)
      .lte("local_date", today),
  ]);

  let mealDetails:
    | Partial<Record<"breakfast" | "lunch" | "dinner", string>>
    | undefined;
  if (planResult.data && goal) {
    const resolved = resolvePlanDay(today, goal.plan_start_date);
    if (resolved) {
      const { data: planDay } = await supabase
        .from("plan_days")
        .select("id")
        .eq("plan_id", planResult.data.id)
        .eq("day_index", resolved.dayIndex)
        .maybeSingle();
      if (planDay) {
        const { data: planMeals } = await supabase
          .from("plan_meals")
          .select("id,meal_type")
          .eq("plan_day_id", planDay.id)
          .order("sort_order");
        const mealIds = (planMeals ?? []).map((meal) => meal.id);
        const { data: planItems } = mealIds.length
          ? await supabase
              .from("plan_items")
              .select("plan_meal_id,sort_order,food:foods(english_name)")
              .in("plan_meal_id", mealIds)
              .order("sort_order")
          : { data: [] };
        mealDetails = Object.fromEntries(
          (planMeals ?? []).map((meal) => [
            meal.meal_type,
            (planItems ?? [])
              .filter((item) => item.plan_meal_id === meal.id)
              .flatMap((item) =>
                item.food ? [item.food.english_name] : [],
              )
              .join(", ") || "No items in this meal.",
          ]),
        );
      }
    }
  }

  const weights = weightsResult.data ?? [];
  const latestWeight = weights[0]?.weight_kg ?? null;
  const baseline =
    weights.find((entry) => entry.is_onboarding_baseline)?.weight_kg ?? null;
  const activityMap = {
    sedentary: "sedentary",
    lightly_active: "light",
    moderately_active: "moderate",
    very_active: "very_active",
    extremely_active: "very_active",
  } as const;
  const estimate =
    goal && profile
      ? calculateNutritionEstimate({
          weightKg: latestWeight,
          heightCm: profile.height_cm,
          ageYears: profile.age,
          sexForEstimate:
            profile.gender === "male" || profile.gender === "female"
              ? profile.gender
              : "unspecified",
          activityLevel: profile.activity_level
            ? activityMap[profile.activity_level]
            : null,
          goalType: goal.goal_type,
          relevantMedicalConcerns: Boolean(profile.safety_context),
        })
      : null;
  const weeklyMarked = (weekResult.data ?? []).reduce(
    (sum, checkin) =>
      sum +
      Number(checkin.breakfast_completed) +
      Number(checkin.lunch_completed) +
      Number(checkin.dinner_completed),
    0,
  );
  const elapsedWeekDays =
    Math.max(1, Math.round((Date.parse(`${today}T12:00:00Z`) -
      Date.parse(`${weekStart}T12:00:00Z`)) / 86_400_000) + 1);
  const weightPoints: TodayWeightPoint[] = weights
    .slice(0, 7)
    .reverse()
    .map((entry) => ({
      day: format(parseISO(entry.local_date), "EEE"),
      weight: entry.weight_kg,
    }));

  return (
    <TodayDashboard
      demoMode={false}
      name={(profile?.full_name ?? "Member").split(/\s+/)[0]}
      timeZone={timeZone}
      initialCompleted={{
        breakfast: checkinResult.data?.breakfast_completed ?? false,
        lunch: checkinResult.data?.lunch_completed ?? false,
        dinner: checkinResult.data?.dinner_completed ?? false,
      }}
      mealDetails={mealDetails}
      weightPoints={weightPoints}
      providerLabel={
        planResult.data
          ? planResult.data.provider === "mock"
            ? "Mock AI plan — development only"
            : `Suggested by AI · ${planResult.data.model}`
          : "No accepted plan yet"
      }
      weeklyMarked={weeklyMarked}
      weeklyPossible={elapsedWeekDays * 3}
      energyRange={
        estimate?.calorieRange
          ? {
              minimum: estimate.calorieRange.minimum,
              maximum: estimate.calorieRange.maximum,
            }
          : null
      }
      proteinRange={
        estimate?.proteinRange
          ? {
              minimum: estimate.proteinRange.minimum,
              maximum: estimate.proteinRange.maximum,
            }
          : null
      }
      goalContext={
        goal
          ? {
              type: goal.goal_type,
              targetDate: format(parseISO(goal.target_date), "MMM d"),
              currentKg: latestWeight,
              targetKg: goal.target_weight_kg,
              startKg: baseline,
              remainingDays: remainingDays(goal.target_date, {
                timeZone,
              }),
            }
          : null
      }
    />
  );
}
