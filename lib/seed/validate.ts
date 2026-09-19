import { isISODate } from "../domain/dates";
import { hasUsableLength } from "../domain/fit";
import { findOverlappingPairs } from "../domain/ranges";
import { BERTH_IDS, BLOCKING_ISSUE_TYPES, ISSUE_TYPES, type Seed } from "./contract";

/**
 * Invariants every seed must satisfy. Run by the importer's tests, by a test
 * over the committed JSON, and by the seed script before it touches the
 * database, so a bad import fails in CI rather than in a reviewer's browser.
 *
 * I5 is the important one: it mirrors the database exclusion constraint, which
 * guarantees seeding (and "Reset demo data") can never be rejected by Postgres.
 */
export function validateSeed(seed: Seed): string[] {
  const errors: string[] = [];
  const fail = (msg: string) => errors.push(msg);

  // I1: unique ids
  for (const [label, rows] of [["berth", seed.berths], ["vessel", seed.vessels], ["reservation", seed.reservations], ["issue", seed.issues]] as const) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.id)) fail(`I1 duplicate ${label} id ${row.id}`);
      seen.add(row.id);
    }
  }

  // I7: the berth set is exactly the six known slugs
  const berthIds = new Set<string>(seed.berths.map((b) => b.id));
  if (berthIds.size !== BERTH_IDS.length || BERTH_IDS.some((id) => !berthIds.has(id))) {
    fail(`I7 berths must be exactly: ${BERTH_IDS.join(", ")}`);
  }
  for (const b of seed.berths) if (!(b.lengthFt > 0)) fail(`I7 berth ${b.id} needs a positive length`);

  // I6: vessel length <-> status, unique identity key
  const vesselIds = new Set(seed.vessels.map((v) => v.id));
  const nameKeys = new Set<string>();
  for (const v of seed.vessels) {
    if (nameKeys.has(v.nameKey)) fail(`I6 duplicate vessel nameKey ${v.nameKey}`);
    nameKeys.add(v.nameKey);
    if ((v.lengthFt !== null) !== hasUsableLength(v.lengthStatus)) {
      fail(`I6 vessel ${v.id}: lengthFt=${v.lengthFt} contradicts status ${v.lengthStatus}`);
    }
    if (v.lengthFt !== null && !(Number.isInteger(v.lengthFt) && v.lengthFt > 0)) fail(`I6 vessel ${v.id}: bad length ${v.lengthFt}`);
  }

  // I2/I3/I4: reservations reference real rows, have real ordered dates, and the right subject
  const reservationIds = new Set(seed.reservations.map((r) => r.id));
  for (const r of seed.reservations) {
    if (!berthIds.has(r.berthId)) fail(`I2 reservation ${r.id}: unknown berth ${r.berthId}`);
    if (!isISODate(r.startDate) || !isISODate(r.endDate)) fail(`I3 reservation ${r.id}: invalid dates ${r.startDate}..${r.endDate}`);
    else if (r.startDate > r.endDate) fail(`I3 reservation ${r.id}: start after end`);
    if (r.kind === "vessel") {
      if (!r.vesselId || !vesselIds.has(r.vesselId)) fail(`I4 reservation ${r.id}: vessel kind needs a known vesselId`);
    } else if (r.vesselId !== null || !r.title) {
      fail(`I4 reservation ${r.id}: ${r.kind} needs a title and no vesselId`);
    }
    if (!r.sourceRef) fail(`I4 reservation ${r.id}: legacy rows need a sourceRef`);
  }

  // I5: no two CONFIRMED reservations overlap on a berth (mirror of the DB exclusion constraint)
  const confirmed = seed.reservations
    .filter((r) => r.status === "confirmed" && isISODate(r.startDate) && isISODate(r.endDate))
    .map((r) => ({ id: r.id, berthId: r.berthId, start: r.startDate, end: r.endDate }));
  for (const [a, b] of findOverlappingPairs(confirmed, (r) => r.berthId)) {
    fail(`I5 confirmed reservations overlap on ${a.berthId}: ${a.id} (${a.start}..${a.end}) and ${b.id} (${b.start}..${b.end})`);
  }

  // I2 (issues) + I8: every needs_review row is explained by at least one blocking issue
  const blockedBy = new Map<string, number>();
  for (const i of seed.issues) {
    if (!ISSUE_TYPES.includes(i.type)) fail(`I2 issue ${i.id}: unknown type ${i.type}`);
    if (i.reservationId !== null && !reservationIds.has(i.reservationId)) fail(`I2 issue ${i.id}: unknown reservation ${i.reservationId}`);
    if (i.vesselId !== null && !vesselIds.has(i.vesselId)) fail(`I2 issue ${i.id}: unknown vessel ${i.vesselId}`);
    if (i.reservationId === null && i.vesselId === null) fail(`I2 issue ${i.id}: must reference a reservation or a vessel`);
    for (const rel of i.relatedReservationIds) if (!reservationIds.has(rel)) fail(`I2 issue ${i.id}: unknown related reservation ${rel}`);
    if ((i.severity === "blocking") !== BLOCKING_ISSUE_TYPES.has(i.type)) fail(`I8 issue ${i.id}: severity ${i.severity} does not match type ${i.type}`);
    if (i.severity === "blocking" && i.reservationId) blockedBy.set(i.reservationId, (blockedBy.get(i.reservationId) ?? 0) + 1);
  }
  for (const r of seed.reservations) {
    const blocked = (blockedBy.get(r.id) ?? 0) > 0;
    if (r.status === "needs_review" && !blocked) fail(`I8 reservation ${r.id}: needs_review without a blocking issue`);
    if (r.status === "confirmed" && blocked) fail(`I8 reservation ${r.id}: confirmed but has a blocking issue`);
  }

  return errors;
}

export function assertValidSeed(seed: Seed): void {
  const errors = validateSeed(seed);
  if (errors.length > 0) {
    const shown = errors.slice(0, 25).join("\n  ");
    throw new Error(`Seed failed validation (${errors.length} problem${errors.length === 1 ? "" : "s"}):\n  ${shown}${errors.length > 25 ? "\n  ..." : ""}`);
  }
}
