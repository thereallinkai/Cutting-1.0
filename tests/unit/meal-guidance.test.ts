import { describe, expect, it } from "vitest";

import {
  formatMealCategoryWarnings,
  validateMealCategories,
  type MealCategoryWarning,
} from "../../src/lib/domain/meal-guidance";

describe("meal composition guidance", () => {
  it("finds the required categories for each meal", () => {
    const warnings = validateMealCategories({
      breakfast: [{ categories: ["carbohydrate", "protein"] }],
      lunch: [
        { categories: ["protein"] },
        { categories: ["vegetable"] },
      ],
      dinner: [{ categories: ["carbohydrate", "vegetable"] }],
    });
    expect(warnings).toEqual([
      {
        mealType: "lunch",
        missingCategory: "carbohydrate",
        code: "missing_carbohydrate",
      },
      {
        mealType: "dinner",
        missingCategory: "protein",
        code: "missing_protein",
      },
    ]);
  });

  it("treats multi-category foods as satisfying every matching category", () => {
    expect(
      validateMealCategories({
        breakfast: [{ categories: ["carbohydrate", "protein", "dairy"] }],
        lunch: [{ categories: ["carbohydrate", "protein", "vegetable"] }],
        dinner: [{ categories: ["carbohydrate", "protein", "vegetable"] }],
      }),
    ).toEqual([]);
  });

  it("reproduces the required consolidated warning grammar", () => {
    const warnings: MealCategoryWarning[] = [
      {
        mealType: "lunch",
        missingCategory: "carbohydrate",
        code: "missing_carbohydrate",
      },
      {
        mealType: "lunch",
        missingCategory: "protein",
        code: "missing_protein",
      },
      {
        mealType: "dinner",
        missingCategory: "protein",
        code: "missing_protein",
      },
    ];
    expect(formatMealCategoryWarnings(warnings)).toBe(
      "Your lunch has no carbohydrate source, and your lunch and dinner have no protein source.",
    );
  });

  it("uses an Oxford comma for all three meals", () => {
    const warnings: MealCategoryWarning[] = [
      {
        mealType: "breakfast",
        missingCategory: "protein",
        code: "missing_protein",
      },
      {
        mealType: "lunch",
        missingCategory: "protein",
        code: "missing_protein",
      },
      {
        mealType: "dinner",
        missingCategory: "protein",
        code: "missing_protein",
      },
    ];
    expect(formatMealCategoryWarnings(warnings)).toBe(
      "Your breakfast, lunch, and dinner have no protein source.",
    );
  });

  it("deduplicates warnings and returns an empty string when none exist", () => {
    const warning: MealCategoryWarning = {
      mealType: "dinner",
      missingCategory: "vegetable",
      code: "missing_vegetable",
    };
    expect(formatMealCategoryWarnings([warning, warning])).toBe(
      "Your dinner has no vegetable.",
    );
    expect(formatMealCategoryWarnings([])).toBe("");
  });
});
