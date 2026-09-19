import { describe, expect, it } from "vitest";
import { lastAllowedMonth, newReservationHref, parseDateParam, parseIdParam, parseMonthParam, scheduleHref } from "../params";

describe("URL params", () => {
  const first = "2026-09";
  const last = lastAllowedMonth("2026-09-19");
  it("accepts a real month and clamps it to what can be browsed", () => {
    expect(last).toBe("2028-09");
    expect(parseMonthParam("2026-11", first, last)).toBe("2026-11");
    expect(parseMonthParam("2019-07", first, last)).toBe("2026-09"); // nothing before the system's first month
    expect(parseMonthParam("2999-01", first, last)).toBe("2028-09");
    expect(parseMonthParam(["2026-10", "2027-01"], first, last)).toBe("2026-10");
  });
  it("rejects garbage so the page falls back to this month", () => {
    for (const bad of [undefined, "", "2026-13", "2026-7", "october", "2026-10-01", "../etc"]) expect(parseMonthParam(bad, first, last)).toBeNull();
  });
  it("only lets real dates and well-formed ids through", () => {
    expect(parseDateParam("2027-02-29")).toBeNull();
    expect(parseDateParam("2028-02-29")).toBe("2028-02-29");
    expect(parseIdParam("r_ab12cd34ef")).toBe("r_ab12cd34ef");
    expect(parseIdParam("r_1'; DROP TABLE")).toBeNull();
  });
  it("builds links", () => {
    expect(scheduleHref("2026-10")).toBe("/schedule?m=2026-10");
    expect(scheduleHref("2026-10", "r_1", { showCancelled: true, flash: "booked" })).toBe("/schedule?m=2026-10&r=r_1&cancelled=1&flash=booked");
    expect(newReservationHref({ berthId: "inner-channel", start: "2026-10-04" })).toBe("/reservations/new?berth=inner-channel&start=2026-10-04");
    expect(newReservationHref()).toBe("/reservations/new");
  });
});
