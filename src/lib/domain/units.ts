export const KILOGRAM_TO_POUND = 2.2046226218 as const;

export type WeightUnit = "kg" | "lb";

export interface SynchronizedWeightInput {
  kilograms: string;
  pounds: string;
  canonicalKilograms: number | null;
  editedUnit: WeightUnit;
  status: "empty" | "incomplete" | "invalid" | "valid";
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}

export function roundDecimal(value: number, decimalPlaces = 1): number {
  assertFinite(value, "Value");
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 12) {
    throw new RangeError("Decimal places must be an integer from 0 through 12.");
  }

  const [coefficient, exponentText = "0"] = value.toString().split("e");
  const exponent = Number(exponentText);
  const shifted = Number(`${coefficient}e${exponent + decimalPlaces}`);
  const rounded = Math.round(shifted);
  return Number(`${rounded}e${-decimalPlaces}`);
}

export function kilogramsToPounds(kilograms: number): number {
  assertFinite(kilograms, "Kilograms");
  return kilograms * KILOGRAM_TO_POUND;
}

export function poundsToKilograms(pounds: number): number {
  assertFinite(pounds, "Pounds");
  return pounds / KILOGRAM_TO_POUND;
}

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) {
    assertFinite(value, "Weight");
    return value;
  }
  return from === "kg" ? kilogramsToPounds(value) : poundsToKilograms(value);
}

export function formatDecimal(value: number, decimalPlaces = 1): string {
  const rounded = roundDecimal(value, decimalPlaces);
  const fixed = rounded.toFixed(decimalPlaces);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

export function formatWeight(
  value: number,
  unit: WeightUnit,
  decimalPlaces = 1,
): string {
  return `${formatDecimal(value, decimalPlaces)} ${unit}`;
}

function classifyNumericInput(rawValue: string): "empty" | "incomplete" | "invalid" | "valid" {
  const trimmed = rawValue.trim();
  if (trimmed === "") return "empty";
  if (trimmed === "." || /^\d+\.$/.test(trimmed)) return "incomplete";
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return "invalid";

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? "valid" : "invalid";
}

/**
 * Keeps the user-edited field byte-for-byte intact and derives only the other
 * field. A UI should call this only for user-originated changes; the returned
 * `editedUnit` identifies the field that must not be written back.
 */
export function synchronizeWeightInput(
  editedUnit: WeightUnit,
  rawValue: string,
  convertedDecimalPlaces = 4,
): SynchronizedWeightInput {
  const status = classifyNumericInput(rawValue);
  const emptyResult: SynchronizedWeightInput = {
    kilograms: editedUnit === "kg" ? rawValue : "",
    pounds: editedUnit === "lb" ? rawValue : "",
    canonicalKilograms: null,
    editedUnit,
    status,
  };

  if (status === "empty" || status === "invalid") return emptyResult;

  const parsed = Number(rawValue);
  if (status === "incomplete" && !Number.isFinite(parsed)) return emptyResult;

  const canonicalKilograms =
    editedUnit === "kg" ? parsed : poundsToKilograms(parsed);
  const converted =
    editedUnit === "kg" ? kilogramsToPounds(parsed) : canonicalKilograms;

  return {
    kilograms:
      editedUnit === "kg"
        ? rawValue
        : formatDecimal(converted, convertedDecimalPlaces),
    pounds:
      editedUnit === "lb"
        ? rawValue
        : formatDecimal(converted, convertedDecimalPlaces),
    canonicalKilograms,
    editedUnit,
    status,
  };
}

export function shouldApplySynchronizedValue(
  sourceUnit: WeightUnit,
  targetUnit: WeightUnit,
  currentValue: string,
  nextValue: string,
): boolean {
  return sourceUnit !== targetUnit && currentValue !== nextValue;
}
