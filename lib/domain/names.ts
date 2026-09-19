/**
 * Vessel naming. The same hull gets written as `S/V IRON PETREL`, `S/V Iron Petrel`
 * and `M/Y Iron Petrel`, so identity is the NAME without its type prefix, case-folded.
 * The prefix is kept for display only. This is what stops a coordinator registering
 * the same vessel twice under two spellings.
 */
const PREFIXES = ["R/V", "M/V", "M/Y", "S/V", "S/Y", "F/V", "OS/V", "OSV", "TUG", "BARGE"] as const;

/** How each prefix is displayed. `OS/V` is a spelling variant of `OSV`. */
const CANONICAL: Record<string, string> = {
  "R/V": "R/V", "M/V": "M/V", "M/Y": "M/Y", "S/V": "S/V", "S/Y": "S/Y", "F/V": "F/V",
  "OS/V": "OSV", OSV: "OSV", TUG: "Tug", BARGE: "Barge",
};

export const VESSEL_PREFIXES: readonly string[] = [...new Set(Object.values(CANONICAL))];

export type ParsedVesselName = {
  /** Canonical prefix, or null when the text has none. */
  prefix: string | null;
  /** Name without the prefix, whitespace collapsed, original casing. */
  name: string;
  /** Identity key: uppercased `name`. */
  nameKey: string;
};

export const collapseWhitespace = (s: string): string => s.replace(/\s+/g, " ").trim();

export function parseVesselName(raw: string): ParsedVesselName {
  const text = collapseWhitespace(raw);
  const upper = text.toUpperCase();
  for (const prefix of PREFIXES) {
    if (upper.startsWith(prefix + " ") && text.length > prefix.length + 1) {
      const name = text.slice(prefix.length + 1).trim();
      return { prefix: CANONICAL[prefix], name, nameKey: name.toUpperCase() };
    }
  }
  return { prefix: null, name: text, nameKey: upper };
}

/** True when the text starts with a recognised vessel-type prefix followed by a name. */
export const looksLikeVessel = (raw: string): boolean => parseVesselName(raw).prefix !== null;

/** `GOLDEN COMPASS` -> `Golden Compass`; leaves mixed-case input alone. */
export function toDisplayCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase());
}

export const displayVesselName = (prefix: string | null, name: string): string => (prefix ? `${prefix} ${name}` : name);

/** Stable vessel id derived from its identity key: `GOLDEN COMPASS` -> `v_golden-compass`. */
export const vesselIdFromKey = (nameKey: string): string =>
  "v_" + nameKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Stable berth id from its name: `North Pier West` -> `north-pier-west`. */
export const berthIdFromName = (name: string): string =>
  collapseWhitespace(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
