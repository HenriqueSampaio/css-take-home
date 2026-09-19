import { describe, expect, it } from "vitest";
import { daysInMonth, makeISODate } from "../../domain/dates";
import type { DatedEdgeBlob, Occupant, Segment } from "../model";
import { blobNeighbours, joinVerdict, stitchSegments } from "../stitch";
import { GREEN, RED } from "./fixture";

const vessel = (name: string): Occupant => ({ kind: "vessel", key: `vessel:${name.toUpperCase()}`, nameKey: name.toUpperCase(), prefix: "R/V", name });
const closure = (title: string): Occupant => ({ kind: "closure", key: `closure:${title.toLowerCase()}`, title, unknown: false });

type SegSpec = { ym: [number, number]; days: [number, number]; who?: Occupant | null; fill?: string | null; berth?: Segment["berthId"]; ordinal?: number; sheet?: string };

/** A segment on a plain month grid where column = day + 1 (day 1 in column B). */
function seg({ ym: [year, month], days: [from, to], who = null, fill = GREEN, berth = "north-pier-west", ordinal = 0, sheet = String(year) }: SegSpec): Segment {
  const row = 8 + ordinal + (month - 1) * 11;
  return {
    sheet, blockIndex: month - 1, year, month, row, berthId: berth, rowOrdinal: ordinal,
    c1: from + 1, c2: to + 1,
    sourceRef: `${sheet}!R${row}C${from + 1}:C${to + 1}`, runRef: `${sheet}!R${row}C${from + 1}:C${to + 1}`,
    source: "fill", fill, occupant: who, rawLabel: who ? (who.kind === "vessel" ? `R/V ${who.name}` : who.title) : null, notes: [],
    startDate: makeISODate(year, month, from), endDate: makeISODate(year, month, to),
    touchesStart: from === 1, touchesEnd: to === daysInMonth(year, month),
    flags: { sharedBar: false, labelUnfilled: false, unknownLabel: false, mergePastEnd: false, mergeBeforeStart: false, calendarDefect: null, labelOffFirstCell: false, repeatedLabel: false, edgeBlobs: [] },
    labelCells: [], noteCells: [],
  };
}

const spans = (input: Segment[]) =>
  stitchSegments(input).stays
    .map((s) => `${s.segments[0].startDate}..${s.segments[s.segments.length - 1].endDate} ${s.segments.find((x) => x.occupant)?.rawLabel ?? "(unlabelled)"}`)
    .sort();

describe("joinVerdict", () => {
  it("states the rule", () => {
    const a = seg({ ym: [2007, 1], days: [20, 31], who: vessel("Clear Sextant") });
    expect(joinVerdict(a, seg({ ym: [2007, 2], days: [1, 9], who: vessel("CLEAR SEXTANT"), fill: RED }))).toBe("join");
    expect(joinVerdict(a, seg({ ym: [2007, 2], days: [1, 9], who: vessel("Salt Dory") }))).toBe("different_labels");
    expect(joinVerdict(a, seg({ ym: [2007, 2], days: [1, 9] }))).toBe("join");
    expect(joinVerdict(a, seg({ ym: [2007, 2], days: [1, 9], fill: RED }))).toBe("different_fill");
    expect(joinVerdict(seg({ ym: [2007, 1], days: [20, 31] }), seg({ ym: [2007, 2], days: [1, 9] }))).toBe("both_unlabelled");
    expect(joinVerdict(seg({ ym: [2007, 1], days: [20, 31], fill: null, who: vessel("A") }), seg({ ym: [2007, 2], days: [1, 9], fill: null }))).toBe("different_fill");
  });
});

describe("stitchSegments", () => {
  it("joins the same name across a month boundary, whatever the colours", () => {
    const { stays, stats } = stitchSegments([
      seg({ ym: [2007, 1], days: [20, 31], who: vessel("Clear Sextant") }),
      seg({ ym: [2007, 2], days: [1, 9], who: vessel("CLEAR SEXTANT"), fill: RED }),
    ]);
    expect(stays).toHaveLength(1);
    expect(stats).toMatchObject({ joins: 1, crossSheet: 0, sameRowJoins: 0 });
  });

  it("lets an unlabelled bar inherit the name when the colour is identical", () => {
    expect(spans([seg({ ym: [2005, 3], days: [5, 31], who: vessel("Northern Harbor") }), seg({ ym: [2005, 4], days: [1, 12] })])).toEqual(["2005-03-05..2005-04-12 R/V Northern Harbor"]);
    expect(spans([seg({ ym: [2005, 3], days: [5, 31] }), seg({ ym: [2005, 4], days: [1, 12], who: vessel("Northern Harbor") })])).toEqual(["2005-03-05..2005-04-12 R/V Northern Harbor"]);
  });

  it("does not join an unlabelled bar of a different colour", () => {
    const { stays, stats } = stitchSegments([seg({ ym: [2005, 3], days: [5, 31], who: vessel("Northern Harbor") }), seg({ ym: [2005, 4], days: [1, 12], fill: RED })]);
    expect(stays).toHaveLength(2);
    expect(stats.notJoinedDifferentFill).toBe(1);
  });

  it("never joins different names, even with the same colour", () => {
    const { stays, stats } = stitchSegments([seg({ ym: [2007, 12], days: [1, 31], who: closure("Pier repair - no docking") }), seg({ ym: [2008, 1], days: [1, 31], who: closure("Concrete work near test wells"), sheet: "2008" })]);
    expect(stays).toHaveLength(2);
    expect(stats).toMatchObject({ joins: 0, notJoinedDifferentLabels: 1 });
  });

  it("needs both bars to touch the boundary, on the same berth", () => {
    expect(spans([seg({ ym: [2005, 3], days: [5, 30], who: vessel("A") }), seg({ ym: [2005, 4], days: [1, 3], who: vessel("A") })])).toHaveLength(2);
    expect(spans([seg({ ym: [2005, 3], days: [5, 31], who: vessel("A") }), seg({ ym: [2005, 4], days: [2, 3], who: vessel("A") })])).toHaveLength(2);
    expect(spans([seg({ ym: [2005, 3], days: [5, 31], who: vessel("A") }), seg({ ym: [2005, 4], days: [1, 3], who: vessel("A"), berth: "inner-channel" })])).toHaveLength(2);
  });

  it("chains three months through a fully unlabelled one", () => {
    const { stays, stats } = stitchSegments([
      seg({ ym: [2005, 2], days: [25, 28], who: vessel("Northern Harbor") }),
      seg({ ym: [2005, 3], days: [1, 31] }),
      seg({ ym: [2005, 4], days: [1, 30], who: vessel("NORTHERN HARBOR") }),
    ]);
    expect(stays).toHaveLength(1);
    expect(stays[0].segments.map((s) => s.month)).toEqual([2, 3, 4]);
    expect(stats.longestChain).toMatchObject({ segments: 3 });
  });

  it("will not let an unlabelled month glue two different vessels together", () => {
    expect(
      spans([seg({ ym: [2005, 2], days: [25, 28], who: vessel("Alpha") }), seg({ ym: [2005, 3], days: [1, 31] }), seg({ ym: [2005, 4], days: [1, 30], who: vessel("Bravo") })]),
    ).toEqual(["2005-02-25..2005-03-31 R/V Alpha", "2005-04-01..2005-04-30 R/V Bravo"]);
  });

  it("passes an inherited name along a run of unlabelled months, in either direction", () => {
    const months = (labelled: number) => [1, 2, 3].map((m) => seg({ ym: [2006, m], days: [1, daysInMonth(2006, m)], who: m === labelled ? vessel("Salt Dory") : null }));
    expect(spans(months(1))).toEqual(["2006-01-01..2006-03-31 R/V Salt Dory"]);
    expect(spans(months(3))).toEqual(["2006-01-01..2006-03-31 R/V Salt Dory"]);
  });

  it("leaves two unlabelled bars apart: nothing says they are one stay", () => {
    const { stays, stats } = stitchSegments([seg({ ym: [2007, 12], days: [1, 31] }), seg({ ym: [2008, 1], days: [1, 31], sheet: "2008" })]);
    expect(stays).toHaveLength(2);
    expect(stats.notJoinedBothUnlabelled).toBe(1);
  });

  it("joins December to January across sheets", () => {
    const { stays, stats } = stitchSegments([
      seg({ ym: [2008, 1], days: [1, 31], who: vessel("Clear Sextant"), sheet: "2008" }),
      seg({ ym: [2007, 12], days: [1, 31], who: vessel("Clear Sextant"), sheet: "2007" }),
    ]);
    expect(stays).toHaveLength(1);
    expect(stays[0].segments.map((s) => s.sheet)).toEqual(["2007", "2008"]);
    expect(stats).toMatchObject({ joins: 1, crossSheet: 1 });
  });

  it("stitches duplicate berth rows independently, by physical row position", () => {
    const stays = spans([
      seg({ ym: [2017, 7], days: [20, 31], who: vessel("Amber Reef"), ordinal: 0 }),
      seg({ ym: [2017, 7], days: [25, 31], who: vessel("Blue Star"), ordinal: 1 }),
      seg({ ym: [2017, 8], days: [1, 4], who: vessel("Blue Star"), ordinal: 1 }),
      seg({ ym: [2017, 8], days: [1, 2], who: vessel("Amber Reef"), ordinal: 0 }),
    ]);
    expect(stays).toEqual(["2017-07-20..2017-08-02 R/V Amber Reef", "2017-07-25..2017-08-04 R/V Blue Star"]);
  });

  it("rejoins side-by-side pieces of one row that a merge boundary cut apart", () => {
    const { stays, stats } = stitchSegments([
      seg({ ym: [2011, 3], days: [1, 7], who: vessel("Golden Compass") }),
      seg({ ym: [2011, 3], days: [8, 19] }),
      seg({ ym: [2011, 3], days: [20, 21], who: vessel("GOLDEN COMPASS") }),
      seg({ ym: [2011, 3], days: [22, 31] }),
    ]);
    expect(stays).toHaveLength(1);
    expect(stats).toMatchObject({ sameRowJoins: 3, joins: 0 });
  });

  it("keeps side-by-side bars apart when the names differ, the colours differ, or there is a gap", () => {
    expect(spans([seg({ ym: [2011, 3], days: [1, 7], who: vessel("A") }), seg({ ym: [2011, 3], days: [8, 9], who: vessel("B") })])).toHaveLength(2);
    expect(spans([seg({ ym: [2011, 3], days: [1, 7], who: vessel("A") }), seg({ ym: [2011, 3], days: [8, 9], fill: RED })])).toHaveLength(2);
    expect(spans([seg({ ym: [2011, 3], days: [1, 7], who: vessel("A") }), seg({ ym: [2011, 3], days: [9, 12], who: vessel("A") })])).toHaveLength(2);
  });
});

/** A bare banner blob over `days` of the segment's own month, on the side where it sits. */
function withBlob(s: Segment, side: "start" | "end", [from, to]: [number, number], inside = false): Segment {
  const blob: DatedEdgeBlob = { side, c1: from + 1, c2: to + 1, sourceRef: `${s.sheet}!R${s.row}C${from + 1}:C${to + 1}`, inside, startDate: makeISODate(s.year, s.month, from), endDate: makeISODate(s.year, s.month, to) };
  return { ...s, touchesStart: s.touchesStart && side !== "start", touchesEnd: s.touchesEnd && side !== "end", flags: { ...s.flags, edgeBlobs: [...s.flags.edgeBlobs, blob] } };
}

describe("blobNeighbours", () => {
  const pairsOf = (input: Segment[]) => {
    const { stays } = stitchSegments(input);
    return blobNeighbours(stays).map((p) => `${stays[p.before].segments[0].startDate} -> ${stays[p.after].segments[0].startDate}`);
  };

  it("pairs two stays of one vessel that only a blob keeps apart, without joining them", () => {
    // 2017!Q49:AF49 then 2017!C61:D61 + E61:AC61: April runs to the 30th, May 1-2 are a blob, the bar resumes on the 3rd.
    const input = [seg({ ym: [2017, 4], days: [15, 30], who: vessel("Amber Reef") }), withBlob(seg({ ym: [2017, 5], days: [3, 27], who: vessel("AMBER REEF") }), "start", [1, 2])];
    expect(stitchSegments(input).stays).toHaveLength(2);
    expect(pairsOf(input)).toEqual(["2017-04-15 -> 2017-05-03"]);
  });

  it("sees through a blob on each side of the boundary (2011!AE57:AG57 then 2011!C68:D68)", () => {
    expect(pairsOf([withBlob(seg({ ym: [2011, 5], days: [19, 28], who: vessel("Amber Reef") }), "end", [29, 31]), withBlob(seg({ ym: [2011, 6], days: [3, 30], who: vessel("Amber Reef") }), "start", [1, 2])])).toEqual(["2011-05-19 -> 2011-06-03"]);
  });

  it("uses THE join rule: different names never pair, an unlabelled side needs the identical colour", () => {
    const may = (who: Occupant | null, fill = GREEN) => withBlob(seg({ ym: [2011, 5], days: [19, 28], who, fill }), "end", [29, 31]);
    const june = (who: Occupant | null, fill = GREEN) => seg({ ym: [2011, 6], days: [1, 9], who, fill });
    expect(pairsOf([may(vessel("Alpha")), june(vessel("Bravo"))])).toEqual([]);
    expect(pairsOf([may(vessel("Alpha")), june(null)])).toHaveLength(1);
    expect(pairsOf([may(vessel("Alpha")), june(null, RED)])).toEqual([]);
    expect(pairsOf([may(null), june(null)])).toEqual([]);
  });

  it("needs the painted extents to meet, on one berth, with a bare blob in between", () => {
    const may = withBlob(seg({ ym: [2011, 5], days: [19, 28], who: vessel("Alpha") }), "end", [29, 31]);
    expect(pairsOf([may, seg({ ym: [2011, 6], days: [2, 9], who: vessel("Alpha") })])).toEqual([]);
    expect(pairsOf([may, seg({ ym: [2011, 6], days: [1, 9], who: vessel("Alpha"), berth: "inner-channel" })])).toEqual([]);
    // Cells inside a banner-colour bar are already part of the stay: they bridge nothing.
    const inside = withBlob(seg({ ym: [2011, 5], days: [19, 28], who: vessel("Alpha") }), "end", [29, 31], true);
    expect(pairsOf([inside, seg({ ym: [2011, 6], days: [1, 9], who: vessel("Alpha") })])).toEqual([]);
  });

  it("looks at the ends of a whole stay, so a 14-month stay pairs with the bar beyond the blob after its last month", () => {
    // Ground truth (b): CLEAR SEXTANT 2007-01-01 to 2008-02-29 stays one stay; 2008!B30:D30 is a blob, the March bar is its neighbour.
    const input = [
      seg({ ym: [2008, 1], days: [1, 31], who: vessel("Clear Sextant") }),
      seg({ ym: [2008, 2], days: [1, 29], who: vessel("Clear Sextant") }),
      withBlob(seg({ ym: [2008, 3], days: [4, 18], who: vessel("Clear Sextant") }), "start", [1, 3]),
    ];
    expect(stitchSegments(input).stays.map((s) => s.segments.length).sort()).toEqual([1, 2]);
    expect(pairsOf(input)).toEqual(["2008-01-01 -> 2008-03-04"]);
  });
});
