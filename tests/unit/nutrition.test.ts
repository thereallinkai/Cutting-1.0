import { describe, expect, it } from "vitest";

import {
  NutritionAggregationError,
  aggregateNutrition,
  combineNutritionAggregations,
  type NutritionRecord,
} from "../../src/lib/domain/nutrition";

const records: NutritionRecord[] = [
  {
    foodId: "rice",
    measurementBasis: "cooked",
    referenceQuantity: 100,
    referenceUnit: "g",
    calories: 130,
    proteinGrams: 2.7,
    carbohydrateGrams: 28,
    fatGrams: 0.3,
    fiberGrams: 0.4,
    sodiumMilligrams: 1,
    verificationStatus: "verified",
  },
  {
    foodId: "rice",
    measurementBasis: "dry",
    referenceQuantity: 100,
    referenceUnit: "g",
    calories: 365,
    proteinGrams: 7.1,
    carbohydrateGrams: 80,
    fatGrams: 0.7,
    fiberGrams: 1.3,
    sodiumMilligrams: 5,
    verificationStatus: "verified",
  },
  {
    foodId: "label-whey",
    measurementBasis: "label_serving",
    referenceQuantity: 1,
    referenceUnit: "serving",
    calories: 120,
    proteinGrams: 24,
    carbohydrateGrams: 3,
    fatGrams: 1,
    fiberGrams: null,
    sodiumMilligrams: 90,
    verificationStatus: "user_label",
  },
];

describe("nutrition aggregation", () => {
  it("scales a per-100-gram record to the requested amount", () => {
    const result = aggregateNutrition(
      [
        {
          foodId: "rice",
          quantity: 150,
          unit: "g",
          measurementBasis: "cooked",
        },
      ],
      records,
    );
    expect(result.totals.calories).toBe(195);
    expect(result.totals.proteinGrams).toBeCloseTo(4.05);
    expect(result.totals.carbohydrateGrams).toBe(42);
  });

  it("uses a user-entered label serving without inventing missing nutrients", () => {
    const result = aggregateNutrition(
      [
        {
          foodId: "label-whey",
          quantity: 2,
          unit: "serving",
          measurementBasis: "label_serving",
        },
      ],
      records,
    );
    expect(result.totals.proteinGrams).toBe(48);
    expect(result.totals.fiberGrams).toBeNull();
    expect(result.pendingNutrients).toEqual(["fiberGrams"]);
    expect(result.hasPendingVerification).toBe(false);
  });

  it("refuses to substitute a dry basis for a cooked item", () => {
    expect(() =>
      aggregateNutrition(
        [
          {
            foodId: "rice",
            quantity: 100,
            unit: "g",
            measurementBasis: "raw",
          },
        ],
        records,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<NutritionAggregationError>>({
        code: "measurement_basis_mismatch",
      }),
    );
  });

  it("refuses to mix grams and servings", () => {
    expect(() =>
      aggregateNutrition(
        [
          {
            foodId: "label-whey",
            quantity: 30,
            unit: "g",
            measurementBasis: "label_serving",
          },
        ],
        records,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<NutritionAggregationError>>({
        code: "unit_mismatch",
      }),
    );
  });

  it("marks an entire total unknown when any contributing value is unavailable", () => {
    const result = aggregateNutrition(
      [
        {
          foodId: "rice",
          quantity: 100,
          unit: "g",
          measurementBasis: "cooked",
        },
        {
          foodId: "label-whey",
          quantity: 1,
          unit: "serving",
          measurementBasis: "label_serving",
        },
      ],
      records,
    );
    expect(result.totals.calories).toBe(250);
    expect(result.totals.fiberGrams).toBeNull();
  });

  it("combines meal totals into authoritative daily totals", () => {
    const cookedRice = aggregateNutrition(
      [
        {
          foodId: "rice",
          quantity: 100,
          unit: "g",
          measurementBasis: "cooked",
        },
      ],
      records,
    );
    const whey = aggregateNutrition(
      [
        {
          foodId: "label-whey",
          quantity: 1,
          unit: "serving",
          measurementBasis: "label_serving",
        },
      ],
      records,
    );
    const daily = combineNutritionAggregations([cookedRice, whey]);
    expect(daily.totals.calories).toBe(250);
    expect(daily.totals.proteinGrams).toBeCloseTo(26.7);
    expect(daily.itemCount).toBe(2);
    expect(daily.totals.fiberGrams).toBeNull();
  });

  it("rejects missing records and invalid quantities", () => {
    expect(() =>
      aggregateNutrition(
        [
          {
            foodId: "unknown",
            quantity: 100,
            unit: "g",
            measurementBasis: "raw",
          },
        ],
        records,
      ),
    ).toThrow(/No nutrition record/);
    expect(() =>
      aggregateNutrition(
        [
          {
            foodId: "rice",
            quantity: 0,
            unit: "g",
            measurementBasis: "cooked",
          },
        ],
        records,
      ),
    ).toThrow(/must be positive/);
  });
});
