import {
  PRIMARY_MEAL_TYPES,
  isPrimaryMealType,
  type MealSlotCheckin,
} from "./meal-slots";

export type MealCompletionState = {
  breakfastCompleted: boolean;
  lunchCompleted: boolean;
  dinnerCompleted: boolean;
};

export type MealCheckinSummary = {
  completed: number;
  skipped: number;
  notMarked: number;
  marked: number;
  eligible: number;
  percentageMarked: number;
};

export function completionPercentage(states: readonly boolean[]): number {
  if (states.length === 0) return 0;
  const completed = states.filter(Boolean).length;
  return (completed / states.length) * 100;
}

export function dailyMealCompletionPercentage(
  state: MealCompletionState,
): number {
  return completionPercentage([
    state.breakfastCompleted,
    state.lunchCompleted,
    state.dinnerCompleted,
  ]);
}

export function summarizeMealCheckins(
  checkins: readonly MealSlotCheckin[],
  options: { includeOptionalSnacks?: boolean } = {},
): MealCheckinSummary {
  const eligible = options.includeOptionalSnacks
    ? checkins
    : checkins.filter((checkin) => isPrimaryMealType(checkin.mealType));
  const completed = eligible.filter(
    (checkin) => checkin.status === "completed",
  ).length;
  const skipped = eligible.filter(
    (checkin) => checkin.status === "skipped",
  ).length;
  const notMarked = eligible.filter(
    (checkin) => checkin.status === "not_marked",
  ).length;
  const marked = completed + skipped;

  return {
    completed,
    skipped,
    notMarked,
    marked,
    eligible: eligible.length,
    percentageMarked:
      eligible.length === 0 ? 0 : (marked / eligible.length) * 100,
  };
}

export function emptyPrimaryMealCheckins(): MealSlotCheckin[] {
  return PRIMARY_MEAL_TYPES.map((mealType) => ({
    mealType,
    status: "not_marked",
    skipReason: null,
  }));
}

export function weeklyMealCompletion(input: {
  checkins: readonly MealCompletionState[];
  eligibleDays?: number;
}): {
  completedMeals: number;
  eligibleMeals: number;
  percentage: number;
} {
  const eligibleDays = input.eligibleDays ?? input.checkins.length;
  if (
    !Number.isInteger(eligibleDays) ||
    eligibleDays < 0 ||
    eligibleDays < input.checkins.length
  ) {
    throw new RangeError(
      "Eligible days must be a non-negative integer at least as large as the supplied check-in count.",
    );
  }
  const completedMeals = input.checkins.reduce(
    (sum, checkin) =>
      sum +
      [
        checkin.breakfastCompleted,
        checkin.lunchCompleted,
        checkin.dinnerCompleted,
      ].filter(Boolean).length,
    0,
  );
  const eligibleMeals = eligibleDays * 3;
  return {
    completedMeals,
    eligibleMeals,
    percentage:
      eligibleMeals === 0 ? 0 : (completedMeals / eligibleMeals) * 100,
  };
}
