import {
  daysBetweenLocalDates,
  localDateInTimeZone,
  parseLocalDate,
} from "./dates";

export interface ResolvedPlanDay {
  localDate: string;
  dayIndex: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  cycleNumber: number;
}

export function resolvePlanDay(
  localDate: string,
  planStartDate: string,
  planEndDate?: string,
): ResolvedPlanDay | null {
  parseLocalDate(localDate);
  parseLocalDate(planStartDate);
  if (planEndDate) parseLocalDate(planEndDate);
  const offset = daysBetweenLocalDates(planStartDate, localDate);
  if (offset < 0) return null;
  if (
    planEndDate &&
    daysBetweenLocalDates(localDate, planEndDate) < 0
  ) {
    return null;
  }
  return {
    localDate,
    dayIndex: ((offset % 7) + 1) as ResolvedPlanDay["dayIndex"],
    cycleNumber: Math.floor(offset / 7) + 1,
  };
}

export function resolvePlanDayForInstant(
  instant: Date | string | number,
  timeZone: string,
  planStartDate: string,
  planEndDate?: string,
): ResolvedPlanDay | null {
  return resolvePlanDay(
    localDateInTimeZone(instant, timeZone),
    planStartDate,
    planEndDate,
  );
}
