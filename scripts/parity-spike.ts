/**
 * Parity spike: does ExcelJS read the legacy workbook the way openpyxl (the
 * library that generated it) does? `parity-reference.json` was produced by
 * `parity_reference.py`; this script recomputes the same invariants through
 * `readWorkbook()` and fails loudly on any difference.
 *
 *   npm run import:parity
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readWorkbook } from "../lib/import/read-workbook";
import type { SheetMatrix } from "../lib/import/types";

const WORKBOOK = resolve("data/source/Dock Schedule - Synthetic Sample.xlsx");
const REFERENCE = resolve("scripts/parity-reference.json");

type Probe = { v: string | number | null; formula: string | null; fill: string | null; slave: boolean };
type Invariants = {
  sheetNames: string[];
  merges: Record<string, number>;
  strings: Record<string, number>;
  formulas: Record<string, number>;
  ints: Record<string, number>;
  solidFills: Record<string, number>;
  fillKeyCounts: Record<string, number>;
  probes: Record<string, Probe>;
};

function decodeA1(ref: string): string {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return `${m[2]},${col}`;
}

function compute(sheets: SheetMatrix[], probeRefs: string[]): Invariants {
  const inv: Invariants = { sheetNames: sheets.map((s) => s.name), merges: {}, strings: {}, formulas: {}, ints: {}, solidFills: {}, fillKeyCounts: {}, probes: {} };
  for (const s of sheets) {
    let str = 0, fml = 0, num = 0, filled = 0;
    for (const cell of Object.values(s.cells)) {
      if (cell.slaveOf) continue;
      if (cell.formula !== undefined) fml++;
      else if (typeof cell.v === "string") str++;
      else if (typeof cell.v === "number") num++;
      if (cell.fill !== null) {
        filled++;
        if (/^\d+$/.test(s.name)) inv.fillKeyCounts[cell.fill] = (inv.fillKeyCounts[cell.fill] ?? 0) + 1;
      }
    }
    inv.merges[s.name] = s.merges.length;
    inv.strings[s.name] = str;
    inv.formulas[s.name] = fml;
    inv.ints[s.name] = num;
    inv.solidFills[s.name] = filled;
  }
  for (const ref of probeRefs) {
    const [sheetName, cellRef] = ref.split("!");
    const cell = sheets.find((s) => s.name === sheetName)?.cells[decodeA1(cellRef)];
    inv.probes[ref] = cell
      ? { v: cell.formula !== undefined ? null : cell.v, formula: cell.formula ?? null, fill: cell.fill, slave: Boolean(cell.slaveOf) }
      : { v: null, formula: null, fill: null, slave: false };
  }
  return inv;
}

function diff(path: string, expected: unknown, actual: unknown, out: string[]): void {
  if (expected !== null && typeof expected === "object" && actual !== null && typeof actual === "object" && !Array.isArray(expected)) {
    const keys = new Set([...Object.keys(expected as object), ...Object.keys(actual as object)]);
    for (const k of [...keys].sort()) diff(`${path}.${k}`, (expected as Record<string, unknown>)[k], (actual as Record<string, unknown>)[k], out);
    return;
  }
  if (JSON.stringify(expected) !== JSON.stringify(actual)) out.push(`${path}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
}

async function main() {
  const reference = JSON.parse(readFileSync(REFERENCE, "utf8")) as Invariants;
  const started = performance.now();
  const sheets = await readWorkbook(WORKBOOK, { maxCol: Number.MAX_SAFE_INTEGER });
  const ms = Math.round(performance.now() - started);
  const actual = compute(sheets, Object.keys(reference.probes));

  const problems: string[] = [];
  diff("", reference, actual, problems);

  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  console.log(`read ${sheets.length} sheets in ${ms} ms`);
  console.log(`strings ${sum(actual.strings)} | formulas ${sum(actual.formulas)} | numbers ${sum(actual.ints)} | solid fills ${sum(actual.solidFills)} | year-sheet fill keys ${Object.keys(actual.fillKeyCounts).length}`);
  if (problems.length) {
    console.error(`\nPARITY FAILED: ${problems.length} difference(s)`);
    for (const p of problems.slice(0, 40)) console.error("  " + p);
    if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
    process.exit(1);
  }
  console.log("PARITY OK: ExcelJS matches the openpyxl reference on every invariant");
}

main().catch((e) => { console.error(e); process.exit(1); });
