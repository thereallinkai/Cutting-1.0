import { describe, expect, it } from "vitest";

import {
  AI_PLAN_SCHEMA_VERSION,
  aiPlanSchema,
  validateAiPlanDomain,
  type AiPlan,
  type AllowedPlanFood,
} from "../../src/lib/domain/ai-plan";

const allowedFoods: AllowedPlanFood[] = [
  {
    id: "oats",
    allowedMeasurementBases: ["dry"],
    allowedUnits: ["g"],
    minimumQuantity: { g: 10 },
    maximumQuantity: { g: 200 },
    allergens: [],
    dietaryRestrictionViolations: [],
    verificationStatus: "verified",
  },
  {
    id: "milk",
    allowedMeasurementBases: ["label_serving"],
    allowedUnits: ["serving"],
    allergens: ["milk"],
    dietaryRestrictionViolations: ["vegan"],
    verificationStatus: "user_label",
  },
];

function makePlan(foodId = "oats"): AiPlan {
  return {
    schemaVersion: AI_PLAN_SCHEMA_VERSION,
    planApproach: "standard",
    goalAssessment: "The requested direction and timeline are estimates.",
    days: Array.from({ length: 7 }, (_, index) => ({
      dayIndex: index + 1,
      meals: (["breakfast", "lunch", "dinner"] as const).map((mealType) => ({
        mealType,
        items: [
          foodId === "milk"
            ? {
                foodId,
                quantity: 1,
                unit: "serving" as const,
                measurementBasis: "label_serving" as const,
              }
            : {
                foodId,
                quantity: 60,
                unit: "g" as const,
                measurementBasis: "dry" as const,
              },
        ],
      })),
    })) as AiPlan["days"],
    assumptions: ["Food quantities use the listed measurement basis."],
    majorReasons: ["The plan uses foods selected by the user."],
    hydrationGuidance: "Use thirst and professional guidance as appropriate.",
    weeklyReviewRules: [
      "Review only after complete trend periods and consistent check-in data.",
    ],
    safetyNotes: ["This plan is general wellness information."],
  };
}

const emptyProfile = { allergies: [], dietaryRestrictions: [] };

describe("AI plan structured output", () => {
  it("accepts a structurally and domain-valid seven-day plan", () => {
    const result = validateAiPlanDomain(makePlan(), {
      allowedFoods,
      profile: emptyProfile,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.plan.days).toHaveLength(7);
  });

  it("requires exactly one of each day index", () => {
    const plan = makePlan();
    plan.days[6].dayIndex = 6;
    const result = aiPlanSchema.safeParse(plan);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("index 7"))).toBe(
        true,
      );
    }
  });

  it("requires breakfast, lunch, and dinner exactly once per day", () => {
    const plan = makePlan();
    plan.days[0].meals[2].mealType = "lunch";
    expect(aiPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("rejects duplicate food-basis entries within one meal", () => {
    const plan = makePlan();
    plan.days[0].meals[0].items.push({
      ...plan.days[0].meals[0].items[0],
    });
    expect(aiPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("rejects unknown foods rather than letting AI expand the catalog", () => {
    const result = validateAiPlanDomain(makePlan("invented-food"), {
      allowedFoods,
      profile: emptyProfile,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.code === "unknown_food")).toBe(
        true,
      );
    }
  });

  it("rejects external source-reported food until catalog review", () => {
    const result = validateAiPlanDomain(makePlan(), {
      allowedFoods: [
        { ...allowedFoods[0], verificationStatus: "source_reported" },
      ],
      profile: emptyProfile,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: "verification" }),
      );
    }
  });

  it("rejects measurement bases and portions outside trusted bounds", () => {
    const plan = makePlan();
    plan.days[0].meals[0].items[0].measurementBasis = "cooked";
    plan.days[0].meals[1].items[0].quantity = 300;
    const result = validateAiPlanDomain(plan, {
      allowedFoods,
      profile: emptyProfile,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(["measurement_basis", "portion"]),
      );
    }
  });

  it("rechecks allergens after generation", () => {
    const result = validateAiPlanDomain(makePlan("milk"), {
      allowedFoods,
      profile: { allergies: ["dairy"], dietaryRestrictions: [] },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.code === "allergen")).toBe(true);
    }
  });

  it("rechecks dietary restrictions after generation", () => {
    const result = validateAiPlanDomain(makePlan("milk"), {
      allowedFoods,
      profile: { allergies: [], dietaryRestrictions: ["vegan"] },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some((issue) => issue.code === "dietary_restriction"),
      ).toBe(true);
    }
  });

  it("requires a non-restrictive approach when safety flags apply", () => {
    const result = validateAiPlanDomain(makePlan(), {
      allowedFoods,
      profile: emptyProfile,
      requiresNonRestrictivePlan: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: "unsafe_approach" }),
      );
    }
  });

  it("rejects guarantee or diagnostic language", () => {
    const plan = makePlan();
    plan.goalAssessment = "This guarantees that your weight will change.";
    const result = validateAiPlanDomain(plan, {
      allowedFoods,
      profile: emptyProfile,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.code === "unsafe_language")).toBe(
        true,
      );
    }
  });

  it("rejects unexpected nutrition facts from the language model", () => {
    const plan = makePlan() as AiPlan & { calories?: number };
    plan.calories = 1_800;
    expect(aiPlanSchema.safeParse(plan).success).toBe(false);
  });
});
