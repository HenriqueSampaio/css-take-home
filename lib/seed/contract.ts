/**
 * The starting data for a fresh database: the berths and the vessel registry.
 *
 * There are no reservations here on purpose. The system books from today onwards, so it
 * starts with an empty schedule. Both lists were taken from the sample workbook supplied
 * with the brief: the six berths and their lengths, and every vessel in its contact
 * sheets that is listed with a single, unambiguous length.
 */
export const SEED_SCHEMA_VERSION = 2;

export type BerthSeed = {
  /** Slug of the name, e.g. `north-pier-west`. */
  id: string;
  name: string;
  lengthFt: number;
  sortOrder: number;
};

export type VesselSeed = {
  /** `v_` + slug of `nameKey`. */
  id: string;
  /** Display name without its type prefix, e.g. `Far Horizon`. */
  name: string;
  /** Identity: uppercased name without prefix. Unique. */
  nameKey: string;
  /** `R/V`, `M/Y`, `Tug`... display only. */
  prefix: string | null;
  lengthFt: number;
};

export type Seed = { berths: BerthSeed[]; vessels: VesselSeed[] };
