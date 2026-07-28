export interface FoodEligibilityMetadata {
  id: string;
  allergens?: readonly string[];
  dietaryRestrictionViolations?: readonly string[];
}

export interface FoodEligibilityProfile {
  allergies: readonly string[];
  dietaryRestrictions: readonly string[];
}

export interface FoodExclusion {
  foodId: string;
  allergyMatches: string[];
  restrictionMatches: string[];
}

const TERM_ALIASES: Readonly<Record<string, string>> = {
  dairy: "milk",
  "dairy free": "milk",
  "tree nuts": "tree nut",
  "tree nut": "tree nut",
  peanuts: "peanut",
  shellfish: "shellfish",
  gluten: "gluten",
  "gluten free": "gluten_free",
  vegetarianism: "vegetarian",
  veganism: "vegan",
};

export function normalizeFoodSafetyTerm(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  return TERM_ALIASES[normalized] ?? normalized;
}

function intersections(
  profileValues: readonly string[],
  foodValues: readonly string[],
): string[] {
  const foodSet = new Set(foodValues.map(normalizeFoodSafetyTerm));
  return [
    ...new Set(
      profileValues
        .map(normalizeFoodSafetyTerm)
        .filter((value) => foodSet.has(value)),
    ),
  ];
}

export function evaluateFoodEligibility(
  food: FoodEligibilityMetadata,
  profile: FoodEligibilityProfile,
): FoodExclusion | null {
  const allergyMatches = intersections(profile.allergies, food.allergens ?? []);
  const restrictionMatches = intersections(
    profile.dietaryRestrictions,
    food.dietaryRestrictionViolations ?? [],
  );
  return allergyMatches.length > 0 || restrictionMatches.length > 0
    ? { foodId: food.id, allergyMatches, restrictionMatches }
    : null;
}

export function filterEligibleFoods<T extends FoodEligibilityMetadata>(
  foods: readonly T[],
  profile: FoodEligibilityProfile,
): {
  allowed: T[];
  excluded: Array<{ food: T; reasons: FoodExclusion }>;
} {
  const allowed: T[] = [];
  const excluded: Array<{ food: T; reasons: FoodExclusion }> = [];
  for (const food of foods) {
    const reasons = evaluateFoodEligibility(food, profile);
    if (reasons) excluded.push({ food, reasons });
    else allowed.push(food);
  }
  return { allowed, excluded };
}
