import { describe, expect, it } from "vitest";

import {
  evaluateFoodEligibility,
  filterEligibleFoods,
  normalizeFoodSafetyTerm,
} from "../../src/lib/domain/food-filter";

const foods = [
  {
    id: "milk",
    allergens: ["milk"],
    dietaryRestrictionViolations: ["vegan", "dairy_free"],
  },
  {
    id: "tofu",
    allergens: ["soy"],
    dietaryRestrictionViolations: [],
  },
  {
    id: "chicken",
    allergens: [],
    dietaryRestrictionViolations: ["vegan", "vegetarian"],
  },
] as const;

describe("allergen and restriction filtering", () => {
  it("normalizes casing, punctuation, and recognized allergy aliases", () => {
    expect(normalizeFoodSafetyTerm(" DAIRY ")).toBe("milk");
    expect(normalizeFoodSafetyTerm("Tree-Nuts")).toBe("tree nut");
  });

  it("excludes an allergen match deterministically", () => {
    const result = evaluateFoodEligibility(foods[0], {
      allergies: ["Dairy"],
      dietaryRestrictions: [],
    });
    expect(result).toMatchObject({
      foodId: "milk",
      allergyMatches: ["milk"],
    });
  });

  it("excludes dietary restriction violations", () => {
    const result = filterEligibleFoods(foods, {
      allergies: [],
      dietaryRestrictions: ["vegan"],
    });
    expect(result.allowed.map((food) => food.id)).toEqual(["tofu"]);
    expect(result.excluded.map(({ food }) => food.id)).toEqual([
      "milk",
      "chicken",
    ]);
  });

  it("does not use unsafe substring matching", () => {
    expect(
      evaluateFoodEligibility(
        { id: "safe", allergens: ["coconut"] },
        { allergies: ["nut"], dietaryRestrictions: [] },
      ),
    ).toBeNull();
  });

  it("reports allergy and restriction reasons independently", () => {
    expect(
      evaluateFoodEligibility(foods[0], {
        allergies: ["milk"],
        dietaryRestrictions: ["vegan"],
      }),
    ).toEqual({
      foodId: "milk",
      allergyMatches: ["milk"],
      restrictionMatches: ["vegan"],
    });
  });
});
