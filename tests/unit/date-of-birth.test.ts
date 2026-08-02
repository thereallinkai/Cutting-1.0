import { describe, expect, it } from "vitest";

import {
  calculateAgeOnDate,
  registrationDateOfBirthBounds,
  resolveProfileAge,
  utcCalendarDate,
  validateRegistrationDateOfBirth,
} from "../../src/lib/domain/date-of-birth";

describe("date-of-birth age calculation", () => {
  it("changes age on the birthday using date-only calendar arithmetic", () => {
    expect(calculateAgeOnDate("2000-08-02", "2026-08-01")).toBe(25);
    expect(calculateAgeOnDate("2000-08-02", "2026-08-02")).toBe(26);
  });

  it("handles leap-day birthdays without host-time-zone conversion", () => {
    expect(calculateAgeOnDate("2004-02-29", "2025-02-28")).toBe(20);
    expect(calculateAgeOnDate("2004-02-29", "2025-03-01")).toBe(21);
  });

  it("rejects impossible and future dates", () => {
    expect(validateRegistrationDateOfBirth("2026-02-29", "2026-08-02"))
      .toEqual({ valid: false, reason: "invalid_date" });
    expect(validateRegistrationDateOfBirth("2026-08-03", "2026-08-02"))
      .toEqual({ valid: false, reason: "invalid_date" });
  });

  it("enforces the inclusive registration age range", () => {
    expect(validateRegistrationDateOfBirth("2013-08-02", "2026-08-02"))
      .toMatchObject({ valid: true, age: 13 });
    expect(validateRegistrationDateOfBirth("1906-08-02", "2026-08-02"))
      .toMatchObject({ valid: true, age: 120 });
    expect(validateRegistrationDateOfBirth("2013-08-03", "2026-08-02"))
      .toEqual({ valid: false, reason: "age_out_of_range" });
    expect(validateRegistrationDateOfBirth("1905-08-02", "2026-08-02"))
      .toEqual({ valid: false, reason: "age_out_of_range" });
  });

  it("provides inclusive date-input bounds matching the age rules", () => {
    expect(registrationDateOfBirthBounds("2026-08-02")).toEqual({
      min: "1905-08-03",
      max: "2013-08-02",
    });
    expect(registrationDateOfBirthBounds("2024-02-29")).toEqual({
      min: "1903-03-01",
      max: "2011-02-28",
    });
  });

  it("prefers canonical DOB over a stale compatibility age", () => {
    expect(resolveProfileAge("2000-08-02", 19, "2026-08-02")).toBe(26);
    expect(resolveProfileAge(null, 29, "2026-08-02")).toBe(29);
  });

  it("formats the UTC calendar date deterministically", () => {
    expect(utcCalendarDate("2026-08-02T23:59:59.000-04:00")).toBe(
      "2026-08-03",
    );
  });
});
