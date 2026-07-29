import { describe, expect, it } from "vitest";

import {
  normalizeMealFoodSlugs,
  parseOptionalHeight,
  parseWeightKg,
} from "../../src/lib/onboarding-input";

describe("onboarding input compatibility", () => {
  it("converts common imperial height formats to centimeters", () => {
    expect(parseOptionalHeight("5 ft 10 in")).toEqual({
      ok: true,
      heightCm: 177.8,
    });
    expect(parseOptionalHeight(`5'10"`)).toEqual({
      ok: true,
      heightCm: 177.8,
    });
  });

  it("accepts metric or blank heights and rejects ambiguous out-of-range values", () => {
    expect(parseOptionalHeight("175 cm")).toEqual({
      ok: true,
      heightCm: 175,
    });
    expect(parseOptionalHeight("")).toEqual({
      ok: true,
      heightCm: null,
    });
    expect(parseOptionalHeight("510")).toEqual({
      ok: false,
      heightCm: null,
    });
    expect(parseOptionalHeight("5 10")).toEqual({
      ok: false,
      heightCm: null,
    });
  });

  it("normalizes and deduplicates legacy food slugs", () => {
    expect(
      normalizeMealFoodSlugs([
        "vegetable-vitamin-powder",
        "vegetable-or-vitamin-powder",
        "rolled-oats",
      ]),
    ).toEqual(["vegetable-or-vitamin-powder", "rolled-oats"]);
  });

  it("derives bounded kilograms from the reviewed weight and unit", () => {
    expect(parseWeightKg("82.5", "kg")).toEqual({
      ok: true,
      weightKg: 82.5,
    });
    expect(parseWeightKg("210", "lb")).toEqual({
      ok: true,
      weightKg: 95.254,
    });
    expect(parseWeightKg("43", "lb")).toEqual({
      ok: false,
      weightKg: null,
    });
    expect(parseWeightKg("1e2", "kg")).toEqual({
      ok: false,
      weightKg: null,
    });
  });
});
