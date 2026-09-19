/**
 * Reservation writes: the rules the system exists for.
 *
 * 1. No double-booking. The database guarantees it (exclusion constraint on
 *    confirmed rows); the service checks first so it can NAME what is in the way,
 *    and still catches SQLSTATE 23P01 for the request that loses a race between
 *    that check and its own write.
 * 2. The vessel must fit. Checked here, inside the transaction, against the
 *    vessel's length and the berth's length, with both rows share-locked so
 *    neither can change before the booking commits (see lockBerth in ./internal).
 * 3. The schedule only moves forward. A reservation starts today or later; a
 *    stay that has ended is history and can no longer be edited, cancelled or
 *    restored; a stay in progress can still be edited, but its start stays put.
 *
 * A reservation is either valid and confirmed, or refused with the reason.
 * Cancelled rows are kept for the record and are invisible to every check.
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { ISODate } from "../domain/dates";
import { fitVerdict } from "../domain/fit";
import { displayVesselName } from "../domain/names";
import { isCompleted } from "../domain/phase";
import { lengthInDays } from "../domain/ranges";
import { findOverlapping } from "../db/queries/overlaps";
import { reservations, type Berth, type Reservation, type Vessel } from "../db/schema";
import type { Db, Tx } from "../db/types";
import { abort, runService } from "./errors";
import {
  bumpMutations, idField, isoDateField, lockBerth, lockVessel, lostRace, MAX_SPAN_DAYS, NUL_MESSAGE, newReservationId, noNul, notesField,
  titleField, todayOf, versionField, type ServiceOptions,
} from "./internal";
import { conflictMessage, lengthOnFileMessage, MESSAGES, tooLongMessage } from "./messages";
import { failure, invalid, ok, type ServiceFailure, type ServiceResult } from "./result";
import { insertVessel, newVesselSchema, resolveVesselIdentity } from "./vessels";

export type ReservationKind = "vessel" | "event" | "closure";

export type CreateReservationInput = {
  kind: ReservationKind;
  berthId: string;
  /** Today or later. */
  startDate: ISODate;
  /** Inclusive. */
  endDate: ISODate;
  /** Vessel kind: an existing vessel. Wins over `newVessel` when both are sent. */
  vesselId?: string | null;
  /** Vessel kind: register a vessel on the fly. An existing vessel with the same name is reused. */
  newVessel?: { name: string; prefix?: string | null; lengthFt: number } | null;
  /** Event and closure kinds: required. Ignored for vessel bookings. */
  title?: string | null;
  notes?: string | null;
};

/** The vessel of a reservation cannot be changed: cancel it and book the other vessel instead. */
export type UpdateReservationInput = {
  id: string;
  /** The `version` the form was loaded with. */
  version: number;
  berthId: string;
  startDate: ISODate;
  endDate: ISODate;
  /** Events and closures only; omitted keeps the current title. */
  title?: string | null;
  /** Omitted keeps the current notes. */
  notes?: string | null;
};

export type ReservationRef = { id: string; version: number };

const createSchema = z.object({
  kind: z.enum(["vessel", "event", "closure"], { error: "Choose what this booking is for: a vessel, an event or a closure." }),
  berthId: idField("Berth"),
  startDate: isoDateField("Start date"),
  endDate: isoDateField("End date"),
  notes: notesField.nullish(),
});

const updateSchema = z.object({
  id: idField("Reservation"),
  version: versionField,
  berthId: idField("Berth"),
  startDate: isoDateField("Start date"),
  endDate: isoDateField("End date"),
  notes: notesField.nullish(),
});

// A booking form posts every field it has, including the ones it hides for this kind of booking. Only the
// fields that apply are validated, each with its own schema: a blank "new vessel" panel must not block an
// event, nor a booking for a vessel picked from the list.
const vesselIdSchema = z.object({ vesselId: z.string().trim().max(200).refine(noNul, NUL_MESSAGE).nullish() });
const newVesselFieldSchema = z.object({ newVessel: newVesselSchema.nullish() });
const titleSchema = z.object({ title: titleField.nullish() });

const refSchema = z.object({ id: idField("Reservation"), version: versionField });

type Subject = { vesselId: string } | { newVessel: z.infer<typeof newVesselSchema> } | { title: string };

function subjectOf(kind: ReservationKind, input: unknown): Subject {
  if (kind !== "vessel") {
    const { title } = titleSchema.parse(input);
    if (!title) abort(invalid("title", kind === "event" ? "Give the event a title." : "Give the closure a title, for example the reason the berth is closed."));
    return { title };
  }
  const { vesselId } = vesselIdSchema.parse(input);
  if (vesselId) return { vesselId };
  const { newVessel } = newVesselFieldSchema.parse(input);
  if (!newVessel) abort(invalid("vesselId", "Choose the vessel this booking is for, or add a new one."));
  return { newVessel };
}

/** In the order a person would fix them: the range itself, then its size. */
function checkRange(startDate: ISODate, endDate: ISODate): ServiceFailure | null {
  if (startDate > endDate) return invalid("endDate", "The end date is before the start date.");
  if (lengthInDays({ start: startDate, end: endDate }) > MAX_SPAN_DAYS) {
    return invalid("endDate", `A booking can cover at most ${MAX_SPAN_DAYS} days (two years). Split a longer stay into separate bookings.`);
  }
  return null;
}

function assertFits(vessel: Vessel, berth: Berth): void {
  const verdict = fitVerdict(vessel.lengthFt, berth.lengthFt);
  if (verdict.kind !== "too_long") return;
  const fit = { vesselFt: verdict.vesselFt, berthFt: verdict.berthFt, overByFt: verdict.overByFt };
  abort(failure("TOO_LONG", tooLongMessage(displayVesselName(vessel.prefix, vessel.name), berth.name, fit), { fit }));
}

/** Rule 3: once a stay has ended, the record of it is final. */
function assertNotEnded(row: Reservation, today: ISODate): void {
  if (isCompleted({ start: row.startDate, end: row.endDate }, today)) abort(failure("INVALID_STATE", MESSAGES.stayEnded(row.endDate)));
}

async function lockReservation(tx: Tx, id: string): Promise<Reservation> {
  const [row] = await tx.select().from(reservations).where(eq(reservations.id, id)).limit(1).for("update");
  if (!row) abort(failure("NOT_FOUND", MESSAGES.reservationGone));
  return row;
}

type Slot = { berthId: string; startDate: ISODate; endDate: ISODate; excludeId?: string };

/** The friendly pre-check: refuse with the names of the confirmed stays that hold those days. */
async function assertFree(tx: Tx, berthName: string, slot: Slot): Promise<void> {
  const conflicts = await findOverlapping(tx, slot);
  if (conflicts.length > 0) abort(failure("CONFLICT", conflictMessage(berthName, conflicts), { conflicts }));
}

/** The race backstop: the write hit the exclusion constraint, so someone committed first. Find out who, then fail. */
async function abortAsLostRace(tx: Tx, berthName: string, slot: Slot): Promise<never> {
  const conflicts = await findOverlapping(tx, slot);
  return abort(failure("CONFLICT", conflictMessage(berthName, conflicts), { conflicts }));
}

export function createReservation(db: Db, input: CreateReservationInput, opts?: ServiceOptions): Promise<ServiceResult<{ id: string }>> {
  return runService("createReservation", async () => {
    const today = todayOf(opts);
    const parsed = createSchema.parse(input);
    if (parsed.startDate < today) return invalid("startDate", MESSAGES.startInPast(today));
    const badRange = checkRange(parsed.startDate, parsed.endDate);
    if (badRange) return badRange;
    const subject = subjectOf(parsed.kind, input);

    return db.transaction(async (tx) => {
      const berth = await lockBerth(tx, parsed.berthId, "share");
      if (berth.retiredAt) abort(failure("INVALID_STATE", MESSAGES.berthRetired(berth.name), { fieldErrors: { berthId: [MESSAGES.berthRetired(berth.name)] } }));

      let vessel: Vessel | null = null;
      let note: string | undefined;
      if ("vesselId" in subject) {
        vessel = await lockVessel(tx, subject.vesselId, "share");
      } else if ("newVessel" in subject) {
        const made = await insertVessel(tx, resolveVesselIdentity(subject.newVessel), subject.newVessel.lengthFt);
        vessel = made.vessel;
        // A vessel that is already registered keeps its length; the one typed here is not a correction.
        if (!made.created && vessel.lengthFt !== subject.newVessel.lengthFt) note = lengthOnFileMessage(displayVesselName(vessel.prefix, vessel.name), vessel.lengthFt);
      }

      // Fit before availability, like classifyBerths: a berth that is too short can never work, so there is
      // no point sending the coordinator to look for other dates on it.
      if (vessel) assertFits(vessel, berth);

      const slot: Slot = { berthId: berth.id, startDate: parsed.startDate, endDate: parsed.endDate };
      await assertFree(tx, berth.name, slot);
      await opts?.afterPreCheck?.(tx);

      const id = newReservationId();
      const raced = await lostRace(tx, (sp) =>
        sp.insert(reservations).values({
          id,
          berthId: berth.id,
          kind: parsed.kind,
          // The subject CHECK wants a vessel XOR a title.
          vesselId: vessel?.id ?? null,
          title: "title" in subject ? subject.title : null,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          status: "confirmed",
          notes: parsed.notes ?? "",
        }),
      );
      if (raced) await abortAsLostRace(tx, berth.name, slot);

      await bumpMutations(tx);
      return ok({ id }, note);
    });
  });
}

export function updateReservation(db: Db, input: UpdateReservationInput, opts?: ServiceOptions): Promise<ServiceResult<ReservationRef>> {
  return runService("updateReservation", async () => {
    const today = todayOf(opts);
    const parsed = updateSchema.parse(input);
    const badRange = checkRange(parsed.startDate, parsed.endDate);
    if (badRange) return badRange;

    return db.transaction(async (tx) => {
      const row = await lockReservation(tx, parsed.id);
      if (row.status === "cancelled") abort(failure("INVALID_STATE", MESSAGES.editCancelled));
      assertNotEnded(row, today);
      if (row.version !== parsed.version) abort(failure("STALE", MESSAGES.reservationStale));

      // Rule 4: days that have already happened cannot be rewritten. A stay in progress keeps the start it
      // had (or gives up its past days entirely by moving to today or later), and nothing can end before today.
      if (parsed.startDate !== row.startDate && parsed.startDate < today) {
        abort(invalid("startDate", row.startDate < today ? MESSAGES.startLocked(row.startDate, today) : MESSAGES.startInPast(today)));
      }
      if (parsed.endDate < today) abort(invalid("endDate", MESSAGES.endInPast(today)));

      const berth = await lockBerth(tx, parsed.berthId, "share");
      // A stay may be edited where it already is; it may not be moved ONTO a retired berth.
      if (berth.retiredAt && berth.id !== row.berthId) {
        abort(failure("INVALID_STATE", MESSAGES.berthRetired(berth.name), { fieldErrors: { berthId: [MESSAGES.berthRetired(berth.name)] } }));
      }

      let title = row.title;
      if (row.kind === "vessel") {
        assertFits(await lockVessel(tx, row.vesselId!, "share"), berth);
      } else {
        // Validated only here, where it applies: a vessel stay ignores whatever title the form sent.
        title = titleSchema.parse(input).title ?? row.title;
        if (!title) abort(invalid("title", "Give this booking a title."));
      }

      const slot: Slot = { berthId: berth.id, startDate: parsed.startDate, endDate: parsed.endDate, excludeId: row.id };
      await assertFree(tx, berth.name, slot);
      await opts?.afterPreCheck?.(tx);

      const raced = await lostRace(tx, (sp) =>
        sp
          .update(reservations)
          .set({
            berthId: berth.id,
            title,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            notes: parsed.notes ?? row.notes,
            version: sql`${reservations.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(eq(reservations.id, row.id)),
      );
      if (raced) await abortAsLostRace(tx, berth.name, slot);

      await bumpMutations(tx);
      return ok({ id: row.id, version: row.version + 1 });
    });
  });
}

/** Soft cancel: the row stays for the record, stops blocking the berth, and can be brought back with restoreReservation. */
export function cancelReservation(db: Db, input: ReservationRef, opts?: ServiceOptions): Promise<ServiceResult<ReservationRef>> {
  return runService("cancelReservation", async () => {
    const today = todayOf(opts);
    const parsed = refSchema.parse(input);

    return db.transaction(async (tx) => {
      const row = await lockReservation(tx, parsed.id);
      // Idempotent: a double click, or two coordinators cancelling the same stay, both get what they asked for.
      if (row.status === "cancelled") return ok({ id: row.id, version: row.version });
      assertNotEnded(row, today);
      if (row.version !== parsed.version) abort(failure("STALE", MESSAGES.reservationStale));

      await tx
        .update(reservations)
        .set({ status: "cancelled", cancelledAt: sql`now()`, version: sql`${reservations.version} + 1`, updatedAt: sql`now()` })
        .where(eq(reservations.id, row.id));
      await bumpMutations(tx);
      return ok({ id: row.id, version: row.version + 1 });
    });
  });
}

/**
 * cancelled -> confirmed (undo). Restoring brings the row back under every
 * guarantee, and the world may have moved on while it was cancelled: nothing
 * looks at cancelled rows, so the berth may have been retired or shortened, the
 * vessel lengthened, or the days given to someone else. Each is checked again
 * here, exactly as for a new booking.
 */
export function restoreReservation(db: Db, input: ReservationRef, opts?: ServiceOptions): Promise<ServiceResult<ReservationRef>> {
  return runService("restoreReservation", async () => {
    const today = todayOf(opts);
    const parsed = refSchema.parse(input);

    return db.transaction(async (tx) => {
      const row = await lockReservation(tx, parsed.id);
      // Idempotent, like cancelling: a double click finds it already restored.
      if (row.status === "confirmed") return ok({ id: row.id, version: row.version });
      assertNotEnded(row, today);
      if (row.version !== parsed.version) abort(failure("STALE", MESSAGES.reservationStale));

      const berth = await lockBerth(tx, row.berthId, "share");
      if (berth.retiredAt) abort(failure("INVALID_STATE", MESSAGES.restoreOnRetiredBerth(berth.name)));
      if (row.vesselId) assertFits(await lockVessel(tx, row.vesselId, "share"), berth);

      const slot: Slot = { berthId: row.berthId, startDate: row.startDate, endDate: row.endDate, excludeId: row.id };
      await assertFree(tx, berth.name, slot);
      await opts?.afterPreCheck?.(tx);

      const raced = await lostRace(tx, (sp) =>
        sp
          .update(reservations)
          .set({ status: "confirmed", cancelledAt: null, version: sql`${reservations.version} + 1`, updatedAt: sql`now()` })
          .where(eq(reservations.id, row.id)),
      );
      if (raced) await abortAsLostRace(tx, berth.name, slot);

      await bumpMutations(tx);
      return ok({ id: row.id, version: row.version + 1 });
    });
  });
}
