import { describe, expect, it } from "vitest";

import {
  normalizeMealFoodSlugs,
  parseOptionalHeight,
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
});
