import { addLocalDays, parseLocalDate } from "./dates";

export const MINIMUM_REGISTRATION_AGE = 13;
export const MAXIMUM_REGISTRATION_AGE = 120;

export function utcCalendarDate(instant: Date | string | number = new Date()) {
  const date = new Date(instant);
  if (Number.isNaN(date.valueOf())) {
    throw new RangeError("Invalid instant.");
  }
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

/**
 * Calculates a whole-year age from two date-only values. Calendar dates are
 * parsed without a time zone so the result cannot shift with the host locale.
 */
export function calculateAgeOnDate(
  dateOfBirth: string,
  referenceDate: string,
): number {
  const birth = parseLocalDate(dateOfBirth);
  const reference = parseLocalDate(referenceDate);

  if (dateOfBirth > referenceDate) {
    throw new RangeError("Date of birth cannot be in the future.");
  }

  let age = reference.year - birth.year;
  if (
    reference.month < birth.month ||
    (reference.month === birth.month && reference.day < birth.day)
  ) {
    age -= 1;
  }
  return age;
}

export type RegistrationDateOfBirthValidation =
  | { valid: true; age: number; dateOfBirth: string }
  | {
      valid: false;
      reason: "invalid_date" | "age_out_of_range";
    };

function subtractCalendarYears(localDate: string, years: number) {
  const date = parseLocalDate(localDate);
  const targetYear = date.year - years;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, date.month, 0),
  ).getUTCDate();
  return [
    targetYear.toString().padStart(4, "0"),
    date.month.toString().padStart(2, "0"),
    Math.min(date.day, lastDayOfTargetMonth).toString().padStart(2, "0"),
  ].join("-");
}

/** Inclusive DOB bounds matching validateRegistrationDateOfBirth. */
export function registrationDateOfBirthBounds(referenceDate: string) {
  parseLocalDate(referenceDate);
  return {
    min: addLocalDays(
      subtractCalendarYears(referenceDate, MAXIMUM_REGISTRATION_AGE + 1),
      1,
    ),
    max: subtractCalendarYears(referenceDate, MINIMUM_REGISTRATION_AGE),
  };
}

export function validateRegistrationDateOfBirth(
  dateOfBirth: string,
  referenceDate = utcCalendarDate(),
): RegistrationDateOfBirthValidation {
  let age: number;
  try {
    age = calculateAgeOnDate(dateOfBirth, referenceDate);
  } catch {
    return { valid: false, reason: "invalid_date" };
  }

  if (age < MINIMUM_REGISTRATION_AGE || age > MAXIMUM_REGISTRATION_AGE) {
    return { valid: false, reason: "age_out_of_range" };
  }
  return { valid: true, age, dateOfBirth };
}

/** Uses the canonical DOB when present and falls back only for legacy accounts. */
export function resolveProfileAge(
  dateOfBirth: string | null | undefined,
  legacyAge: number | null | undefined,
  referenceDate: string,
): number | null {
  if (!dateOfBirth) return legacyAge ?? null;
  try {
    return calculateAgeOnDate(dateOfBirth, referenceDate);
  } catch {
    return null;
  }
}
