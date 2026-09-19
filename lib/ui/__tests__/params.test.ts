import { describe, expect, it } from "vitest";
import { newReservationHref, parseDateParam, parseIdParam, parseMonthParam, scheduleHref } from "../params";

describe("URL params", () => {
  const today = "2026-09-19";
  it("accepts a real month and clamps to the supported window", () => {
    expect(parseMonthParam("2019-07", today)).toBe("2019-07");
    expect(parseMonthParam("1800-01", today)).toBe("1997-01");
    expect(parseMonthParam("2999-01", today)).toBe("2028-09");
    expect(parseMonthParam(["2019-07", "2001-01"], today)).toBe("2019-07");
  });
  it("rejects garbage so the page falls back to its default month", () => {
    for (const bad of [undefined, "", "2019-13", "2019-7", "july", "2019-07-01", "../etc"]) expect(parseMonthParam(bad, today)).toBeNull();
  });
  it("only lets real dates and well-formed ids through", () => {
    expect(parseDateParam("2009-02-29")).toBeNull();
    expect(parseDateParam("2008-02-29")).toBe("2008-02-29");
    expect(parseIdParam("r_ab12cd34ef")).toBe("r_ab12cd34ef");
    expect(parseIdParam("r_1'; DROP TABLE")).toBeNull();
  });
  it("builds links", () => {
    expect(scheduleHref("2019-07")).toBe("/schedule?m=2019-07");
    expect(scheduleHref("2019-07", "r_1")).toBe("/schedule?m=2019-07&r=r_1");
    expect(newReservationHref({ berthId: "inner-channel", start: "2019-07-04" })).toBe("/reservations/new?berth=inner-channel&start=2019-07-04");
    expect(newReservationHref()).toBe("/reservations/new");
  });
});
