import { addDays } from "../domain/dates";
import type { Segment, Stay } from "./model";

export type StitchStats = {
  /** Month-end to next-month-day-1 joins. */
  joins: number;
  /** Of those, joins from a December block into the next sheet's January. */
  crossSheet: number;
  /** Side-by-side pieces of one row rejoined (a merge boundary cut one stay into pieces). */
  sameRowJoins: number;
  /** A bar touching month end met a bar touching day 1, both named, with different names: two stays. */
  notJoinedDifferentLabels: number;
  /** Neither side has a name anywhere in its chain: nothing says they are the same stay. */
  notJoinedBothUnlabelled: number;
  /** One side unlabelled but the colours differ. */
  notJoinedDifferentFill: number;
  longestChain: { segments: number; sourceRef: string } | null;
};

const monthIndex = (s: Segment): number => s.year * 12 + (s.month - 1);

const chronological = (a: Segment, b: Segment): number =>
  monthIndex(a) - monthIndex(b) || a.rowOrdinal - b.rowOrdinal || a.row - b.row || a.c1 - b.c1;

export type Verdict = "join" | "different_labels" | "both_unlabelled" | "different_fill";

/**
 * THE join rule, in one place. Two bars that touch are one stay when both carry
 * the same name, or when exactly one of them is unlabelled and both have the
 * identical booking colour (the labelled side names the stay). Different names
 * never join. `aName`/`bName` are the names the bars answer to so far, so an
 * unlabelled bar that already inherited a name passes it on.
 */
export function joinVerdict(a: Segment, b: Segment, aName: string | null = a.occupant?.key ?? null, bName: string | null = b.occupant?.key ?? null): Verdict {
  if (aName !== null && bName !== null) return aName === bName ? "join" : "different_labels";
  if (aName === null && bName === null) return "both_unlabelled";
  return a.fill !== null && a.fill === b.fill ? "join" : "different_fill";
}

type Touch = { a: number; b: number; kind: "row" | "month" };

/**
 * Stitching with union-find. Bars "touch" in two ways:
 *  - across months: one reaches the last valid day of month M, the other starts on day 1 of month M+1,
 *    same berth (December -> January included, because months are indexed across sheets);
 *  - side by side in one row: the second starts in the column after the first ends (run extraction
 *    always cuts at a merge boundary, which can slice one stay into several pieces).
 * With duplicate berth rows there can be two tails and two heads on one berth: each tail prefers
 * the head on the same physical row position, and a head continues at most one tail.
 */
export function stitchSegments(input: readonly Segment[]): { stays: Stay[]; stats: StitchStats } {
  const segments = [...input].sort(chronological);
  const parent = segments.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  /** The name a whole chain answers to, so an unlabelled month in the middle cannot glue two different vessels together. */
  const chainName = segments.map((s) => s.occupant?.key ?? null);

  const touches: Touch[] = [];

  const byRow = new Map<string, number[]>();
  const byBerthMonth = new Map<string, number[]>();
  segments.forEach((s, i) => {
    for (const [map, key] of [[byRow, `${s.sheet}|${s.blockIndex}|${s.row}`], [byBerthMonth, `${s.berthId}|${monthIndex(s)}`]] as const) {
      const list = map.get(key);
      if (list) list.push(i);
      else map.set(key, [i]);
    }
  });
  for (const indices of byRow.values()) {
    const ordered = [...indices].sort((x, y) => segments[x].c1 - segments[y].c1);
    for (let k = 0; k + 1 < ordered.length; k++) {
      if (segments[ordered[k]].c2 + 1 === segments[ordered[k + 1]].c1) touches.push({ a: ordered[k], b: ordered[k + 1], kind: "row" });
    }
  }
  for (const [key, indices] of byBerthMonth) {
    const [berthId, month] = key.split("|");
    const tails = indices.filter((i) => segments[i].touchesEnd);
    const heads = (byBerthMonth.get(`${berthId}|${Number(month) + 1}`) ?? []).filter((i) => segments[i].touchesStart);
    const pairs = tails.flatMap((t) => heads.map((h) => ({ a: t, b: h, kind: "month" as const })));
    // Same physical row position first, so duplicate berth rows continue independently where they can.
    pairs.sort((x, y) => Number(segments[x.a].rowOrdinal !== segments[x.b].rowOrdinal) - Number(segments[y.a].rowOrdinal !== segments[y.b].rowOrdinal));
    touches.push(...pairs);
  }

  const stats: StitchStats = { joins: 0, crossSheet: 0, sameRowJoins: 0, notJoinedDifferentLabels: 0, notJoinedBothUnlabelled: 0, notJoinedDifferentFill: 0, longestChain: null };
  const tailUsed = new Set<number>();
  const headUsed = new Set<number>();
  const done = new Set<Touch>();

  // Repeat until nothing changes: a name inherited in one pass can unlock the next unlabelled bar along.
  for (let changed = true; changed; ) {
    changed = false;
    for (const touch of touches) {
      if (done.has(touch)) continue;
      if (touch.kind === "month" && (tailUsed.has(touch.a) || headUsed.has(touch.b))) continue;
      const rootA = find(touch.a);
      const rootB = find(touch.b);
      if (joinVerdict(segments[touch.a], segments[touch.b], chainName[rootA], chainName[rootB]) !== "join") continue;
      done.add(touch);
      changed = true;
      if (rootA !== rootB) {
        parent[rootB] = rootA;
        chainName[rootA] = chainName[rootA] ?? chainName[rootB];
      }
      if (touch.kind === "row") stats.sameRowJoins++;
      else {
        tailUsed.add(touch.a);
        headUsed.add(touch.b);
        stats.joins++;
        if (segments[touch.a].sheet !== segments[touch.b].sheet) stats.crossSheet++;
      }
    }
  }

  // What touched across a month boundary and still stayed apart, and why (first open head per tail).
  for (const touch of touches) {
    if (touch.kind !== "month" || tailUsed.has(touch.a) || headUsed.has(touch.b)) continue;
    tailUsed.add(touch.a);
    const verdict = joinVerdict(segments[touch.a], segments[touch.b], chainName[find(touch.a)], chainName[find(touch.b)]);
    if (verdict === "different_labels") stats.notJoinedDifferentLabels++;
    else if (verdict === "both_unlabelled") stats.notJoinedBothUnlabelled++;
    else if (verdict === "different_fill") stats.notJoinedDifferentFill++;
  }

  const chains = new Map<number, Segment[]>();
  segments.forEach((s, i) => {
    const root = find(i);
    const chain = chains.get(root);
    if (chain) chain.push(s);
    else chains.set(root, [s]);
  });

  const stays: Stay[] = [...chains.values()].map((chain) => ({ segments: chain.sort(chronological) }));
  for (const stay of stays) {
    if (stay.segments.length > 1 && stay.segments.length > (stats.longestChain?.segments ?? 0)) {
      stats.longestChain = { segments: stay.segments.length, sourceRef: `${stay.segments[0].sourceRef} .. ${stay.segments[stay.segments.length - 1].sourceRef}` };
    }
  }
  return { stays, stats };
}

export type BlobNeighbours = { before: number; after: number };

/**
 * Stays kept apart only by bare banner blobs at a month boundary. A blob is
 * never occupancy, so nothing is joined here; but when a stay's PAINTED extent
 * (its dates plus the blob that follows it) ends the day before another's
 * (its dates minus the blob in front of it) begins, on the same berth, and THE
 * join rule would have made them one stay had the blob been booking colour,
 * each side is told about the other so a coordinator can merge them.
 * Returns index pairs into `stays`, in a fixed order.
 */
export function blobNeighbours(stays: readonly Stay[]): BlobNeighbours[] {
  const faces = stays.map((stay) => {
    const head = stay.segments.reduce((a, b) => (b.startDate < a.startDate ? b : a));
    const tail = stay.segments.reduce((a, b) => (b.endDate > a.endDate ? b : a));
    const blobs = (s: Segment, side: "start" | "end") => s.flags.edgeBlobs.filter((b) => !b.inside && b.side === side);
    const before = blobs(head, "start");
    const after = blobs(tail, "end");
    return {
      head,
      tail,
      name: stay.segments.find((s) => s.occupant !== null)?.occupant?.key ?? null,
      paintedStart: [head.startDate, ...before.map((b) => b.startDate)].sort()[0],
      paintedEnd: [tail.endDate, ...after.map((b) => b.endDate)].sort().reverse()[0],
      blobBefore: before.length > 0,
      blobAfter: after.length > 0,
    };
  });

  const byStart = new Map<string, number[]>();
  faces.forEach((f, i) => {
    const key = `${f.head.berthId}|${f.paintedStart}`;
    const list = byStart.get(key);
    if (list) list.push(i);
    else byStart.set(key, [i]);
  });

  const pairs: BlobNeighbours[] = [];
  faces.forEach((a, i) => {
    for (const j of byStart.get(`${a.tail.berthId}|${addDays(a.paintedEnd, 1)}`) ?? []) {
      const b = faces[j];
      // Without a blob in between the two simply touch, and stitching has already had its say.
      if (i === j || !(a.blobAfter || b.blobBefore)) continue;
      if (joinVerdict(a.tail, b.head, a.name, b.name) === "join") pairs.push({ before: i, after: j });
    }
  });
  return pairs;
}
