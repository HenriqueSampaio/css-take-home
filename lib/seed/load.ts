/**
 * The committed seed, as the app sees it.
 *
 * The JSON files are STATIC imports on purpose: the bundler inlines them into
 * the server function, so "Reset demo data" works on Vercel, where a runtime
 * `fs.readFile("data/seed/...")` would look for files that were never deployed.
 *
 * The files are written by `npm run import`. Their shape is the contract in
 * ./contract.ts; the casts below go through `unknown` because TypeScript would
 * otherwise infer a (huge, and for empty placeholder arrays useless) literal
 * type from each file. `validateSeed()` is what actually holds them to the contract.
 */
import berthsJson from "../../data/seed/berths.json";
import importReportJson from "../../data/seed/import-report.json";
import issuesJson from "../../data/seed/issues.json";
import reservationsJson from "../../data/seed/reservations.json";
import vesselsJson from "../../data/seed/vessels.json";
import type { BerthSeed, IssueSeed, ReservationSeed, Seed, VesselSeed } from "./contract";

export function loadSeed(): Seed {
  return {
    berths: berthsJson as unknown as BerthSeed[],
    vessels: vesselsJson as unknown as VesselSeed[],
    reservations: reservationsJson as unknown as ReservationSeed[],
    issues: issuesJson as unknown as IssueSeed[],
  };
}

/**
 * What the importer found and decided, for the About / data-quality pages. Typed
 * loosely here: the importer owns the precise shape (lib/import/report.ts), and
 * this module must not depend on the import pipeline.
 */
export type ImportReport = Record<string, unknown>;

export const importReport: ImportReport = importReportJson as unknown as ImportReport;

export const loadImportReport = (): ImportReport => importReport;
