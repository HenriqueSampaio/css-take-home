/**
 * Reservation writes: the two rules the system exists for.
 *
 * 1. No double-booking. The database guarantees it (exclusion constraint on
 *    confirmed rows); the service checks first so it can NAME what is in the way,
 *    and still catches SQLSTATE 23P01 for the request that loses a race between
 *    that check and its own write.
 * 2. The vessel must fit. Checked here, inside the transaction, against the
 *    length on file. Deliberately not a database constraint: 23 years of legacy
 *    rows violate it, and lengths get corrected after the fact.
 *
 * One conflict rule everywhere: only a CONFIRMED overlap blocks. An overlapping
 * needs_review row (unresolved legacy data) is a caution; cancelled rows are
 * invisible.
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { ISODate } from "../domain/dates";
import { fitVerdict, hasUsableLength } from "../domain/fit";
import { displayVesselName } from "../domain/names";
import { lengthInDays } from "../domain/ranges";
import { findBerth, findOverlapping } from "../db/queries/overlaps";
import { reservations, vessels, type Vessel } from "../db/schema";
import type { Db, Tx } from "../db/types";
import { abort, runService } from "./errors";
import {
  applyVerifiedLength, bumpMutations, hasOpenReservationIssues, idField, isoDateField, lengthFtField, lostRace, MAX_SPAN_DAYS, MIN_START_DATE,
  newReservationId, notesField, resolveReservationIssues, titleField, versionField, type ServiceSeams,
} from "./internal";
import { cautionMessage, conflictMessage, lengthOnFileMessage, lengthRequiredMessage, MESSAGES, tooLongMessage } from "./messages";
import { failure, invalid, ok, type ServiceFailure, type ServiceResult } from "./result";
import { insertVessel, resolveVesselIdentity, vesselNameField, vesselPrefixField } from "./vessels";

export type ReservationKind = "vessel" | "event" | "closure";

export type CreateReservationInput = {
  kind: ReservationKind;
  berthId: string;
  startDate: ISODate;
  /** Inclusive. */
  endDate: ISODate;
  /** Vessel kind: an existing vessel. Wins over `newVessel` when both are sent. */
  vesselId?: string | null;
  /** Vessel kind: register a vessel on the fly. An existing vessel with the same name is reused. */
  newVessel?: { name: string; prefix?: string | null; lengthFt: number } | null;
  /** Required when the chosen vessel has no usable length on file; it then becomes the vessel's verified length. */
  vesselLengthFt?: number | null;
  /** Event and closure kinds: required. Ignored for vessel bookings. */
  title?: string | null;
  notes?: string | null;
};

export type UpdateReservationInput = {
  id: string;
  /** The `version` the form was loaded with. */
  version: number;
  berthId: string;
  startDate: ISODate;
  endDate: ISODate;
  /** Vessel bookings only; omitted keeps the current vessel. */
  vesselId?: string | null;
  /** Events and closures only; omitted keeps the current title. */
  title?: string | null;
  /** Omitted keeps the current notes. */
  notes?: string | null;
  vesselLengthFt?: number | null;
};

export type ReservationRef = { id: string; version: number };

const blankToUndefined = (value: string | null | undefined): string | undefined => (value ? value : undefined);
const optionalId = z.string().trim().max(200).nullish().transform(blankToUndefined);

const createSchema = z.object({
  kind: z.enum(["vessel", "event", "closure"], { error: "Choose what this booking is for: a vessel, an event or a closure." }),
  berthId: idField("Berth"),
  startDate: isoDateField("Start date"),
  endDate: isoDateField("End date"),
  vesselId: optionalId,
  newVessel: z.object({ name: vesselNameField, prefix: vesselPrefixField.nullish(), lengthFt: lengthFtField }).nullish(),
  vesselLengthFt: lengthFtField.nullish(),
  title: titleField.nullish().transform(blankToUndefined),
  notes: notesField.nullish(),
});

const updateSchema = z.object({
  id: idField("Reservation"),
  version: versionField,
  berthId: idField("Berth"),
  startDate: isoDateField("Start date"),
  endDate: isoDateField("End date"),
  vesselId: optionalId,
  title: titleField.nullish().transform(blankToUndefined),
  notes: notesField.nullish(),
  vesselLengthFt: lengthFtField.nullish(),
});

const refSchema = z.object({ id: idField("Reservation"), version: versionField });

/** In the order a person would fix them: the range itself, then its size, then how far back it reaches. */
function checkDates(startDate: ISODate, endDate: ISODate): ServiceFailure | null {
  if (startDate > endDate) return invalid("endDate", "The end date is before the start date.");
  if (lengthInDays({ start: startDate, end: endDate }) > MAX_SPAN_DAYS) {
    return invalid("endDate", `A booking can cover at most ${MAX_SPAN_DAYS} days (two years). Split a longer stay into separate bookings.`);
  }
  // Backdated bookings are allowed on purpose (recording what already happened); this only stops typos like 0203.
  if (startDate < MIN_START_DATE) return invalid("startDate", "The schedule starts on Jan 1, 1997. Pick a start date on or after that.");
  return null;
}

async function lockVessel(tx: Tx, vesselId: string): Promise<Vessel> {
  // Locked because the booking may verify this vessel's length in the same transaction.
  const [vessel] = await tx.select().from(vessels).where(eq(vessels.id, vesselId)).limit(1).for("update");
  if (!vessel) abort(failure("NOT_FOUND", MESSAGES.vesselGone, { fieldErrors: { vesselId: [MESSAGES.vesselGone] } }));
  return vessel;
}

type LengthDecision = { lengthFt: number; verifyOnSave: boolean; note?: string };

/**
 * Rule 3: a booking needs ONE number to check against the berth. A verified or
 * probable length on file is that number. Without one, the coordinator must
 * supply it, and doing so settles the vessel's length for good.
 */
function decideLength(vessel: Vessel, suppliedFt: number | undefined, suppliedIsCorrection: boolean): LengthDecision {
  const name = displayVesselName(vessel.prefix, vessel.name);
  if (hasUsableLength(vessel.lengthStatus) && vessel.lengthFt !== null) {
    const ignored = suppliedIsCorrection && suppliedFt !== undefined && suppliedFt !== vessel.lengthFt;
    return { lengthFt: vessel.lengthFt, verifyOnSave: false, note: ignored ? lengthOnFileMessage(name, vessel.lengthFt) : undefined };
  }
  if (suppliedFt === undefined) {
    const message = lengthRequiredMessage(name, vessel.lengthCandidates);
    abort(failure("LENGTH_REQUIRED", message, { fieldErrors: { vesselLengthFt: [message] } }));
  }
  return { lengthFt: suppliedFt, verifyOnSave: true };
}

function assertFits(vessel: Vessel, berth: { name: string; lengthFt: number }, lengthFt: number): void {
  const verdict = fitVerdict(lengthFt, berth.lengthFt);
  if (verdict.kind !== "too_long") return;
  const fit = { vesselFt: verdict.vesselFt, berthFt: verdict.berthFt, overByFt: verdict.overByFt };
  abort(failure("TOO_LONG", tooLongMessage(displayVesselName(vessel.prefix, vessel.name), berth.name, fit), { fit }));
}

type Slot = { berthId: string; startDate: ISODate; endDate: ISODate; excludeId?: string };

/** The friendly pre-check. Returns the cautions (unresolved legacy overlaps) when nothing confirmed is in the way. */
async function assertFree(tx: Tx, berthName: string, slot: Slot) {
  const inTheWay = await findOverlapping(tx, slot);
  const conflicts = inTheWay.filter((o) => o.status === "confirmed");
  if (conflicts.length > 0) abort(failure("CONFLICT", conflictMessage(berthName, conflicts), { conflicts }));
  return inTheWay.filter((o) => o.status === "needs_review");
}

/** The race backstop: the write hit the exclusion constraint, so someone committed first. Find out who, then fail. */
async function abortAsLostRace(tx: Tx, berthName: string, slot: Slot): Promise<never> {
  const conflicts = await findOverlapping(tx, { ...slot, statuses: ["confirmed"] });
  return abort(failure("CONFLICT", conflictMessage(berthName, conflicts), { conflicts }));
}

const joinNotes = (notes: (string | undefined)[]): string | undefined => notes.filter(Boolean).join(" ") || undefined;

export function createReservation(db: Db, input: CreateReservationInput, seams?: ServiceSeams): Promise<ServiceResult<{ id: string }>> {
  return runService("createReservation", async () => {
    const parsed = createSchema.parse(input);
    const badDates = checkDates(parsed.startDate, parsed.endDate);
    if (badDates) return badDates;

    const isVessel = parsed.kind === "vessel";
    if (isVessel && !parsed.vesselId && !parsed.newVessel) return invalid("vesselId", "Choose the vessel this booking is for, or add a new one.");
    if (!isVessel && !parsed.title) return invalid("title", parsed.kind === "event" ? "Give the event a title." : "Give the closure a title, for example the reason the berth is closed.");

    return db.transaction(async (tx) => {
      const berth = await findBerth(tx, parsed.berthId);
      if (!berth) abort(failure("NOT_FOUND", MESSAGES.berthGone, { fieldErrors: { berthId: [MESSAGES.berthGone] } }));

      const slot: Slot = { berthId: berth.id, startDate: parsed.startDate, endDate: parsed.endDate };
      let vessel: Vessel | null = null;
      let length: LengthDecision | null = null;

      if (isVessel) {
        if (parsed.vesselId) {
          vessel = await lockVessel(tx, parsed.vesselId);
          length = decideLength(vessel, parsed.vesselLengthFt ?? undefined, true);
        } else if (parsed.newVessel) {
          const made = await insertVessel(tx, resolveVesselIdentity(parsed.newVessel), parsed.newVessel.lengthFt);
          vessel = made.vessel;
          // A reused vessel keeps the length already on file; the typed one only fills a gap.
          length = decideLength(vessel, parsed.newVessel.lengthFt, !made.created);
        }
      }
      if (vessel && length) assertFits(vessel, berth, length.lengthFt);

      const cautions = await assertFree(tx, berth.name, slot);
      await seams?.afterPreCheck?.(tx);

      if (vessel && length?.verifyOnSave) await applyVerifiedLength(tx, vessel, length.lengthFt);

      const id = newReservationId();
      const raced = await lostRace(tx, (sp) =>
        sp.insert(reservations).values({
          id,
          berthId: berth.id,
          kind: parsed.kind,
          vesselId: vessel?.id ?? null,
          // The subject CHECK wants a vessel XOR a title; a stray title on a vessel booking is dropped.
          title: isVessel ? null : parsed.title,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          status: "confirmed",
          notes: parsed.notes ?? "",
          source: "app",
        }),
      );
      if (raced) await abortAsLostRace(tx, berth.name, slot);

      await bumpMutations(tx);
      return ok({ id }, joinNotes([length?.note, cautions.length > 0 ? cautionMessage(berth.name, cautions) : undefined]));
    });
  });
}

export function updateReservation(db: Db, input: UpdateReservationInput, seams?: ServiceSeams): Promise<ServiceResult<ReservationRef>> {
  return runService("updateReservation", async () => {
    const parsed = updateSchema.parse(input);
    const badDates = checkDates(parsed.startDate, parsed.endDate);
    if (badDates) return badDates;

    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(reservations).where(eq(reservations.id, parsed.id)).limit(1).for("update");
      if (!row) abort(failure("NOT_FOUND", MESSAGES.reservationGone));
      if (row.status === "cancelled") abort(failure("INVALID_STATE", MESSAGES.editCancelled));
      if (row.version !== parsed.version) abort(failure("STALE", MESSAGES.reservationStale));

      const berth = await findBerth(tx, parsed.berthId);
      if (!berth) abort(failure("NOT_FOUND", MESSAGES.berthGone, { fieldErrors: { berthId: [MESSAGES.berthGone] } }));

      const isVessel = row.kind === "vessel";
      const title = isVessel ? row.title : (parsed.title ?? row.title);
      if (!isVessel && !title) abort(invalid("title", "Give this booking a title."));

      const slot: Slot = { berthId: berth.id, startDate: parsed.startDate, endDate: parsed.endDate, excludeId: row.id };
      const warnings: (string | undefined)[] = [];
      let vessel: Vessel | null = null;

      if (isVessel) {
        vessel = await lockVessel(tx, parsed.vesselId ?? row.vesselId!);
        const supplied = parsed.vesselLengthFt ?? undefined;
        // A coordinator must be able to fix a legacy row's dates without first resolving a misfit that
        // is already history. Moving it to another berth or vessel is a new decision, so that is checked.
        const grandfathered = row.source === "legacy" && berth.id === row.berthId && vessel.id === row.vesselId;
        if (!grandfathered) {
          const length = decideLength(vessel, supplied, true);
          assertFits(vessel, berth, length.lengthFt);
          warnings.push(length.note);
          if (length.verifyOnSave) await applyVerifiedLength(tx, vessel, length.lengthFt);
        } else {
          const usable = hasUsableLength(vessel.lengthStatus) && vessel.lengthFt !== null;
          if (!usable && supplied !== undefined) await applyVerifiedLength(tx, vessel, supplied);
          const verdict = fitVerdict(usable ? vessel.lengthFt : (supplied ?? null), berth.lengthFt);
          if (verdict.kind === "too_long") warnings.push(`Note: ${tooLongMessage(displayVesselName(vessel.prefix, vessel.name), berth.name, verdict)}`);
        }
      }

      const cautions = await assertFree(tx, berth.name, slot);
      await seams?.afterPreCheck?.(tx);

      const raced = await lostRace(tx, (sp) =>
        sp
          .update(reservations)
          .set({
            berthId: berth.id,
            vesselId: vessel?.id ?? null,
            title,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            notes: parsed.notes ?? row.notes,
            // Saving IS the review: the coordinator has looked at this row and stated what it should be.
            status: "confirmed",
            version: sql`${reservations.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(eq(reservations.id, row.id)),
      );
      if (raced) await abortAsLostRace(tx, berth.name, slot);

      await resolveReservationIssues(tx, row.id, "edited");
      await bumpMutations(tx);
      if (cautions.length > 0) warnings.push(cautionMessage(berth.name, cautions));
      return ok({ id: row.id, version: row.version + 1 }, joinNotes(warnings));
    });
  });
}

/** Soft cancel: the row stays for the record, stops blocking the berth, and can be restored with confirmReservation. */
export function cancelReservation(db: Db, input: ReservationRef): Promise<ServiceResult<ReservationRef>> {
  return runService("cancelReservation", async () => {
    const parsed = refSchema.parse(input);

    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(reservations).where(eq(reservations.id, parsed.id)).limit(1).for("update");
      if (!row) abort(failure("NOT_FOUND", MESSAGES.reservationGone));
      // Idempotent: a double click, or two coordinators cancelling the same stay, both get what they asked for.
      if (row.status === "cancelled") return ok({ id: row.id, version: row.version });
      if (row.version !== parsed.version) abort(failure("STALE", MESSAGES.reservationStale));

      await tx
        .update(reservations)
        .set({ status: "cancelled", cancelledAt: sql`now()`, version: sql`${reservations.version} + 1`, updatedAt: sql`now()` })
        .where(eq(reservations.id, row.id));
      await resolveReservationIssues(tx, row.id, "cancelled");
      await bumpMutations(tx);
      return ok({ id: row.id, version: row.version + 1 });
    });
  });
}

/**
 * needs_review -> confirmed ("this legacy row is right as it stands") and
 * cancelled -> confirmed (undo). Confirming brings the row under the exclusion
 * constraint, so of two colliding legacy rows only the first can be confirmed;
 * the second fails naming the first. A misfit does not block: the stay happened,
 * and refusing to record it would not make the vessel shorter.
 *
 * Also confirmed -> confirmed while the row has open findings: most of what the
 * importer flags are warnings on rows it confirmed itself, and "looks right" is
 * the same decision there. It takes the same path, version check included.
 */
export function confirmReservation(db: Db, input: ReservationRef, seams?: ServiceSeams): Promise<ServiceResult<ReservationRef>> {
  return runService("confirmReservation", async () => {
    const parsed = refSchema.parse(input);

    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(reservations).where(eq(reservations.id, parsed.id)).limit(1).for("update");
      if (!row) abort(failure("NOT_FOUND", MESSAGES.reservationGone));
      // Idempotent only once there is nothing left to do: a confirmed row can still carry findings
      // to close, and answering ok without closing them would leave it on the worklist forever.
      if (row.status === "confirmed" && !(await hasOpenReservationIssues(tx, row.id))) return ok({ id: row.id, version: row.version });
      if (row.version !== parsed.version) abort(failure("STALE", MESSAGES.reservationStale));

      const berth = await findBerth(tx, row.berthId);
      if (!berth) abort(failure("NOT_FOUND", MESSAGES.berthGone));

      const slot: Slot = { berthId: row.berthId, startDate: row.startDate, endDate: row.endDate, excludeId: row.id };
      const cautions = await assertFree(tx, berth.name, slot);
      await seams?.afterPreCheck?.(tx);

      const raced = await lostRace(tx, (sp) =>
        sp
          .update(reservations)
          .set({ status: "confirmed", cancelledAt: null, version: sql`${reservations.version} + 1`, updatedAt: sql`now()` })
          .where(eq(reservations.id, row.id)),
      );
      if (raced) await abortAsLostRace(tx, berth.name, slot);

      await resolveReservationIssues(tx, row.id, "confirmed");
      await bumpMutations(tx);

      const warnings: (string | undefined)[] = [];
      if (row.vesselId) {
        const [vessel] = await tx.select().from(vessels).where(eq(vessels.id, row.vesselId)).limit(1);
        if (vessel) {
          const name = displayVesselName(vessel.prefix, vessel.name);
          const verdict = fitVerdict(hasUsableLength(vessel.lengthStatus) ? vessel.lengthFt : null, berth.lengthFt);
          if (verdict.kind === "too_long") warnings.push(`Note: ${tooLongMessage(name, berth.name, verdict)}`);
          if (verdict.kind === "unknown") warnings.push(`Note: ${MESSAGES.fitUnknown(name)}`);
        }
      }
      if (cautions.length > 0) warnings.push(cautionMessage(berth.name, cautions));
      return ok({ id: row.id, version: row.version + 1 }, joinNotes(warnings));
    });
  });
}
