import { berthIdFromName, parseVesselName, vesselIdFromKey } from "../domain/names";
import type { Seed } from "./contract";

/** Invariants the starting data must satisfy. Run in tests and by the seed script before it touches the database. */
export function validateSeed(seed: Seed): string[] {
  const errors: string[] = [];

  const berthIds = new Set<string>();
  const berthNames = new Set<string>();
  for (const b of seed.berths) {
    if (berthIds.has(b.id)) errors.push(`duplicate berth id ${b.id}`);
    berthIds.add(b.id);
    if (berthNames.has(b.name.toLowerCase())) errors.push(`duplicate berth name ${b.name}`);
    berthNames.add(b.name.toLowerCase());
    if (b.id !== berthIdFromName(b.name)) errors.push(`berth ${b.id}: id is not the slug of its name`);
    if (!(Number.isInteger(b.lengthFt) && b.lengthFt > 0 && b.lengthFt <= 2000)) errors.push(`berth ${b.id}: bad length ${b.lengthFt}`);
  }
  if (seed.berths.length === 0) errors.push("at least one berth is required");

  const vesselIds = new Set<string>();
  const nameKeys = new Set<string>();
  for (const v of seed.vessels) {
    if (vesselIds.has(v.id)) errors.push(`duplicate vessel id ${v.id}`);
    vesselIds.add(v.id);
    if (nameKeys.has(v.nameKey)) errors.push(`duplicate vessel nameKey ${v.nameKey}`);
    nameKeys.add(v.nameKey);
    if (v.nameKey !== parseVesselName(v.name).nameKey) errors.push(`vessel ${v.id}: nameKey does not match its name`);
    if (v.id !== vesselIdFromKey(v.nameKey)) errors.push(`vessel ${v.id}: id is not derived from its nameKey`);
    if (!(Number.isInteger(v.lengthFt) && v.lengthFt >= 1 && v.lengthFt <= 1500)) errors.push(`vessel ${v.id}: bad length ${v.lengthFt}`);
  }
  return errors;
}

export function assertValidSeed(seed: Seed): void {
  const errors = validateSeed(seed);
  if (errors.length > 0) throw new Error(`Seed failed validation (${errors.length}):\n  ${errors.slice(0, 25).join("\n  ")}`);
}
