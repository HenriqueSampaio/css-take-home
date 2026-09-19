/**
 * Vessel writes. A vessel's identity is its name without the type prefix,
 * case-folded (see lib/domain/names.ts), so "r/v golden compass" typed into a
 * form is the same hull as the legacy "R/V GOLDEN COMPASS".
 */
import { randomBytes } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { collapseWhitespace, displayVesselName, parseVesselName, toDisplayCase, vesselIdFromKey } from "../domain/names";
import { berths, reservations, vessels, type Vessel } from "../db/schema";
import type { Db, Tx } from "../db/types";
import { abort, runService } from "./errors";
import { applyVerifiedLength, bumpMutations, idField, lengthFtField, versionField } from "./internal";
import { MESSAGES } from "./messages";
import { failure, invalid, ok, type ServiceResult } from "./result";

export type NewVesselInput = { name: string; prefix?: string | null; lengthFt?: number | null };
export type CreateVesselInput = NewVesselInput;
export type SetVesselLengthInput = { vesselId: string; version: number; lengthFt: number };

export const vesselNameField = z
  .string({ error: "Enter the vessel's name." })
  .trim()
  .min(1, { error: "Enter the vessel's name." })
  .max(120, { error: "The vessel's name can be at most 120 characters." })
  .refine((name) => /[\p{L}\p{N}]/u.test(name), { error: "The vessel's name needs at least one letter or number." });

export const vesselPrefixField = z.string().trim().max(12, { error: "The prefix can be at most 12 characters, for example R/V or Tug." });

const createVesselSchema = z.object({
  name: vesselNameField,
  prefix: vesselPrefixField.nullish(),
  lengthFt: lengthFtField.nullish(),
});

const setVesselLengthSchema = z.object({
  vesselId: idField("Vessel"),
  version: versionField,
  lengthFt: lengthFtField,
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
  // toDisplayCase only re-cases ALL CAPS (the legacy grid's habit); typed-in all-lowercase names get the same courtesy.
  const singleCase = typed.name === typed.name.toLowerCase() ? typed.name.toUpperCase() : typed.name;
  return { name: toDisplayCase(singleCase), nameKey: typed.nameKey, prefix: explicit ?? typed.prefix };
}

export async function findVesselByKey(tx: Tx, nameKey: string): Promise<Vessel | null> {
  const [row] = await tx.select().from(vessels).where(eq(vessels.nameKey, nameKey)).limit(1).for("update");
  return row ?? null;
}

/**
 * Inserts a vessel, or returns the existing one when a concurrent request (or an
 * earlier import) already owns that name. `created` tells the caller which.
 */
export async function insertVessel(tx: Tx, identity: VesselIdentity, lengthFt: number | null): Promise<{ vessel: Vessel; created: boolean }> {
  // Two different names can slug to the same id ("SEA-FOX" and "SEA FOX"); the id only has to be unique, not pretty.
  let id = vesselIdFromKey(identity.nameKey);
  const [clash] = await tx.select({ id: vessels.id }).from(vessels).where(and(eq(vessels.id, id), ne(vessels.nameKey, identity.nameKey))).limit(1);
  if (clash || id === "v_") id = `${id}${id.endsWith("_") ? "" : "-"}${randomBytes(3).toString("hex")}`;

  const inserted = await tx
    .insert(vessels)
    .values({
      id,
      name: identity.name,
      nameKey: identity.nameKey,
      prefix: identity.prefix,
      lengthFt,
      lengthStatus: lengthFt === null ? "unknown" : "verified",
      lengthCandidates: lengthFt === null ? [] : [lengthFt],
      lengthEvidence: lengthFt === null ? null : "Entered by a coordinator in the app",
      origin: "app",
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return { vessel: inserted[0], created: true };

  const existing = await findVesselByKey(tx, identity.nameKey);
  if (!existing) throw new Error(`Vessel ${identity.nameKey} could be neither inserted nor found`);
  return { vessel: existing, created: false };
}

export function createVessel(db: Db, input: CreateVesselInput): Promise<ServiceResult<{ id: string }>> {
  return runService("createVessel", async () => {
    const parsed = createVesselSchema.parse(input);
    const identity = resolveVesselIdentity(parsed);

    return db.transaction(async (tx) => {
      const { vessel, created } = await insertVessel(tx, identity, parsed.lengthFt ?? null);
      if (!created) abort(invalid("name", MESSAGES.vesselExists(displayVesselName(vessel.prefix, vessel.name))));
      await bumpMutations(tx);
      return ok({ id: vessel.id });
    });
  });
}

/** This vessel's live bookings that are longer than their berth, for a given length. */
async function countMisfits(tx: Tx, vesselId: string, lengthFt: number | null): Promise<number> {
  if (lengthFt === null) return 0;
  const [row] = await tx
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(reservations)
    .innerJoin(berths, eq(berths.id, reservations.berthId))
    .where(and(eq(reservations.vesselId, vesselId), ne(reservations.status, "cancelled"), sql`${berths.lengthFt} < ${lengthFt}`));
  return row?.count ?? 0;
}

/**
 * Never blocks on fit. The length is a fact about the hull; if stating it turns
 * old bookings into misfits, that is information (returned as before/after
 * counts and a warning), not a reason to refuse the truth.
 */
export function setVesselLength(db: Db, input: SetVesselLengthInput): Promise<ServiceResult<{ misfitsBefore: number; misfitsAfter: number }>> {
  return runService("setVesselLength", async () => {
    const parsed = setVesselLengthSchema.parse(input);

    return db.transaction(async (tx) => {
      const [vessel] = await tx.select().from(vessels).where(eq(vessels.id, parsed.vesselId)).limit(1).for("update");
      if (!vessel) abort(failure("NOT_FOUND", MESSAGES.vesselGone));
      if (vessel.version !== parsed.version) abort(failure("STALE", MESSAGES.vesselStale));

      const misfitsBefore = await countMisfits(tx, vessel.id, vessel.lengthFt);
      await applyVerifiedLength(tx, vessel, parsed.lengthFt);
      const misfitsAfter = await countMisfits(tx, vessel.id, parsed.lengthFt);
      await bumpMutations(tx);

      const name = displayVesselName(vessel.prefix, vessel.name);
      const warning =
        misfitsAfter > 0
          ? `At ${parsed.lengthFt} ft, ${name} is too long for the berth in ${misfitsAfter} of its bookings. They are listed on the Review page under vessels too long for their berth.`
          : undefined;
      return ok({ misfitsBefore, misfitsAfter }, warning);
    });
  });
}
