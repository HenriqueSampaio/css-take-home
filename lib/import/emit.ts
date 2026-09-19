import { createHash } from "node:crypto";
import { addDays, compareDates, monthBounds, toEpochDay, yearMonthOf } from "../domain/dates";
import { fitVerdict, hasUsableLength } from "../domain/fit";
import { displayVesselName, vesselIdFromKey } from "../domain/names";
import { BLOCKING_ISSUE_TYPES, type IssueSeed, type IssueType, type ReservationSeed, type Seed, type VesselSeed } from "../seed/contract";
import { auditOverlaps } from "./audit";
import type { Segment, Stay } from "./model";
import { blobNeighbours } from "./stitch";
import type { LinkedVessel } from "./registry";
import type { ImportReport } from "./report";
import { BERTHS } from "./rows";

export const UNLABELLED_TITLE = "Unlabelled legacy booking";

const hash10 = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 10);

/** Ids are hashes of WHERE the row came from, so re-running the import never renumbers anything. */
export const reservationId = (firstSourceRun: string, n: number): string => `r_${hash10(`${firstSourceRun}#${n}`)}`;
export const issueId = (type: string, subjectId: string, reason: string | null, n: number): string => `i_${hash10(`${type}|${subjectId}|${reason ?? ""}|${n}`)}`;

const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Count maps are emitted with sorted keys so the JSON does not depend on encounter order. */
export function sortedCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).sort((a, b) => text(a[0], b[0])));
}

export const bump = (counts: Record<string, number>, key: string, by = 1): void => {
  counts[key] = (counts[key] ?? 0) + by;
};

/** Two-space JSON with a trailing newline. Key order is construction order, which every builder here keeps fixed. */
export const stableStringify = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

type PendingIssue = { type: IssueType; reason: string | null; detail: string; sourceRef: string | null; related: string[] };

function segmentIssues(segments: readonly Segment[]): PendingIssue[] {
  const issues: PendingIssue[] = [];
  const once = new Set<string>();
  const add = (type: IssueType, reason: string | null, detail: string, sourceRef: string) => {
    // One issue per cause per reservation: a 14-month stay does not need 14 copies of the same remark.
    if (once.has(`${type}/${reason}`)) return;
    once.add(`${type}/${reason}`);
    issues.push({ type, reason, detail, sourceRef, related: [] });
  };
  for (const s of segments) {
    const f = s.flags;
    if (f.calendarDefect) add("calendar_defect", f.calendarDefect.reason, f.calendarDefect.detail, s.sourceRef);
    if (f.sharedBar) add("ambiguous_extent", "shared_bar", `The bar ${s.runRef} names more than one occupant: possible double-booking or handover; imported as back-to-back stays split at the second name.`, s.sourceRef);
    if (f.labelUnfilled) add("ambiguous_extent", "label_unfilled", `"${s.rawLabel}" is written at ${s.sourceRef} with no booking colour; imported as a one-day stay, the real extent is unknown.`, s.sourceRef);
    if (f.mergePastEnd) add("ambiguous_extent", "merge_past_month_end", `The merged bar ${s.sourceRef} runs past the last day column of its month; it was cut at the last day.`, s.sourceRef);
    if (f.mergeBeforeStart) add("ambiguous_extent", "merge_before_month_start", `The merged bar ${s.sourceRef} starts left of the day-1 column of its month; it was cut at day 1.`, s.sourceRef);
    if (f.unknownLabel) add("ambiguous_extent", "unknown_label", `"${s.rawLabel}" is neither a vessel name nor a known event, closure or note; imported as an event.`, s.sourceRef);
  }
  return issues;
}

/** The stay on the far side of a bare edge blob, as a sentence needs it. */
type Neighbour = { id: string; label: string; startDate: string; endDate: string; sourceRef: string };

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;
const dateSpan = (from: string, to: string): string => (from === to ? from : `${from} to ${to}`);

/**
 * Banner-colour cells at the outer ends of a stay (see `EdgeBlob`). One issue
 * per blob, not per cause: a stay can have one in front and one behind, and
 * each names different cells. A blob facing another month of the same stay
 * hides nothing, because the stay carries on past it.
 * `across` names the stay on the far side of a bare blob, when there is one.
 */
function edgeBlobIssues(stay: Stay, across: { start: Neighbour[]; end: Neighbour[] }): PendingIssue[] {
  const issues: PendingIssue[] = [];
  for (const s of stay.segments) {
    for (const blob of s.flags.edgeBlobs) {
      const outer = blob.side === "start" ? !stay.segments.some((o) => o.endDate < s.startDate) : !stay.segments.some((o) => o.startDate > s.endDate);
      if (!outer) continue;
      const n = toEpochDay(blob.endDate) - toEpochDay(blob.startDate) + 1;
      const days = `${blob.side === "start" ? "first" : "last"} ${n === 1 ? "day" : `${n} days`}`;
      const where = `${blob.sourceRef}, ${dateSpan(blob.startDate, blob.endDate)}`;
      if (blob.inside) {
        issues.push({
          type: "ambiguous_extent", reason: "decorative_colour_edge", sourceRef: s.sourceRef, related: [],
          detail: `"${s.rawLabel}" at ${s.sourceRef} is a named bar in the sheet's banner colour that reaches the ${blob.side} of the month. Bare blobs of that colour sit at month edges all over the workbook, so its ${days} (${where}) may be decoration; they were kept, check the true ${blob.side} of the stay.`,
        });
        continue;
      }
      const others = across[blob.side];
      const beyond = others.map((o) => ` On the other side of them the same berth is held by ${o.label} (${dateSpan(o.startDate, o.endDate)}, ${o.sourceRef}), so the two may be one stay.`).join("");
      issues.push({
        type: "ambiguous_extent", reason: "decorative_overpaint", sourceRef: s.sourceRef, related: others.map((o) => o.id),
        detail: `The bar at ${s.sourceRef} runs straight into ${plural(n, "banner-coloured cell")} at the ${blob.side} of the month (${where}). Bare cells of that colour are decoration and were not counted, but they may be painted over the ${days} of this stay.${beyond}`,
      });
    }
  }
  return issues;
}

export type SeedBuild = {
  seed: Seed;
  overlapPairs: number;
  /** Pairs of stays that only a bare edge blob keeps apart; the blob's warning names the other stay. */
  blobNeighbourPairs: number;
};

/**
 * Stays + linked vessels -> the seed contract. Status is derived, never chosen:
 * a reservation is `needs_review` exactly when it carries a blocking issue.
 */
export function toSeed(stays: readonly Stay[], vessels: readonly LinkedVessel[]): SeedBuild {
  const vesselById = new Map(vessels.map((v) => [v.id, v]));
  if (vesselById.size !== vessels.length) throw new Error("Two vessel names produce the same id slug");

  const ordered = [...stays].sort((a, b) => text(a.segments[0].sourceRef, b.segments[0].sourceRef) || compareDates(a.segments[0].startDate, b.segments[0].startDate));
  const perFirstRun = new Map<string, number>();
  const reservations: ReservationSeed[] = [];
  const pending = new Map<string, PendingIssue[]>();
  const labels = new Map<string, string>();

  for (const stay of ordered) {
    const first = stay.segments[0];
    const n = perFirstRun.get(first.sourceRef) ?? 0;
    perFirstRun.set(first.sourceRef, n + 1);
    const id = reservationId(first.sourceRef, n);

    const named = stay.segments.find((s) => s.occupant !== null);
    const occupant = named?.occupant ?? null;
    const notes = [...new Set(stay.segments.flatMap((s) => s.notes))];
    const startDate = stay.segments.map((s) => s.startDate).sort(compareDates)[0];
    const endDate = stay.segments.map((s) => s.endDate).sort(compareDates).reverse()[0];
    const sourceRef = stay.segments.map((s) => s.sourceRef).join(";");

    const issues = segmentIssues(stay.segments);
    let vesselId: string | null = null;
    let title: string | null = null;
    if (occupant?.kind === "vessel") {
      vesselId = vesselIdFromKey(occupant.nameKey);
      if (!vesselById.has(vesselId)) throw new Error(`Reservation at ${sourceRef} names ${occupant.nameKey}, which was not linked`);
      const v = vesselById.get(vesselId) as LinkedVessel;
      labels.set(id, displayVesselName(v.prefix, v.name));
    } else if (occupant) {
      title = occupant.title;
      labels.set(id, `"${title}"`);
    } else {
      title = notes.length > 0 ? notes.join("; ") : UNLABELLED_TITLE;
      labels.set(id, "an unlabelled bar");
      issues.unshift({ type: "unlabelled", reason: notes.length > 0 ? "notes_only" : "no_label", detail: `The coloured bar at ${sourceRef} (${startDate} to ${endDate}) names no vessel or event; identify the occupant or delete the row.`, sourceRef, related: [] });
    }

    reservations.push({
      id,
      berthId: first.berthId,
      kind: occupant?.kind ?? "event",
      vesselId,
      title,
      startDate,
      endDate,
      status: "confirmed",
      notes: notes.join("\n"),
      rawLabel: named?.rawLabel ?? null,
      sourceRef,
    });
    pending.set(id, issues);
  }

  // Edge blobs come last because a warning names the stay on the far side, and that needs every id to exist.
  const pairs = blobNeighbours(ordered);
  // Only the month that faces the blob is cited: a 14-month neighbour would otherwise bury the sentence in cell refs.
  const neighbour = (k: number, facing: "first" | "last"): Neighbour => {
    const r = reservations[k];
    const months = ordered[k].segments;
    const segment = months.reduce((a, b) => ((facing === "first" ? b.startDate < a.startDate : b.endDate > a.endDate) ? b : a));
    return { id: r.id, label: labels.get(r.id) as string, startDate: r.startDate, endDate: r.endDate, sourceRef: segment.sourceRef };
  };
  ordered.forEach((stay, k) => {
    const across = { start: pairs.filter((p) => p.after === k).map((p) => neighbour(p.before, "last")), end: pairs.filter((p) => p.before === k).map((p) => neighbour(p.after, "first")) };
    (pending.get(reservations[k].id) as PendingIssue[]).push(...edgeBlobIssues(stay, across));
  });

  const audit = auditOverlaps(reservations.map((r) => ({ id: r.id, berthId: r.berthId, startDate: r.startDate, endDate: r.endDate, label: labels.get(r.id) as string, sourceRef: r.sourceRef })));
  for (const f of audit.findings) {
    (pending.get(f.reservationId) as PendingIssue[]).push({ type: "overlap", reason: f.reason, detail: f.detail, sourceRef: null, related: [f.otherId] });
  }

  const issues: IssueSeed[] = [];
  for (const r of reservations) {
    const counters = new Map<string, number>();
    for (const p of pending.get(r.id) as PendingIssue[]) {
      const key = `${p.type}/${p.reason}`;
      const n = counters.get(key) ?? 0;
      counters.set(key, n + 1);
      const severity = BLOCKING_ISSUE_TYPES.has(p.type) ? "blocking" : "warning";
      if (severity === "blocking") r.status = "needs_review";
      issues.push({ id: issueId(p.type, r.id, p.reason, n), type: p.type, severity, reason: p.reason, reservationId: r.id, vesselId: null, relatedReservationIds: p.related, detail: p.detail, sourceRef: p.sourceRef ?? r.sourceRef });
    }
  }
  for (const v of vessels) {
    if (v.lengthStatus !== "conflict") continue;
    issues.push({
      id: issueId("length_conflict", v.id, "registry_conflict", 0),
      type: "length_conflict",
      severity: "warning",
      reason: "registry_conflict",
      reservationId: null,
      vesselId: v.id,
      relatedReservationIds: [],
      detail: `${displayVesselName(v.prefix, v.name)} has more than one length on file (${v.lengthCandidates.map((ft) => `${ft} ft`).join(", ")}); fit checks are off for this vessel until one is confirmed.`,
      sourceRef: null,
    });
  }

  const vesselSeeds: VesselSeed[] = vessels.map((v) => ({
    id: v.id, name: v.name, nameKey: v.nameKey, prefix: v.prefix, lengthFt: v.lengthFt, lengthStatus: v.lengthStatus,
    lengthCandidates: v.lengthCandidates, lengthEvidence: v.lengthEvidence, origin: v.origin,
  }));

  return {
    seed: {
      berths: BERTHS.map((b) => ({ id: b.id, name: b.name, lengthFt: b.lengthFt, sortOrder: b.sortOrder })),
      vessels: vesselSeeds.sort((a, b) => text(a.id, b.id)),
      reservations: reservations.sort((a, b) => text(a.id, b.id)),
      issues: issues.sort((a, b) => text(a.id, b.id)),
    },
    overlapPairs: audit.pairs,
    blobNeighbourPairs: pairs.length,
  };
}

/** The sections of the report that only the pipeline can know (what it skipped, and why). */
export type PipelineFindings = Omit<ImportReport, "schemaVersion" | "imported" | "issues" | "vesselLinking" | "fit"> & {
  registryEntries: number;
  registryColumnAIgnored: number;
  overlapPairs: number;
};

const TOP_N = 15;

/** Everything in the report that can be derived from the seed is derived from the seed, so the two cannot disagree. */
export function buildReport(seed: Seed, findings: PipelineFindings): ImportReport {
  const { registryEntries, registryColumnAIgnored, overlapPairs, ...sections } = findings;
  const vesselById = new Map(seed.vessels.map((v) => [v.id, v]));
  const berthById = new Map(seed.berths.map((b) => [b.id as string, b]));

  const byKind: Record<string, number> = {};
  const byBerth: Record<string, number> = {};
  const byYear: Record<string, number> = {};
  const daysByMonth: Record<string, number> = {};
  const bookings = new Map<string, number>();
  const fitTop = new Map<string, { vessel: string; vesselFt: number; berth: string; berthFt: number; count: number }>();
  let first = "9999-12-31";
  let last = "0000-01-01";
  let resolvable = 0;
  let unknownLength = 0;
  let violations = 0;

  for (const r of seed.reservations) {
    bump(byKind, r.kind);
    bump(byBerth, r.berthId);
    bump(byYear, r.startDate.slice(0, 4));
    if (r.startDate < first) first = r.startDate;
    if (r.endDate > last) last = r.endDate;
    for (let day = r.startDate; day <= r.endDate; ) {
      const monthEnd = monthBounds(yearMonthOf(day)).end;
      const until = monthEnd < r.endDate ? monthEnd : r.endDate;
      bump(daysByMonth, yearMonthOf(day), toEpochDay(until) - toEpochDay(day) + 1);
      day = addDays(until, 1);
    }
    if (r.kind !== "vessel" || !r.vesselId) continue;
    bookings.set(r.vesselId, (bookings.get(r.vesselId) ?? 0) + 1);
    const vessel = vesselById.get(r.vesselId) as VesselSeed;
    const berth = berthById.get(r.berthId);
    if (!hasUsableLength(vessel.lengthStatus) || !berth) {
      unknownLength++;
      continue;
    }
    resolvable++;
    const verdict = fitVerdict(vessel.lengthFt, berth.lengthFt);
    if (verdict.kind !== "too_long") continue;
    violations++;
    const key = `${vessel.id}|${berth.id}`;
    const row = fitTop.get(key) ?? { vessel: displayVesselName(vessel.prefix, vessel.name), vesselFt: verdict.vesselFt, berth: berth.name, berthFt: berth.lengthFt, count: 0 };
    row.count++;
    fitTop.set(key, row);
  }

  const busiest = Object.entries(daysByMonth).sort((a, b) => b[1] - a[1] || text(a[0], b[0]))[0] ?? ["", 0];
  const byType: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  for (const i of seed.issues) {
    bump(byType, i.type);
    bump(byReason, `${i.type}/${i.reason ?? "none"}`);
  }

  const status = (s: string) => seed.vessels.filter((v) => v.lengthStatus === s).length;
  const vesselReservations = resolvable + unknownLength;

  return {
    schemaVersion: 1,
    source: sections.source,
    sheets: sections.sheets,
    blocks: sections.blocks,
    runs: sections.runs,
    stitching: sections.stitching,
    imported: {
      berths: seed.berths.length,
      vessels: { fromGrid: seed.vessels.filter((v) => v.origin === "grid").length, registryOnly: seed.vessels.filter((v) => v.origin === "registry").length },
      reservations: {
        total: seed.reservations.length,
        confirmed: seed.reservations.filter((r) => r.status === "confirmed").length,
        needsReview: seed.reservations.filter((r) => r.status === "needs_review").length,
        byKind: sortedCounts(byKind),
        byBerth: sortedCounts(byBerth),
        byYear: sortedCounts(byYear),
      },
      dateRange: { first, last },
      busiestMonth: busiest[0],
      busiestMonthReservationDays: busiest[1],
    },
    issues: { total: seed.issues.length, byType: sortedCounts(byType), byReason: sortedCounts(byReason), overlapPairs },
    vesselLinking: {
      registryEntries,
      registryColumnAIgnored,
      verified: status("verified"),
      probable: status("probable"),
      conflict: status("conflict"),
      unknown: status("unknown"),
      bookingCoveragePct: vesselReservations === 0 ? 0 : Math.round((resolvable / vesselReservations) * 1000) / 10,
      registryConflicts: seed.vessels
        .filter((v) => v.lengthStatus === "conflict")
        .map((v) => ({ vessel: displayVesselName(v.prefix, v.name), origin: v.origin, candidates: v.lengthCandidates, evidence: v.lengthEvidence ?? "" })),
      topUnlinked: seed.vessels
        .filter((v) => v.lengthStatus === "unknown")
        .map((v) => ({ name: displayVesselName(v.prefix, v.name), bookings: bookings.get(v.id) ?? 0 }))
        .sort((a, b) => b.bookings - a.bookings || text(a.name, b.name))
        .slice(0, TOP_N),
    },
    fit: {
      resolvableReservations: resolvable,
      unknownLengthReservations: unknownLength,
      violations,
      top: [...fitTop.values()].sort((a, b) => b.count - a.count || text(a.vessel, b.vessel) || text(a.berth, b.berth)).slice(0, TOP_N),
    },
    notImported: sections.notImported,
    structuralFills: sections.structuralFills,
    reconciliation: sections.reconciliation,
    vocab: sections.vocab,
  };
}
