import { describe, expect, it } from "vitest";
import {
  AI_PLAN_SCHEMA_VERSION,
  validatePlanNutritionRanges,
  type AiPlan,
  type NutritionRecord,
} from "../../src/lib/domain";

const plan: AiPlan = {
  schemaVersion: AI_PLAN_SCHEMA_VERSION,
  planApproach: "standard",
  goalAssessment: "This is an estimate.",
  assumptions: [],
  majorReasons: [],
  hydrationGuidance: "Use thirst as a guide.",
  weeklyReviewRules: ["Review complete periods."],
  safetyNotes: [],
  days: Array.from({ length: 7 }, (_, index) => ({
    dayIndex: index + 1,
    meals: (["breakfast", "lunch", "dinner"] as const).map((mealType) => ({
      mealType,
      items: [
        {
          foodId: "food",
          quantity: 100,
          unit: "g" as const,
          measurementBasis: "cooked" as const,
        },
      ],
    })),
  })),
};

const verifiedRecord: NutritionRecord = {
  foodId: "food",
  measurementBasis: "cooked",
  referenceQuantity: 100,
  referenceUnit: "g",
  calories: 500,
  proteinGrams: 40,
  carbohydrateGrams: 50,
  fatGrams: 15,
  verificationStatus: "verified",
};

describe("plan nutrition range validation", () => {
  it("accepts recalculated daily totals inside deterministic ranges", () => {
    const result = validatePlanNutritionRanges(plan, [verifiedRecord], {
      energyKcal: { minimum: 1_400, maximum: 1_600 },
      proteinGrams: { minimum: 110, maximum: 130 },
    });

    expect(result.valid).toBe(true);
    expect(result.days[0]?.nutrition.totals.calories).toBe(1_500);
  });

  it("rejects known totals outside deterministic ranges", () => {
    const result = validatePlanNutritionRanges(plan, [verifiedRecord], {
      energyKcal: { minimum: 1_900, maximum: 2_100 },
      proteinGrams: { minimum: 150, maximum: 170 },
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "energy_out_of_range",
        "protein_out_of_range",
      ]),
    );
  });

  it("preserves unavailable nutrients as pending instead of inventing totals", () => {
    const result = validatePlanNutritionRanges(
      plan,
      [
        {
          ...verifiedRecord,
          calories: null,
          proteinGrams: null,
          carbohydrateGrams: null,
          fatGrams: null,
          verificationStatus: "unavailable",
        },
      ],
      {
        energyKcal: { minimum: 1_900, maximum: 2_100 },
        proteinGrams: { minimum: 150, maximum: 170 },
      },
    );

    expect(result.valid).toBe(true);
    expect(result.days[0]?.nutrition.totals.calories).toBeNull();
    expect(result.days[0]?.nutrition.hasPendingVerification).toBe(true);
  });

  it("rejects a plan that cannot be matched to its trusted measurement basis", () => {
    const result = validatePlanNutritionRanges(
      plan,
      [{ ...verifiedRecord, measurementBasis: "raw" }],
      { energyKcal: null, proteinGrams: null },
    );

    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("nutrition_record");
  });
});
