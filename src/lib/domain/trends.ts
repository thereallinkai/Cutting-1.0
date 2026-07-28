import {
  addLocalDays,
  daysBetweenLocalDates,
  enumerateLocalDates,
} from "./dates";

export interface WeightEntry {
  localDate: string;
  weightKg: number;
}

export interface SevenDayTrend {
  state: "complete" | "insufficient_data";
  startDate: string;
  endDate: string;
  observationCount: number;
  missingDates: string[];
  averageKg: number | null;
  changeKg: number | null;
}

export interface RollingAveragePoint {
  localDate: string;
  weightKg: number | null;
  rollingAverageKg: number | null;
  observationCount: number;
}

export interface CompleteWeekComparison {
  state: "complete" | "insufficient_data";
  previousWeekStart: string;
  currentWeekStart: string;
  previousAverageKg: number | null;
  currentAverageKg: number | null;
  changeKg: number | null;
  missingDates: string[];
}

function entryMap(entries: readonly WeightEntry[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const entry of entries) {
    // The date parser is exercised by date arithmetic.
    daysBetweenLocalDates(entry.localDate, entry.localDate);
    if (!Number.isFinite(entry.weightKg) || entry.weightKg <= 0) {
      throw new RangeError("Weight entries must contain positive finite values.");
    }
    result.set(entry.localDate, entry.weightKg);
  }
  return result;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateSevenDayTrend(
  entries: readonly WeightEntry[],
  endDate: string,
): SevenDayTrend {
  const startDate = addLocalDays(endDate, -6);
  const dates = enumerateLocalDates(startDate, endDate);
  const values = entryMap(entries);
  const observed = dates.flatMap((date) => {
    const value = values.get(date);
    return value === undefined ? [] : [value];
  });
  const missingDates = dates.filter((date) => !values.has(date));
  if (missingDates.length > 0) {
    return {
      state: "insufficient_data",
      startDate,
      endDate,
      observationCount: observed.length,
      missingDates,
      averageKg: null,
      changeKg: null,
    };
  }

  return {
    state: "complete",
    startDate,
    endDate,
    observationCount: 7,
    missingDates: [],
    averageKg: average(observed),
    changeKg: observed[6] - observed[0],
  };
}

export function buildSevenDayRollingAverageSeries(
  entries: readonly WeightEntry[],
  range?: { startDate: string; endDate: string },
): RollingAveragePoint[] {
  if (entries.length === 0 && !range) return [];
  const values = entryMap(entries);
  const sortedDates = [...values.keys()].sort();
  const startDate = range?.startDate ?? sortedDates[0];
  const endDate = range?.endDate ?? sortedDates[sortedDates.length - 1];

  return enumerateLocalDates(startDate, endDate).map((localDate) => {
    const windowDates = enumerateLocalDates(addLocalDays(localDate, -6), localDate);
    const observed = windowDates.flatMap((date) => {
      const value = values.get(date);
      return value === undefined ? [] : [value];
    });
    return {
      localDate,
      weightKg: values.get(localDate) ?? null,
      rollingAverageKg:
        observed.length === 7 ? average(observed) : null,
      observationCount: observed.length,
    };
  });
}

/**
 * Compares two adjacent seven-day calendar periods. `currentWeekStart` is the
 * first date of the newer period; both periods must have one entry per date.
 */
export function compareCompleteWeeks(
  entries: readonly WeightEntry[],
  currentWeekStart: string,
): CompleteWeekComparison {
  const previousWeekStart = addLocalDays(currentWeekStart, -7);
  const previousDates = enumerateLocalDates(
    previousWeekStart,
    addLocalDays(currentWeekStart, -1),
  );
  const currentDates = enumerateLocalDates(
    currentWeekStart,
    addLocalDays(currentWeekStart, 6),
  );
  const values = entryMap(entries);
  const allDates = [...previousDates, ...currentDates];
  const missingDates = allDates.filter((date) => !values.has(date));
  if (missingDates.length > 0) {
    return {
      state: "insufficient_data",
      previousWeekStart,
      currentWeekStart,
      previousAverageKg: null,
      currentAverageKg: null,
      changeKg: null,
      missingDates,
    };
  }
  const previousAverageKg = average(
    previousDates.map((date) => values.get(date)!),
  );
  const currentAverageKg = average(
    currentDates.map((date) => values.get(date)!),
  );
  return {
    state: "complete",
    previousWeekStart,
    currentWeekStart,
    previousAverageKg,
    currentAverageKg,
    changeKg: currentAverageKg - previousAverageKg,
    missingDates: [],
  };
}
