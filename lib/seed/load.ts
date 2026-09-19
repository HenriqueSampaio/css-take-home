/**
 * The committed seed, as the app sees it: the berths and the vessel registry.
 *
 * The JSON files are STATIC imports on purpose: the bundler inlines them into
 * the server function, so "Reset demo data" works on Vercel, where a runtime
 * `fs.readFile("data/seed/...")` would look for files that were never deployed.
 *
 * Their shape is the contract in ./contract.ts; the casts below go through
 * `unknown` because TypeScript would otherwise infer a huge literal type from
 * each file. `validateSeed()` is what actually holds them to the contract.
 */
import berthsJson from "../../data/seed/berths.json";
import vesselsJson from "../../data/seed/vessels.json";
import type { BerthSeed, Seed, VesselSeed } from "./contract";

export function loadSeed(): Seed {
  return { berths: berthsJson as unknown as BerthSeed[], vessels: vesselsJson as unknown as VesselSeed[] };
}
