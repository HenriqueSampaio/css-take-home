/**
 * Calendar dates as plain `'YYYY-MM-DD'` strings, end to end.
 *
 * A reservation occupies whole days, so a JS `Date` (an instant, with a time
 * zone attached by whoever formats it) is the wrong type: `new Date('2019-07-01')`
 * renders as June 30 in New York. All arithmetic here goes through an integer
 * "epoch day" (days since 1970-01-01 in UTC), which has no zone to get wrong.
 */
export type ISODate = string;
export type YearMonth = string; // 'YYYY-MM'

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YM_RE = /^(\d{4})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** True when year/month/day name a real calendar day (rejects Feb 29 2009, June 31...). */
export function isRealDate(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) &&
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  );
}

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const m = ISO_RE.exec(value);
  return m !== null && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function makeISODate(year: number, month: number, day: number): ISODate {
  if (!isRealDate(year, month, day)) throw new RangeError(`Not a real date: ${year}-${month}-${day}`);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseISODate(date: ISODate): { year: number; month: number; day: number } {
  const m = ISO_RE.exec(date);
  if (!m || !isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))) throw new RangeError(`Invalid ISO date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function toEpochDay(date: ISODate): number {
  const { year, month, day } = parseISODate(date);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function fromEpochDay(epochDay: number): ISODate {
  const d = new Date(epochDay * MS_PER_DAY);
  return makeISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export const addDays = (date: ISODate, days: number): ISODate => fromEpochDay(toEpochDay(date) + days);

/** ISO strings sort chronologically, so plain comparison is correct. */
export const compareDates = (a: ISODate, b: ISODate): number => (a < b ? -1 : a > b ? 1 : 0);

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(date: ISODate): number {
  return (((toEpochDay(date) + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export function isYearMonth(value: unknown): value is YearMonth {
  if (typeof value !== "string") return false;
  const m = YM_RE.exec(value);
  return m !== null && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

export const yearMonthOf = (date: ISODate): YearMonth => date.slice(0, 7);

export function monthBounds(ym: YearMonth): { start: ISODate; end: ISODate; days: number } {
  if (!isYearMonth(ym)) throw new RangeError(`Invalid year-month: ${ym}`);
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const days = daysInMonth(year, month);
  return { start: makeISODate(year, month, 1), end: makeISODate(year, month, days), days };
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  if (!isYearMonth(ym)) throw new RangeError(`Invalid year-month: ${ym}`);
  const index = Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1) + delta;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** "Today" for the facility, independent of the server's own time zone. */
export function todayIn(timeZone = "America/New_York", now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return makeISODate(get("year"), get("month"), get("day"));
}

const utcDate = (date: ISODate): Date => new Date(toEpochDay(date) * MS_PER_DAY);

/** Display helpers always format in UTC so the string date is what gets shown. */
export function formatDate(date: ISODate, style: "short" | "medium" | "long" = "medium"): string {
  const options: Intl.DateTimeFormatOptions =
    style === "short" ? { month: "short", day: "numeric" }
    : style === "long" ? { weekday: "short", month: "long", day: "numeric", year: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(utcDate(date));
}

export function formatYearMonth(ym: YearMonth): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(utcDate(`${ym}-01`));
}
