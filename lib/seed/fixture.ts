/**
 * A small, hand-written seed that satisfies the contract: the six real berths
 * and a handful of vessels chosen for their lengths. Tests seed it through
 * resetFromSeed(); `npm run db:seed -- --fixture` loads it for a quick local demo.
 *
 * Like the real seed it has no reservations. Tests book what they need through
 * the services, with `today` pinned, so every stay in a test got there the way
 * a coordinator's would.
 *
 * What is in here, so tests can rely on it:
 * - M/Y Far Horizon, 170 ft: fits only North Pier West (410 ft) and North Pier East (240 ft).
 * - M/V Silver Gull, 40 ft: fits everywhere, Inner Channel (55 ft) included.
 * - R/V Tidewater, 60 ft: fits everywhere except Inner Channel.
 * - OSV Amber Reef, 85 ft: fits the two 90 ft floats with 5 ft to spare, not North Pier Face (75 ft).
 */
import type { BerthSeed, Seed, VesselSeed } from "./contract";

const berths: BerthSeed[] = [
  { id: "north-pier-west", name: "North Pier West", lengthFt: 410, sortOrder: 1 },
  { id: "north-pier-face", name: "North Pier Face", lengthFt: 75, sortOrder: 2 },
  { id: "north-pier-east", name: "North Pier East", lengthFt: 240, sortOrder: 3 },
  { id: "inner-channel", name: "Inner Channel", lengthFt: 55, sortOrder: 4 },
  { id: "south-float-west", name: "South Float West", lengthFt: 90, sortOrder: 5 },
  { id: "south-float-east", name: "South Float East", lengthFt: 90, sortOrder: 6 },
];

const vessels: VesselSeed[] = [
  { id: "v_tidewater", name: "Tidewater", nameKey: "TIDEWATER", prefix: "R/V", lengthFt: 60 },
  { id: "v_far-horizon", name: "Far Horizon", nameKey: "FAR HORIZON", prefix: "M/Y", lengthFt: 170 },
  { id: "v_long-ketch", name: "Long Ketch", nameKey: "LONG KETCH", prefix: "S/V", lengthFt: 45 },
  { id: "v_iron-petrel", name: "Iron Petrel", nameKey: "IRON PETREL", prefix: "S/V", lengthFt: 135 },
  { id: "v_amber-reef", name: "Amber Reef", nameKey: "AMBER REEF", prefix: "OSV", lengthFt: 85 },
  { id: "v_golden-compass", name: "Golden Compass", nameKey: "GOLDEN COMPASS", prefix: "R/V", lengthFt: 72 },
  { id: "v_harbor-mule", name: "Harbor Mule", nameKey: "HARBOR MULE", prefix: "Tug", lengthFt: 48 },
  { id: "v_silver-gull", name: "Silver Gull", nameKey: "SILVER GULL", prefix: "M/V", lengthFt: 40 },
];

export const fixtureSeed: Seed = { berths, vessels };

/** A fresh deep copy, for tests that want to break a seed without affecting the others. */
export const cloneFixtureSeed = (): Seed => structuredClone(fixtureSeed);
