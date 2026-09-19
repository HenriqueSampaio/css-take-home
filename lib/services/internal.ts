/**
 * Building blocks shared by the write services. Everything here runs INSIDE the
 * caller's transaction, so a booking, the vessel it registered and the mutation
 * counter all commit or roll back together.
 */
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { isISODate, todayIn, type ISODate } from "../domain/dates";
import { fitVerdict } from "../domain/fit";
import { toConflict, type OpenStay } from "../db/queries/overlaps";
import { appMeta, berths, vessels, type Berth, type Vessel } from "../db/schema";
import type { Tx } from "../db/types";
import { abort, DEADLOCK_DETECTED, EXCLUSION_VIOLATION, pgErrorOf, SERIALIZATION_FAILURE } from "./errors";
import { MESSAGES } from "./messages";
import { failure, type ConflictInfo, type FitFailure } from "./result";

/** Test-only hooks. Production callers never pass these. */
export type ServiceSeams = {
  /** Runs after the conflict pre-check and before the write: the window in which a rival request can win the berth. */
  afterPreCheck?: (tx: Tx) => Promise<void>;
};

export type ServiceOptions = ServiceSeams & {
  /** The facility's date. Defaults to todayIn() (America/New_York); tests pin it. */
  today?: ISODate;
};

export const todayOf = (opts: ServiceOptions | undefined): ISODate => opts?.today ?? todayIn();

export const MAX_SPAN_DAYS = 731;
export const MAX_VESSEL_LENGTH_FT = 1500;
export const MAX_BERTH_LENGTH_FT = 2000;

export const isoDateField = (label: string) =>
  z.string({ error: `${label} is required.` }).refine(isISODate, { error: `${label} must be a real calendar date.` });

const wholeFeet = { error: "Enter the length in whole feet." };

export const vesselLengthFtField = z
  .number(wholeFeet)
  .int(wholeFeet)
  .min(1, { error: "A vessel's length must be at least 1 ft." })
  .max(MAX_VESSEL_LENGTH_FT, { error: `A vessel's length cannot be more than ${MAX_VESSEL_LENGTH_FT} ft.` });

export const berthLengthFtField = z
  .number(wholeFeet)
  .int(wholeFeet)
  .min(1, { error: "A berth's length must be at least 1 ft." })
  .max(MAX_BERTH_LENGTH_FT, { error: `A berth's length cannot be more than ${MAX_BERTH_LENGTH_FT} ft.` });

/** Postgres text cannot hold a NUL byte; refuse it here with a sentence rather than as a database error. */
export const noNul = (s: string) => !s.includes("\u0000");
export const NUL_MESSAGE = { error: "That text contains a character that cannot be saved." };

export const versionField = z.number({ error: "The record version is missing. Reload and try again." }).int().min(1);
export const idField = (label: string) => z.string({ error: `${label} is required.` }).trim().min(1, { error: `${label} is required.` }).max(200).refine(noNul, NUL_MESSAGE);
export const notesField = z.string({ error: "Notes must be text." }).max(2000, { error: "Notes can be at most 2000 characters." }).refine(noNul, NUL_MESSAGE);
export const titleField = z.string({ error: "The title must be text." }).trim().max(200, { error: "The title can be at most 200 characters." }).refine(noNul, NUL_MESSAGE);

export const newReservationId = (): string => "r_" + randomBytes(8).toString("hex");

export async function bumpMutations(tx: Tx): Promise<void> {
  await tx
    .insert(appMeta)
    .values({ id: true, mutationsSinceReset: 1 })
    .onConflictDoUpdate({ target: appMeta.id, set: { mutationsSinceReset: sql`${appMeta.mutationsSinceReset} + 1` } });
}

/**
 * How the guarantees hold across write paths. A booking reads the berth and the
 * vessel it relies on under a SHARE lock; a change to a berth or a vessel takes
 * its row FOR UPDATE. The two cannot hold the same row at once, so a berth
 * cannot be shortened or retired, nor a vessel lengthened, between a booking's
 * checks and its insert. Bookings do not queue behind each other: share locks
 * are compatible, and the exclusion constraint settles who gets the days.
 */
export type RowLock = "share" | "update";

export async function lockBerth(tx: Tx, berthId: string, lock: RowLock): Promise<Berth> {
  const [berth] = await tx.select().from(berths).where(eq(berths.id, berthId)).limit(1).for(lock);
  if (!berth) abort(failure("NOT_FOUND", MESSAGES.berthGone, { fieldErrors: { berthId: [MESSAGES.berthGone] } }));
  return berth;
}

export async function lockVessel(tx: Tx, vesselId: string, lock: RowLock): Promise<Vessel> {
  const [vessel] = await tx.select().from(vessels).where(eq(vessels.id, vesselId)).limit(1).for(lock);
  if (!vessel) abort(failure("NOT_FOUND", MESSAGES.vesselGone, { fieldErrors: { vesselId: [MESSAGES.vesselGone] } }));
  return vessel;
}

/** Arbitrary but fixed. 7411 is the demo reset's; this one is the berth list's. */
const BERTH_LIST_LOCK_KEY = 7412;

/**
 * Berth writes are rare and depend on the whole list (a name nobody else has,
 * the next sort position, "is this the last berth in use"), which no row lock
 * covers. They queue on one advisory lock instead, held until commit.
 */
export async function lockBerthList(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${BERTH_LIST_LOCK_KEY}::bigint)`);
}

export type Misfits = { conflicts: ConflictInfo[]; worst: ConflictInfo; fit: FitFailure };

/**
 * "Would every stay that has not ended still fit?", asked of a vessel's new
 * length or a berth's new length: the same question from either side. Returns
 * the stays that would not, earliest first, and the worst of them (over by the
 * most; the earliest on a tie), which is the one the refusal leads with.
 */
export function misfitsAmong(stays: readonly OpenStay[], proposed: { vesselFt: number } | { berthFt: number }): Misfits | null {
  const conflicts: ConflictInfo[] = [];
  let worst: { stay: OpenStay; fit: FitFailure } | null = null;
  for (const stay of stays) {
    const vesselFt = "vesselFt" in proposed ? proposed.vesselFt : stay.vesselFt;
    if (vesselFt === null) continue; // events and closures have no length to check
    const verdict = fitVerdict(vesselFt, "berthFt" in proposed ? proposed.berthFt : stay.berthFt);
    if (verdict.kind !== "too_long") continue;
    conflicts.push(toConflict(stay));
    if (!worst || verdict.overByFt > worst.fit.overByFt) worst = { stay, fit: { vesselFt: verdict.vesselFt, berthFt: verdict.berthFt, overByFt: verdict.overByFt } };
  }
  return worst ? { conflicts, worst: toConflict(worst.stay), fit: worst.fit } : null;
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
    // A deadlock (or a serialization failure) between two colliding writes is the same lost race, reported differently.
    if (code === EXCLUSION_VIOLATION || code === DEADLOCK_DETECTED || code === SERIALIZATION_FAILURE) return true;
    throw error;
  }
}
