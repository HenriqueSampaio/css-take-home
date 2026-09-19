import { collapseWhitespace, parseVesselName, toDisplayCase, vesselIdFromKey } from "../domain/names";
import type { LengthStatus } from "../domain/fit";
import type { VesselSeed } from "../seed/contract";
import { a1, type SheetMatrix } from "./types";
import { indexRows, valueAt } from "./grid";

export const REGISTRY_SHEETS: readonly string[] = ["Science", "Yachts"];

/** `R/V Iron Skua 72'`: a name that ends in a length in feet. */
const VESSEL_ROW_RE = /^(.+?)\s+(\d+)'$/;
const LOA_RE = /LOA:\s*(\d+)\s*'/i;

/** Column A also holds contact details under each vessel; none of these can be a vessel row. */
const isContactJunk = (text: string): boolean =>
  text.toUpperCase() === "VESSEL" || /^(LOA:|Cell:|Capt\.|http)/i.test(text) || text.includes("@");

export type RegistryEntry = {
  sheet: string;
  /** e.g. `Yachts!A49` */
  ref: string;
  /** The cell text exactly as written (whitespace collapsed). */
  raw: string;
  prefix: string | null;
  name: string;
  nameKey: string;
  lengthFt: number;
  /** `LOA: N'` strings found anywhere in this vessel's block of rows. */
  loa: { ref: string; lengthFt: number }[];
};

export type RegistryParse = { entries: RegistryEntry[]; ignoredColumnA: number };

/**
 * Reads the two vessel lists. Only column A names a vessel; its block runs to
 * the row before the next vessel, and any `LOA: N'` string inside that block
 * is a second opinion on the length.
 */
export function parseRegistry(sheets: readonly SheetMatrix[]): RegistryParse {
  const entries: RegistryEntry[] = [];
  let ignoredColumnA = 0;
  for (const sheet of sheets) {
    if (!REGISTRY_SHEETS.includes(sheet.name)) continue;
    const index = indexRows(sheet);
    const lastRow = Math.max(0, ...index.keys());
    let current: RegistryEntry | null = null;
    for (let row = 1; row <= lastRow; row++) {
      const a = valueAt(sheet, row, 1);
      if (a !== null) {
        const text = collapseWhitespace(String(a));
        const m = isContactJunk(text) ? null : VESSEL_ROW_RE.exec(text);
        if (m) {
          const parsed = parseVesselName(m[1]);
          current = { sheet: sheet.name, ref: `${sheet.name}!${a1(row, 1)}`, raw: text, prefix: parsed.prefix, name: parsed.name, nameKey: parsed.nameKey, lengthFt: Number(m[2]), loa: [] };
          entries.push(current);
        } else {
          ignoredColumnA++;
        }
      }
      if (!current) continue;
      for (const col of index.get(row) ?? []) {
        const v = valueAt(sheet, row, col);
        const loa = typeof v === "string" ? LOA_RE.exec(v) : null;
        if (loa) current.loa.push({ ref: `${sheet.name}!${a1(row, col)}`, lengthFt: Number(loa[1]) });
      }
    }
  }
  return { entries, ignoredColumnA };
}

/** How one hull was written in the schedule: every raw form with its count. */
export type GridVessel = { nameKey: string; forms: Map<string, number> };

export type LinkedVessel = VesselSeed & { conflictDetail: string | null };

function mostFrequent<T>(counts: Map<T, number>, tieBreak: (a: T, b: T) => number): T | undefined {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || tieBreak(a[0], b[0]))[0]?.[0];
}

/**
 * Links schedule names to registry lengths by NAME (the type prefix is often
 * different between the two). One length and the same prefix is `verified`; one
 * length under another prefix is `probable`; two different lengths, or an LOA
 * note that contradicts the listed length, is a `conflict` and the importer
 * refuses to pick (lengthFt stays null, every candidate is listed).
 * Registry-only vessels are kept so the booking form knows their lengths.
 */
export function linkVessels(grid: readonly GridVessel[], registry: readonly RegistryEntry[]): LinkedVessel[] {
  const byKey = new Map<string, RegistryEntry[]>();
  for (const e of registry) {
    const list = byKey.get(e.nameKey);
    if (list) list.push(e);
    else byKey.set(e.nameKey, [e]);
  }

  const vessels: LinkedVessel[] = [];
  const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  const build = (nameKey: string, prefix: string | null, name: string, origin: "grid" | "registry"): LinkedVessel => {
    const entries = byKey.get(nameKey) ?? [];
    const listed = entries.map((e) => e.lengthFt);
    const loaNotes = entries.flatMap((e) => e.loa.filter((l) => l.lengthFt !== e.lengthFt));
    const candidates = [...new Set([...listed, ...loaNotes.map((l) => l.lengthFt)])].sort((a, b) => a - b);
    const cites = [...entries.map((e) => `${e.ref} ${e.raw}`), ...loaNotes.map((l) => `${l.ref} LOA: ${l.lengthFt}'`)].join("; ");

    let lengthStatus: LengthStatus = "unknown";
    let why = "";
    if (candidates.length > 1) {
      lengthStatus = "conflict";
      why = new Set(listed).size > 1 ? "registry lists different lengths for this name" : "an LOA note contradicts the listed length";
    } else if (entries.some((e) => e.prefix === prefix)) {
      lengthStatus = "verified";
      why = "prefix and name match";
    } else if (entries.length > 0) {
      lengthStatus = "probable";
      why = "name match, registry lists a different type prefix";
    }

    return {
      id: vesselIdFromKey(nameKey),
      name,
      nameKey,
      prefix,
      lengthFt: lengthStatus === "verified" || lengthStatus === "probable" ? candidates[0] : null,
      lengthStatus,
      lengthCandidates: candidates,
      lengthEvidence: entries.length === 0 ? null : `${cites} (${why})`,
      origin,
      conflictDetail: lengthStatus === "conflict" ? `${cites} (${why})` : null,
    };
  };

  const gridKeys = new Set<string>();
  for (const g of grid) {
    gridKeys.add(g.nameKey);
    const prefixes = new Map<string, number>();
    for (const [form, n] of g.forms) {
      const p = parseVesselName(form).prefix;
      if (p) prefixes.set(p, (prefixes.get(p) ?? 0) + n);
    }
    const form = mostFrequent(g.forms, text) as string;
    vessels.push(build(g.nameKey, mostFrequent(prefixes, text) ?? null, toDisplayCase(parseVesselName(form).name), "grid"));
  }
  for (const [nameKey, entries] of byKey) {
    if (gridKeys.has(nameKey)) continue;
    const prefixes = new Map<string, number>();
    for (const e of entries) if (e.prefix) prefixes.set(e.prefix, (prefixes.get(e.prefix) ?? 0) + 1);
    vessels.push(build(nameKey, mostFrequent(prefixes, text) ?? null, toDisplayCase(entries[0].name), "registry"));
  }
  return vessels.sort((a, b) => text(a.id, b.id));
}
