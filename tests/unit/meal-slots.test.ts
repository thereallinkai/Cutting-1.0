import { describe, expect, it } from "vitest";
import {
  MEAL_SLOTS,
  normalizeMealSlotCheckins,
  summarizeMealCheckins,
} from "../../src/lib/domain";

describe("meal-slot check-ins", () => {
  it("keeps the three primary meals and three optional snacks in display order", () => {
    expect(MEAL_SLOTS).toEqual([
      "breakfast",
      "morning_snack",
      "lunch",
      "afternoon_snack",
      "dinner",
      "evening_snack",
    ]);
  });

  it("fills missing slots with a neutral not-marked state", () => {
    const result = normalizeMealSlotCheckins([
      {
        mealType: "lunch",
        status: "skipped",
        skipReason: "Travel",
      },
    ]);

    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({
      mealType: "breakfast",
      status: "not_marked",
      skipReason: null,
    });
    expect(result[2]).toEqual({
      mealType: "lunch",
      status: "skipped",
      skipReason: "Travel",
    });
  });

  it("does not count empty optional snacks against the primary meal summary", () => {
    const checkins = normalizeMealSlotCheckins([
      {
        mealType: "breakfast",
        status: "completed",
        skipReason: null,
      },
      {
        mealType: "lunch",
        status: "skipped",
        skipReason: null,
      },
      {
        mealType: "morning_snack",
        status: "completed",
        skipReason: null,
      },
    ]);

    const summary = summarizeMealCheckins(checkins);
    expect(summary).toMatchObject({
      completed: 1,
      skipped: 1,
      notMarked: 1,
      marked: 2,
      eligible: 3,
    });
    expect(summary.percentageMarked).toBeCloseTo(200 / 3);
  });
});
