/**
 * Berth writes: the coordinator can add, edit, retire and restore berths.
 *
 * A berth is never deleted, because its history would go with it. It is
 * RETIRED: `retired_at` is set, it drops off the schedule and out of booking,
 * and its past stays stay on the record.
 *
 * The booking guarantees hold here too. A berth cannot be shortened under a
 * vessel that is still booked on it, and cannot be retired while any confirmed
 * stay on it has not ended. Stays that have ended are history and bind nothing.
 */
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { berthIdFromName, collapseWhitespace } from "../domain/names";
import { findOpenStays, toConflict } from "../db/queries/overlaps";
import { berths } from "../db/schema";
import type { Db, Tx } from "../db/types";
import { abort, runService } from "./errors";
import { berthLengthFtField, bumpMutations, idField, lockBerth, lockBerthList, misfitsAmong, NUL_MESSAGE, noNul, todayOf, versionField, type ServiceOptions } from "./internal";
import { berthRetireBlockedMessage, berthShrinkBlockedMessage, MESSAGES } from "./messages";
import { failure, invalid, ok, type ServiceResult } from "./result";

export type CreateBerthInput = { name: string; lengthFt: number };

export type UpdateBerthInput = {
  berthId: string;
  /** The `version` the form was loaded with. */
  version: number;
  name: string;
  lengthFt: number;
};

export type BerthRef = { berthId: string; version: number };

const berthNameField = z
  .string({ error: "Enter the berth's name." })
  .transform(collapseWhitespace)
  .pipe(
    z
      .string()
      .min(2, { error: "The berth's name needs at least 2 characters." })
      .max(60, { error: "The berth's name can be at most 60 characters." })
      // The id is a slug of the name, so a name of punctuation alone would have none.
      .refine((name) => /[a-z0-9]/i.test(name), { error: "The berth's name needs at least one letter or number." })
      .refine(noNul, NUL_MESSAGE),
  );

const createBerthSchema = z.object({ name: berthNameField, lengthFt: berthLengthFtField });
const updateBerthSchema = z.object({ berthId: idField("Berth"), version: versionField, name: berthNameField, lengthFt: berthLengthFtField });
const berthRefSchema = z.object({ berthId: idField("Berth"), version: versionField });

/**
 * One berth, one name: compared without case, and against retired berths too,
 * since restoring one would otherwise put two berths with the same name on the schedule.
 */
async function assertNameFree(tx: Tx, name: string, exceptId?: string): Promise<void> {
  const [taken] = await tx
    .select({ name: berths.name, retiredAt: berths.retiredAt })
    .from(berths)
    .where(and(sql`lower(${berths.name}) = lower(${name})`, exceptId ? ne(berths.id, exceptId) : undefined))
    .limit(1);
  if (taken) abort(invalid("name", MESSAGES.berthExists(taken.name, taken.retiredAt !== null)));
}

/**
 * The slug of the name, e.g. `north-pier-west`. It can already be taken by a berth that now goes by
 * another name (ids never change on rename) or whose name slugs the same ("Pier-A", "Pier A"): then -2, -3...
 */
async function freeBerthId(tx: Tx, name: string): Promise<string> {
  const base = berthIdFromName(name);
  const taken = new Set((await tx.select({ id: berths.id }).from(berths)).map((b) => b.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export function createBerth(db: Db, input: CreateBerthInput): Promise<ServiceResult<{ id: string }>> {
  return runService("createBerth", async () => {
    const parsed = createBerthSchema.parse(input);

    return db.transaction(async (tx) => {
      await lockBerthList(tx);
      await assertNameFree(tx, parsed.name);

      const id = await freeBerthId(tx, parsed.name);
      // A new berth goes to the end of the dock order, after retired ones too, so restoring one never collides.
      const [last] = await tx.select({ sortOrder: sql<number>`coalesce(max(${berths.sortOrder}), 0)`.mapWith(Number) }).from(berths);
      await tx.insert(berths).values({ id, name: parsed.name, lengthFt: parsed.lengthFt, sortOrder: (last?.sortOrder ?? 0) + 1 });

      await bumpMutations(tx);
      return ok({ id });
    });
  });
}

export function updateBerth(db: Db, input: UpdateBerthInput, opts?: ServiceOptions): Promise<ServiceResult<{ id: string; version: number }>> {
  return runService("updateBerth", async () => {
    const today = todayOf(opts);
    const parsed = updateBerthSchema.parse(input);

    return db.transaction(async (tx) => {
      await lockBerthList(tx);
      const berth = await lockBerth(tx, parsed.berthId, "update");
      if (berth.version !== parsed.version) abort(failure("STALE", MESSAGES.berthStale));
      await assertNameFree(tx, parsed.name, berth.id);

      // Every stay that has not ended fits the berth as it is, so only a SHORTER berth can break one.
      if (parsed.lengthFt < berth.lengthFt) {
        const misfits = misfitsAmong(await findOpenStays(tx, { berthId: berth.id, today }), { berthFt: parsed.lengthFt });
        if (misfits) {
          const message = berthShrinkBlockedMessage(berth.name, misfits.worst, misfits.fit, misfits.conflicts.length);
          abort(failure("TOO_LONG", message, { fieldErrors: { lengthFt: [message] }, conflicts: misfits.conflicts, fit: misfits.fit }));
        }
      }

      // The id stays as it is on a rename: reservations and links point at it.
      await tx
        .update(berths)
        .set({ name: parsed.name, lengthFt: parsed.lengthFt, version: sql`${berths.version} + 1`, updatedAt: sql`now()` })
        .where(eq(berths.id, berth.id));
      await bumpMutations(tx);
      return ok({ id: berth.id, version: berth.version + 1 });
    });
  });
}

export function retireBerth(db: Db, input: BerthRef, opts?: ServiceOptions): Promise<ServiceResult<{ id: string; version: number }>> {
  return runService("retireBerth", async () => {
    const today = todayOf(opts);
    const parsed = berthRefSchema.parse(input);

    return db.transaction(async (tx) => {
      await lockBerthList(tx);
      const berth = await lockBerth(tx, parsed.berthId, "update");
      // Idempotent, like cancelling a reservation: a double click finds it already retired.
      if (berth.retiredAt) return ok({ id: berth.id, version: berth.version });
      if (berth.version !== parsed.version) abort(failure("STALE", MESSAGES.berthStale));

      // A dock with no berths has nothing to schedule, and its stays would have nowhere to be moved to.
      const [other] = await tx.select({ id: berths.id }).from(berths).where(and(isNull(berths.retiredAt), ne(berths.id, berth.id))).limit(1);
      if (!other) abort(failure("INVALID_STATE", MESSAGES.lastActiveBerth(berth.name)));

      // Events and closures count too: they are confirmed stays, and retiring the berth would orphan them.
      const conflicts = (await findOpenStays(tx, { berthId: berth.id, today })).map(toConflict);
      if (conflicts.length > 0) abort(failure("CONFLICT", berthRetireBlockedMessage(berth.name, conflicts), { conflicts }));

      await tx.update(berths).set({ retiredAt: sql`now()`, version: sql`${berths.version} + 1`, updatedAt: sql`now()` }).where(eq(berths.id, berth.id));
      await bumpMutations(tx);
      return ok({ id: berth.id, version: berth.version + 1 });
    });
  });
}

/** retired -> in use again, at its old place in the dock order. Its cancelled stays stay cancelled; each can be restored on its own. */
export function restoreBerth(db: Db, input: BerthRef): Promise<ServiceResult<{ id: string; version: number }>> {
  return runService("restoreBerth", async () => {
    const parsed = berthRefSchema.parse(input);

    return db.transaction(async (tx) => {
      await lockBerthList(tx);
      const berth = await lockBerth(tx, parsed.berthId, "update");
      if (!berth.retiredAt) return ok({ id: berth.id, version: berth.version });
      if (berth.version !== parsed.version) abort(failure("STALE", MESSAGES.berthStale));

      await tx.update(berths).set({ retiredAt: null, version: sql`${berths.version} + 1`, updatedAt: sql`now()` }).where(eq(berths.id, berth.id));
      await bumpMutations(tx);
      return ok({ id: berth.id, version: berth.version + 1 });
    });
  });
}
