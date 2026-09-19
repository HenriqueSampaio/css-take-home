/**
 * Vessel writes. A vessel's identity is its name without the type prefix,
 * case-folded (see lib/domain/names.ts), so "r/v golden compass" typed into a
 * form is the same hull as the registered "R/V Golden Compass".
 *
 * Every vessel has a length: it is required to register one, because a vessel
 * with no length could never be checked against a berth. And a length cannot
 * be changed out from under a booking: a vessel may not become longer than a
 * berth it is still booked on.
 */
import { randomBytes } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { collapseWhitespace, displayVesselName, parseVesselName, toDisplayCase, vesselIdFromKey } from "../domain/names";
import { findOpenStays } from "../db/queries/overlaps";
import { vessels, type Vessel } from "../db/schema";
import type { Db, Tx } from "../db/types";
import { abort, runService } from "./errors";
import { bumpMutations, idField, lockVessel, misfitsAmong, NUL_MESSAGE, noNul, todayOf, versionField, vesselLengthFtField, type ServiceOptions } from "./internal";
import { MESSAGES, vesselLengthBlockedMessage } from "./messages";
import { failure, invalid, ok, type ServiceResult } from "./result";

export type CreateVesselInput = { name: string; prefix?: string | null; lengthFt: number };

export type UpdateVesselInput = {
  vesselId: string;
  /** The `version` the form was loaded with. */
  version: number;
  lengthFt: number;
  /** Omitted keeps the current name. May carry a prefix ("R/V Tidewater"). */
  name?: string;
  /** Omitted keeps the current prefix; null or blank clears it. */
  prefix?: string | null;
};

export const vesselNameField = z
  .string({ error: "Enter the vessel's name." })
  .trim()
  .min(1, { error: "Enter the vessel's name." })
  .max(120, { error: "The vessel's name can be at most 120 characters." })
  .refine((name) => /[\p{L}\p{N}]/u.test(name), { error: "The vessel's name needs at least one letter or number." })
  .refine(noNul, NUL_MESSAGE);

export const vesselPrefixField = z.string().trim().max(12, { error: "The prefix can be at most 12 characters, for example R/V or Tug." }).refine(noNul, NUL_MESSAGE);

export const newVesselSchema = z.object({ name: vesselNameField, prefix: vesselPrefixField.nullish(), lengthFt: vesselLengthFtField });

const updateVesselSchema = z.object({
  vesselId: idField("Vessel"),
  version: versionField,
  lengthFt: vesselLengthFtField,
  name: vesselNameField.optional(),
  prefix: vesselPrefixField.nullish(),
});

export type VesselIdentity = { name: string; nameKey: string; prefix: string | null };

/**
 * The name field may already carry a prefix ("R/V Tidewater"), and a separate
 * prefix field may repeat or override it. An explicit prefix wins; known
 * spellings are canonicalised (OS/V -> OSV) and unknown ones are kept as typed.
 */
export function resolveVesselIdentity(input: { name: string; prefix?: string | null }): VesselIdentity {
  const typed = parseVesselName(input.name);
  const prefixText = collapseWhitespace(input.prefix ?? "");
  const explicit = prefixText ? (parseVesselName(`${prefixText} ${typed.name}`).prefix ?? prefixText) : null;
  // toDisplayCase only re-cases ALL CAPS (a common habit on dock paperwork); typed-in all-lowercase names get the same courtesy.
  const singleCase = typed.name === typed.name.toLowerCase() ? typed.name.toUpperCase() : typed.name;
  return { name: toDisplayCase(singleCase), nameKey: typed.nameKey, prefix: explicit ?? typed.prefix };
}

/** Share-locked: the caller is about to rely on this vessel's length (see lockBerth in ./internal). */
async function findVesselByKey(tx: Tx, nameKey: string): Promise<Vessel | null> {
  const [row] = await tx.select().from(vessels).where(eq(vessels.nameKey, nameKey)).limit(1).for("share");
  return row ?? null;
}

/**
 * Inserts a vessel, or returns the existing one when that name is already
 * registered (or a concurrent request registers it first). `created` tells the caller which.
 */
export async function insertVessel(tx: Tx, identity: VesselIdentity, lengthFt: number): Promise<{ vessel: Vessel; created: boolean }> {
  // Two different names can slug to the same id ("SEA-FOX" and "SEA FOX"); the id only has to be unique, not pretty.
  let id = vesselIdFromKey(identity.nameKey);
  const [clash] = await tx.select({ id: vessels.id }).from(vessels).where(and(eq(vessels.id, id), ne(vessels.nameKey, identity.nameKey))).limit(1);
  if (clash || id === "v_") id = `${id}${id.endsWith("_") ? "" : "-"}${randomBytes(3).toString("hex")}`;

  const inserted = await tx
    .insert(vessels)
    .values({ id, name: identity.name, nameKey: identity.nameKey, prefix: identity.prefix, lengthFt })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return { vessel: inserted[0], created: true };

  const existing = await findVesselByKey(tx, identity.nameKey);
  if (!existing) throw new Error(`Vessel ${identity.nameKey} could be neither inserted nor found`);
  return { vessel: existing, created: false };
}

const vesselExists = (existing: Vessel) => invalid("name", MESSAGES.vesselExists(existing.name, displayVesselName(existing.prefix, existing.name), existing.lengthFt));

export function createVessel(db: Db, input: CreateVesselInput): Promise<ServiceResult<{ id: string }>> {
  return runService("createVessel", async () => {
    const parsed = newVesselSchema.parse(input);
    const identity = resolveVesselIdentity(parsed);

    return db.transaction(async (tx) => {
      const { vessel, created } = await insertVessel(tx, identity, parsed.lengthFt);
      if (!created) abort(vesselExists(vessel));
      await bumpMutations(tx);
      return ok({ id: vessel.id });
    });
  });
}

export function updateVessel(db: Db, input: UpdateVesselInput, opts?: ServiceOptions): Promise<ServiceResult<{ id: string; version: number }>> {
  return runService("updateVessel", async () => {
    const today = todayOf(opts);
    const parsed = updateVesselSchema.parse(input);

    return db.transaction(async (tx) => {
      const vessel = await lockVessel(tx, parsed.vesselId, "update");
      if (vessel.version !== parsed.version) abort(failure("STALE", MESSAGES.vesselStale));

      // An omitted prefix keeps the one on file, unless the new name carries its own ("M/Y Far Horizon").
      const typedPrefix = parsed.name ? parseVesselName(parsed.name).prefix : null;
      const identity = resolveVesselIdentity({ name: parsed.name ?? vessel.name, prefix: parsed.prefix !== undefined ? parsed.prefix : (typedPrefix ?? vessel.prefix) });
      if (identity.nameKey !== vessel.nameKey) {
        const [taken] = await tx.select().from(vessels).where(eq(vessels.nameKey, identity.nameKey)).limit(1);
        if (taken) abort(vesselExists(taken));
      }

      // Every stay that has not ended fits at the current length, so only a LONGER length can break one.
      // Stays that have ended are history: they do not hold the vessel to the length it had then.
      if (parsed.lengthFt > vessel.lengthFt) {
        const misfits = misfitsAmong(await findOpenStays(tx, { vesselId: vessel.id, today }), { vesselFt: parsed.lengthFt });
        if (misfits) {
          const message = vesselLengthBlockedMessage(displayVesselName(vessel.prefix, vessel.name), misfits.worst, misfits.fit, misfits.conflicts.length);
          abort(failure("TOO_LONG", message, { fieldErrors: { lengthFt: [message] }, conflicts: misfits.conflicts, fit: misfits.fit }));
        }
      }

      // The id stays as it is on a rename: reservations point at it.
      await tx
        .update(vessels)
        .set({ name: identity.name, nameKey: identity.nameKey, prefix: identity.prefix, lengthFt: parsed.lengthFt, version: sql`${vessels.version} + 1`, updatedAt: sql`now()` })
        .where(eq(vessels.id, vessel.id));
      await bumpMutations(tx);
      return ok({ id: vessel.id, version: vessel.version + 1 });
    });
  });
}
