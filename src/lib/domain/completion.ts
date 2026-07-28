export type MealCompletionState = {
  breakfastCompleted: boolean;
  lunchCompleted: boolean;
  dinnerCompleted: boolean;
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
