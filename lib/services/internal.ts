/**
 * Building blocks shared by the write services. Everything here runs INSIDE the
 * caller's transaction, so a booking, the vessel length it verified, the issues
 * it resolved and the mutation counter all commit or roll back together.
 */
import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { isISODate } from "../domain/dates";
import { appMeta, issues, vessels, type Vessel } from "../db/schema";
import type { Tx } from "../db/types";
import { DEADLOCK_DETECTED, EXCLUSION_VIOLATION, pgErrorOf } from "./errors";

/** Test-only hooks. Production callers never pass these. */
export type ServiceSeams = {
  /** Runs after the conflict pre-check and before the write: the window in which a rival request can win the berth. */
  afterPreCheck?: (tx: Tx) => Promise<void>;
};

export type IssueResolution = "confirmed" | "edited" | "cancelled";

export const MIN_START_DATE = "1997-01-01";
export const MAX_SPAN_DAYS = 731;
export const MAX_VESSEL_LENGTH_FT = 1500;

export const isoDateField = (label: string) =>
  z.string({ error: `${label} is required.` }).refine(isISODate, { error: `${label} must be a real calendar date.` });

export const lengthFtField = z
  .number({ error: "Enter the length in whole feet." })
  .int({ error: "Enter the length in whole feet." })
  .min(1, { error: "A vessel's length must be at least 1 ft." })
  .max(MAX_VESSEL_LENGTH_FT, { error: `A vessel's length cannot be more than ${MAX_VESSEL_LENGTH_FT} ft.` });

/** Postgres text cannot hold a NUL byte; refuse it here with a sentence rather than as a database error. */
const noNul = (s: string) => !s.includes("\u0000");
const NUL_MESSAGE = { error: "That text contains a character that cannot be saved." };

export const versionField = z.number({ error: "The record version is missing. Reload and try again." }).int().min(1);
export const idField = (label: string) => z.string({ error: `${label} is required.` }).trim().min(1, { error: `${label} is required.` }).max(200).refine(noNul, NUL_MESSAGE);
export const notesField = z.string({ error: "Notes must be text." }).max(2000, { error: "Notes can be at most 2000 characters." }).refine(noNul, NUL_MESSAGE);
export const titleField = z.string({ error: "The title must be text." }).trim().max(200, { error: "The title can be at most 200 characters." }).refine(noNul, NUL_MESSAGE);

/** `a_` marks rows born in the app; legacy rows are `r_` + a hash of their source cells. */
export const newReservationId = (): string => "a_" + randomBytes(8).toString("hex");

export async function bumpMutations(tx: Tx): Promise<void> {
  await tx
    .insert(appMeta)
    .values({ id: true, mutationsSinceReset: 1 })
    .onConflictDoUpdate({ target: appMeta.id, set: { mutationsSinceReset: sql`${appMeta.mutationsSinceReset} + 1` } });
}

const openIssuesOf = (reservationId: string) => and(eq(issues.reservationId, reservationId), isNull(issues.resolvedAt));

/**
 * The importer attaches warnings to rows it was confident enough to confirm, so
 * a row's status says nothing about whether findings are still waiting on it.
 * Call with the reservation row locked, so the answer holds until the caller commits.
 */
export async function hasOpenReservationIssues(tx: Tx, reservationId: string): Promise<boolean> {
  const [open] = await tx.select({ id: issues.id }).from(issues).where(openIssuesOf(reservationId)).limit(1);
  return open !== undefined;
}

/** A reservation that was confirmed, edited or cancelled has been dealt with, so its import findings close with it. */
export async function resolveReservationIssues(tx: Tx, reservationId: string, resolution: IssueResolution): Promise<void> {
  await tx.update(issues).set({ resolvedAt: sql`now()`, resolution }).where(openIssuesOf(reservationId));
}

/**
 * Records a length a person has vouched for. Also closes the vessel's open
 * length_conflict findings: the disagreement in the old registry is settled the
 * moment someone states the real number, whichever screen they did it from.
 */
export async function applyVerifiedLength(tx: Tx, vessel: Pick<Vessel, "id" | "lengthFt" | "lengthStatus">, lengthFt: number): Promise<void> {
  const was = vessel.lengthFt === null ? `no length, ${vessel.lengthStatus}` : `${vessel.lengthFt} ft, ${vessel.lengthStatus}`;
  await tx
    .update(vessels)
    .set({
      lengthFt,
      lengthStatus: "verified",
      lengthEvidence: `Entered by a coordinator in the app (was: ${was})`,
      version: sql`${vessels.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(vessels.id, vessel.id));
  await tx
    .update(issues)
    .set({ resolvedAt: sql`now()`, resolution: "edited" })
    .where(and(eq(issues.vesselId, vessel.id), eq(issues.type, "length_conflict"), isNull(issues.resolvedAt)));
}

/**
 * Runs the one statement that can trip the exclusion constraint inside a
 * SAVEPOINT. A failed statement poisons a Postgres transaction; with the
 * savepoint only the write is undone, and the outer transaction can still look
 * up WHO won the race before it rolls back with a useful message.
 */
export async function lostRace(tx: Tx, write: (savepoint: Tx) => Promise<unknown>): Promise<boolean> {
  try {
    await tx.transaction(async (savepoint) => {
      await write(savepoint);
    });
    return false;
  } catch (error) {
    const code = pgErrorOf(error)?.code;
    // A deadlock between two colliding inserts is the same lost race, reported differently.
    if (code === EXCLUSION_VIOLATION || code === DEADLOCK_DETECTED) return true;
    throw error;
  }
}
