import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysInMonth, formatDate, fromEpochDay, isISODate, isRealDate, isYearMonth, monthBounds, toEpochDay, todayIn, weekdayIndex } from "../dates";

describe("dates", () => {
  it("rejects the phantom days the legacy workbook prints", () => {
    expect(isRealDate(2008, 6, 31)).toBe(false); // June 2008 has a day-31 column
    expect(isRealDate(2009, 2, 29)).toBe(false); // Feb 2009 has a day-29 column
    expect(isRealDate(2008, 2, 29)).toBe(true); // ...but 2008 really was a leap year
    expect(isISODate("2009-02-29")).toBe(false);
    expect(isISODate("2019-7-1")).toBe(false);
    expect(isISODate("2019-07-01")).toBe(true);
  });

  it("round-trips through epoch days without touching the local time zone", () => {
    for (const d of ["1997-08-01", "2000-02-29", "2019-12-31", "2026-09-19"]) expect(fromEpochDay(toEpochDay(d))).toBe(d);
    expect(toEpochDay("1970-01-01")).toBe(0);
    expect(addDays("2019-12-31", 1)).toBe("2020-01-01");
    expect(addDays("2008-03-01", -1)).toBe("2008-02-29");
    expect(toEpochDay("2007-11-05") - toEpochDay("2007-11-04")).toBe(1); // US DST change day is still one day
  });

  it("knows weekdays (0 = Monday), matching the workbook's weekday rows", () => {
    expect(weekdayIndex("1997-08-01")).toBe(4); // AUGUST 1997 starts on 'F'
    expect(weekdayIndex("1997-09-01")).toBe(0); // SEPTEMBER 1997 starts on 'M'
    expect(weekdayIndex("1970-01-01")).toBe(3); // Thursday
  });

  it("handles months", () => {
    expect(daysInMonth(2019, 2)).toBe(28);
    expect(monthBounds("2008-02")).toEqual({ start: "2008-02-01", end: "2008-02-29", days: 29 });
    expect(addMonths("2019-12", 1)).toBe("2020-01");
    expect(addMonths("2019-01", -1)).toBe("2018-12");
    expect(addMonths("1997-08", 268)).toBe("2019-12");
    expect(isYearMonth("2019-13")).toBe(false);
  });

  it("formats the string date, not a shifted instant", () => {
    expect(formatDate("2019-07-01")).toBe("Jul 1, 2019");
    expect(formatDate("2019-07-01", "short")).toBe("Jul 1");
  });

  it("computes the facility's today from an instant", () => {
    const lateEveningUTC = new Date("2026-09-20T02:30:00Z"); // still Sep 19 in New York
    expect(todayIn("America/New_York", lateEveningUTC)).toBe("2026-09-19");
    expect(todayIn("UTC", lateEveningUTC)).toBe("2026-09-20");
  });
});
