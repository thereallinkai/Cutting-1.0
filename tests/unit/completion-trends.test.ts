import { describe, expect, it } from "vitest";

import {
  dailyMealCompletionPercentage,
  weeklyMealCompletion,
} from "../../src/lib/domain/completion";
import { addLocalDays } from "../../src/lib/domain/dates";
import {
  buildSevenDayRollingAverageSeries,
  calculateSevenDayTrend,
  compareCompleteWeeks,
  type WeightEntry,
} from "../../src/lib/domain/trends";

function entries(
  startDate: string,
  weights: readonly number[],
): WeightEntry[] {
  return weights.map((weightKg, index) => ({
    localDate: addLocalDays(startDate, index),
    weightKg,
  }));
}

describe("completion percentages", () => {
  it("calculates daily completion across three planned meals", () => {
    expect(
      dailyMealCompletionPercentage({
        breakfastCompleted: true,
        lunchCompleted: false,
        dinnerCompleted: true,
      }),
    ).toBeCloseTo(66.6666666667);
  });

  it("counts missing eligible-day check-ins as not marked", () => {
    const result = weeklyMealCompletion({
      checkins: [
        {
          breakfastCompleted: true,
          lunchCompleted: true,
          dinnerCompleted: true,
        },
      ],
      eligibleDays: 2,
    });
    expect(result).toEqual({
      completedMeals: 3,
      eligibleMeals: 6,
      percentage: 50,
    });
  });
});

describe("weight trends", () => {
  it("produces a complete seven-day average", () => {
    const result = calculateSevenDayTrend(
      entries("2026-07-01", [70, 71, 72, 73, 74, 75, 76]),
      "2026-07-07",
    );
    expect(result).toMatchObject({
      state: "complete",
      observationCount: 7,
      averageKg: 73,
      changeKg: 6,
      missingDates: [],
    });
  });

  it("returns an explicit insufficient-data state for a sparse week", () => {
    const result = calculateSevenDayTrend(
      [
        { localDate: "2026-07-01", weightKg: 70 },
        { localDate: "2026-07-07", weightKg: 69 },
      ],
      "2026-07-07",
    );
    expect(result.state).toBe("insufficient_data");
    expect(result.averageKg).toBeNull();
    expect(result.observationCount).toBe(2);
    expect(result.missingDates).toContain("2026-07-04");
  });

  it("renders missing dates as gaps rather than zero", () => {
    const series = buildSevenDayRollingAverageSeries(
      [
        { localDate: "2026-07-01", weightKg: 70 },
        { localDate: "2026-07-03", weightKg: 69.5 },
      ],
      { startDate: "2026-07-01", endDate: "2026-07-03" },
    );
    expect(series[1]).toEqual({
      localDate: "2026-07-02",
      weightKg: null,
      rollingAverageKg: null,
      observationCount: 1,
    });
  });

  it("only emits a rolling average for a complete calendar window", () => {
    const series = buildSevenDayRollingAverageSeries(
      entries("2026-07-01", [70, 70, 70, 70, 70, 70, 70]),
    );
    expect(series.slice(0, 6).every((point) => point.rollingAverageKg === null)).toBe(
      true,
    );
    expect(series[6].rollingAverageKg).toBe(70);
  });

  it("compares two adjacent complete weeks", () => {
    const result = compareCompleteWeeks(
      entries("2026-06-24", [
        72, 72, 72, 72, 72, 72, 72, 71, 71, 71, 71, 71, 71, 71,
      ]),
      "2026-07-01",
    );
    expect(result).toMatchObject({
      state: "complete",
      previousAverageKg: 72,
      currentAverageKg: 71,
      changeKg: -1,
    });
  });

  it("refuses to compare incomplete weeks", () => {
    const sparse = entries("2026-06-24", [
      72, 72, 72, 72, 72, 72, 72, 71, 71, 71, 71, 71, 71,
    ]);
    const result = compareCompleteWeeks(sparse, "2026-07-01");
    expect(result.state).toBe("insufficient_data");
    expect(result.currentAverageKg).toBeNull();
    expect(result.missingDates).toEqual(["2026-07-07"]);
  });
});
