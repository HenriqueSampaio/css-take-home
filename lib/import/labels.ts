import { collapseWhitespace, looksLikeVessel, parseVesselName, VESSEL_PREFIXES } from "../domain/names";

/**
 * Everything written in the schedule that is not a vessel name, as a CLOSED
 * vocabulary. It is hard-coded (not inferred) so the About page can show the
 * exact lists, and so any new wording is flagged for a person instead of
 * being silently guessed at. This module has no dependencies outside lib/domain.
 */
export const VOCAB = {
  /** Berth-blocking works: nobody can dock. */
  closures: [
    "Float rebuild - no usage permitted",
    "Pier repair - no docking",
    "Dock maintenance - restricted access",
    "Bollard replacement, west face",
    "Concrete work near test wells",
    "Ultrasonic pier test",
    "Utility work on pier face",
    "Paving near dock entrance",
    "Crane access - berth closed",
    "Wire spooling",
  ],
  /** The berth is in use, but not by a vessel. */
  events: [
    "Community sail day",
    "Campus event",
    "Student tour",
    "Science stroll",
    "Public open house",
    "Donor reception",
    "Film crew on dock",
    "Holiday",
    "Road race - access limited",
    "Rescue drill",
    "Safety training (RIBs)",
    "Dive training",
  ],
  /** Operational annotations. They describe a booking; they are never occupancy by themselves. */
  notes: [
    "ETA 1200",
    "ETD PM",
    "Arrives AM",
    "Arrival 1400",
    "Departs 0600",
    "Departure 0800",
    "Fueling",
    "Fueling @0800",
    "Bunkering",
    "Bunkering 1000",
    "Bunker barge",
    "Fuel truck",
    "Water/slops pumping",
    "Provisioning",
    "Load equipment",
    "Touch and go",
    "Delayed due to weather",
    "Emergency port call",
    "Returns from sea trials",
    "Dock inspection",
  ],
  vesselPrefixes: [...VESSEL_PREFIXES, "OS/V"],
} as const;

export type LabelClass =
  | { kind: "vessel"; text: string; prefix: string; name: string; nameKey: string }
  | { kind: "closure" | "event"; text: string; title: string; unknown: boolean }
  | { kind: "note"; text: string; note: string }
  | { kind: "junk"; text: string };

const fold = (s: string): string => collapseWhitespace(s).toLowerCase();

type VocabHit = { kind: "closure" | "event" | "note"; canonical: string };

const LOOKUP: ReadonlyMap<string, VocabHit> = new Map<string, VocabHit>([
  ...VOCAB.closures.map((t): [string, VocabHit] => [fold(t), { kind: "closure", canonical: t }]),
  ...VOCAB.events.map((t): [string, VocabHit] => [fold(t), { kind: "event", canonical: t }]),
  ...VOCAB.notes.map((t): [string, VocabHit] => [fold(t), { kind: "note", canonical: t }]),
]);

/**
 * Vessel prefix first, then the closed vocabulary (case-insensitive, whitespace
 * collapsed). A bare number is junk (stray times and day numbers typed into the
 * grid). Anything else is kept as an event and flagged `unknown`, never dropped.
 */
export function classifyLabel(raw: string | number): LabelClass {
  const text = collapseWhitespace(String(raw));
  if (typeof raw === "number" || /^\d+$/.test(text) || text === "") return { kind: "junk", text };
  if (looksLikeVessel(text)) {
    const parsed = parseVesselName(text);
    return { kind: "vessel", text, prefix: parsed.prefix as string, name: parsed.name, nameKey: parsed.nameKey };
  }
  const hit = LOOKUP.get(fold(text));
  if (!hit) return { kind: "event", text, title: text, unknown: true };
  if (hit.kind === "note") return { kind: "note", text, note: hit.canonical };
  return { kind: hit.kind, text, title: hit.canonical, unknown: false };
}

/** Labels that claim the berth (as opposed to notes and junk, which only annotate). */
export const isOccupantLabel = (label: LabelClass): label is Exclude<LabelClass, { kind: "note" | "junk" }> =>
  label.kind === "vessel" || label.kind === "closure" || label.kind === "event";
