import { describe, expect, it } from "vitest";
import { auditOverlaps, type AuditItem } from "../audit";

const item = (id: string, startDate: string, endDate: string, berthId = "north-pier-west", sourceRef = `1998!${id}`): AuditItem => ({ id, berthId, startDate, endDate, label: id, sourceRef });

describe("auditOverlaps", () => {
  it("reports both sides of the 1998 double-booking and links them to each other", () => {
    const { pairs, findings } = auditOverlaps([
      item("wild-star", "1998-09-16", "1998-09-21", "north-pier-west", "1998!Q92:V92"),
      item("salt-dory", "1998-09-14", "1998-09-20", "north-pier-west", "1998!O93:U93"),
      item("elsewhere", "1998-09-14", "1998-09-20", "north-pier-east"),
    ]);
    expect(pairs).toBe(1);
    expect(findings.map((f) => [f.reservationId, f.otherId, f.reason])).toEqual([
      ["salt-dory", "wild-star", "duplicate_berth_row"],
      ["wild-star", "salt-dory", "duplicate_berth_row"],
    ]);
    expect(findings[0].detail).toContain("wild-star (1998-09-16 to 1998-09-21, 1998!Q92:V92)");
  });

  it("counts touching dates as a collision: a berth-day has one occupant", () => {
    expect(auditOverlaps([item("a", "2019-07-01", "2019-07-05"), item("b", "2019-07-05", "2019-07-09")]).pairs).toBe(1);
    expect(auditOverlaps([item("a", "2019-07-01", "2019-07-05"), item("b", "2019-07-06", "2019-07-09")]).pairs).toBe(0);
  });

  it("reports every pair of a pile-up and never picks a winner", () => {
    const { pairs, findings } = auditOverlaps(["a", "b", "c"].map((id) => item(id, "2017-09-07", "2017-09-12")));
    expect(pairs).toBe(3);
    expect(new Set(findings.map((f) => f.reservationId))).toEqual(new Set(["a", "b", "c"]));
    expect(findings).toHaveLength(6);
  });
});
