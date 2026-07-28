const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_IN_MILLISECONDS = 86_400_000;

export interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

export function parseLocalDate(localDate: string): LocalDateParts {
  const match = LOCAL_DATE_PATTERN.exec(localDate);
  if (!match) {
    throw new RangeError("Local date must use YYYY-MM-DD format.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid local date: ${localDate}.`);
  }
  return { year, month, day };
}

export function localDateToEpochDay(localDate: string): number {
  const { year, month, day } = parseLocalDate(localDate);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_IN_MILLISECONDS);
}

export function epochDayToLocalDate(epochDay: number): string {
  if (!Number.isInteger(epochDay)) {
    throw new RangeError("Epoch day must be an integer.");
  }
  const date = new Date(epochDay * DAY_IN_MILLISECONDS);
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

export function addLocalDays(localDate: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError("Days must be an integer.");
  return epochDayToLocalDate(localDateToEpochDay(localDate) + days);
}

export function daysBetweenLocalDates(fromDate: string, toDate: string): number {
  return localDateToEpochDay(toDate) - localDateToEpochDay(fromDate);
}

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function localDateInTimeZone(
  instant: Date | string | number,
  timeZone: string,
): string {
  if (!isValidIanaTimeZone(timeZone)) {
    throw new RangeError(`Invalid IANA time zone: ${timeZone}.`);
  }
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid instant.");

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

export function remainingDays(
  targetDate: string,
  options: {
    now?: Date | string | number;
    timeZone?: string;
    clampAtZero?: boolean;
  } = {},
): number {
  parseLocalDate(targetDate);
  const {
    now = new Date(),
    timeZone = "UTC",
    clampAtZero = true,
  } = options;
  const today = localDateInTimeZone(now, timeZone);
  const result = daysBetweenLocalDates(today, targetDate);
  return clampAtZero ? Math.max(0, result) : result;
}

export function enumerateLocalDates(startDate: string, endDate: string): string[] {
  const start = localDateToEpochDay(startDate);
  const end = localDateToEpochDay(endDate);
  if (end < start) return [];
  return Array.from({ length: end - start + 1 }, (_, index) =>
    epochDayToLocalDate(start + index),
  );
}
