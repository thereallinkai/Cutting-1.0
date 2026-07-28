import { daysBetweenLocalDates } from "./dates";

export type GoalType =
  | "fat_loss"
  | "muscle_gain"
  | "maintenance"
  | "body_recomposition";

export type GoalDirection = "loss" | "gain" | "maintenance";

export interface GoalProgress {
  direction: GoalDirection;
  percentage: number;
  rawPercentage: number;
  changeFromStartKg: number;
  distanceFromTargetKg: number;
  reachedTarget: boolean;
  equalStartAndTarget: boolean;
}

export interface GoalAssessment {
  direction: GoalDirection;
  conflictsWithGoalType: boolean;
  desiredChangeKg: number;
  availableDays: number;
  impliedWeeklyChangeKg: number | null;
  unusuallyAggressive: boolean;
}

function assertWeight(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

export function getGoalDirection(
  startingWeightKg: number,
  targetWeightKg: number,
): GoalDirection {
  assertWeight(startingWeightKg, "Starting weight");
  assertWeight(targetWeightKg, "Target weight");
  if (targetWeightKg < startingWeightKg) return "loss";
  if (targetWeightKg > startingWeightKg) return "gain";
  return "maintenance";
}

export function goalTypeConflictsWithDirection(
  goalType: GoalType,
  direction: GoalDirection,
): boolean {
  if (goalType === "body_recomposition") return false;
  if (goalType === "fat_loss") return direction !== "loss";
  if (goalType === "muscle_gain") return direction !== "gain";
  return direction !== "maintenance";
}

export function calculateGoalProgress(
  startingWeightKg: number,
  currentWeightKg: number,
  targetWeightKg: number,
): GoalProgress {
  assertWeight(startingWeightKg, "Starting weight");
  assertWeight(currentWeightKg, "Current weight");
  assertWeight(targetWeightKg, "Target weight");

  const direction = getGoalDirection(startingWeightKg, targetWeightKg);
  const equalStartAndTarget = direction === "maintenance";
  const desiredChange = targetWeightKg - startingWeightKg;
  const actualChange = currentWeightKg - startingWeightKg;
  const rawPercentage = equalStartAndTarget
    ? currentWeightKg === targetWeightKg
      ? 100
      : 0
    : (actualChange / desiredChange) * 100;
  const percentage = Math.min(100, Math.max(0, rawPercentage));
  const reachedTarget =
    direction === "loss"
      ? currentWeightKg <= targetWeightKg
      : direction === "gain"
        ? currentWeightKg >= targetWeightKg
        : currentWeightKg === targetWeightKg;

  return {
    direction,
    percentage,
    rawPercentage,
    changeFromStartKg: actualChange,
    distanceFromTargetKg: Math.abs(targetWeightKg - currentWeightKg),
    reachedTarget,
    equalStartAndTarget,
  };
}

export function goalProgressPercentage(
  startingWeightKg: number,
  currentWeightKg: number,
  targetWeightKg: number,
): number {
  return calculateGoalProgress(startingWeightKg, currentWeightKg, targetWeightKg)
    .percentage;
}

export function assessGoalTimeline(input: {
  startingWeightKg: number;
  targetWeightKg: number;
  goalType: GoalType;
  startDate: string;
  targetDate: string;
}): GoalAssessment {
  const {
    startingWeightKg,
    targetWeightKg,
    goalType,
    startDate,
    targetDate,
  } = input;
  const direction = getGoalDirection(startingWeightKg, targetWeightKg);
  const availableDays = Math.max(0, daysBetweenLocalDates(startDate, targetDate));
  const desiredChangeKg = targetWeightKg - startingWeightKg;
  const impliedWeeklyChangeKg =
    availableDays > 0 ? (desiredChangeKg / availableDays) * 7 : null;
  const weeklyFraction =
    impliedWeeklyChangeKg === null
      ? 0
      : Math.abs(impliedWeeklyChangeKg) / startingWeightKg;
  const unusuallyAggressive =
    direction === "loss"
      ? weeklyFraction > 0.01
      : direction === "gain"
        ? weeklyFraction > 0.005
        : false;

  return {
    direction,
    conflictsWithGoalType: goalTypeConflictsWithDirection(goalType, direction),
    desiredChangeKg,
    availableDays,
    impliedWeeklyChangeKg,
    unusuallyAggressive,
  };
}
