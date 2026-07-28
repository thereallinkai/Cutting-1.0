import { describe, expect, it } from "vitest";

import {
  KILOGRAM_TO_POUND,
  formatDecimal,
  formatWeight,
  kilogramsToPounds,
  poundsToKilograms,
  roundDecimal,
  shouldApplySynchronizedValue,
  synchronizeWeightInput,
} from "../../src/lib/domain/units";

describe("weight units", () => {
  it("uses the required exact conversion factor", () => {
    expect(KILOGRAM_TO_POUND).toBe(2.2046226218);
    expect(kilogramsToPounds(1)).toBe(2.2046226218);
  });

  it("converts pounds back to kilograms without display rounding", () => {
    expect(poundsToKilograms(220.46226218)).toBeCloseTo(100, 12);
  });

  it("rounds decimal values deterministically", () => {
    expect(roundDecimal(1.005, 2)).toBe(1.01);
    expect(roundDecimal(154.32345, 1)).toBe(154.3);
    expect(formatDecimal(100, 4)).toBe("100");
    expect(formatWeight(70.04, "kg", 1)).toBe("70 kg");
  });

  it("rejects non-finite values and unsupported precision", () => {
    expect(() => kilogramsToPounds(Number.NaN)).toThrow(/finite/);
    expect(() => roundDecimal(1, 13)).toThrow(/0 through 12/);
  });

  it("preserves the active kilogram text while deriving pounds", () => {
    const result = synchronizeWeightInput("kg", "70.00");
    expect(result).toMatchObject({
      kilograms: "70.00",
      pounds: "154.3236",
      canonicalKilograms: 70,
      editedUnit: "kg",
      status: "valid",
    });
  });

  it("preserves the active pound text while deriving canonical kilograms", () => {
    const result = synchronizeWeightInput("lb", "154.3236");
    expect(result.pounds).toBe("154.3236");
    expect(result.kilograms).toBe("70");
    expect(result.canonicalKilograms).toBeCloseTo(70, 4);
  });

  it("supports empty and partially typed values without cursor replacement", () => {
    expect(synchronizeWeightInput("kg", "")).toMatchObject({
      kilograms: "",
      pounds: "",
      status: "empty",
    });
    expect(synchronizeWeightInput("kg", "70.")).toMatchObject({
      kilograms: "70.",
      status: "incomplete",
    });
  });

  it("does not convert invalid or non-positive input", () => {
    expect(synchronizeWeightInput("lb", "-2")).toMatchObject({
      pounds: "-2",
      kilograms: "",
      canonicalKilograms: null,
      status: "invalid",
    });
    expect(synchronizeWeightInput("kg", "0").status).toBe("invalid");
  });

  it("provides an origin guard that prevents conversion loops", () => {
    expect(shouldApplySynchronizedValue("kg", "kg", "70", "70")).toBe(false);
    expect(shouldApplySynchronizedValue("kg", "lb", "154", "154.3")).toBe(true);
    expect(shouldApplySynchronizedValue("kg", "lb", "154.3", "154.3")).toBe(
      false,
    );
  });
});
