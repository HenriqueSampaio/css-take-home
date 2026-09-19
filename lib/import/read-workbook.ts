import ExcelJS from "exceljs";
import { fillKey, type RawFill } from "./fills";
import { a1, cellKey, type CellRec, type MergeRange, type SheetMatrix } from "./types";

/**
 * The ONLY module that touches ExcelJS. It flattens the workbook into plain
 * `SheetMatrix` objects and neutralises three ExcelJS behaviours that would
 * otherwise corrupt the import:
 *
 * 1. Merge slaves echo their master's value -> every label would be counted once per merged day.
 *    We mask slaves to `v: null, fill: null` and record `slaveOf`.
 * 2. `eachCell()` skips cells that have a style but no value -> most of a booking's
 *    extent is exactly such fill-only cells. We iterate rows/columns explicitly.
 * 3. The `2002` sheet declares columns out to `IV`; nothing real lives past `AF`.
 *    Columns are capped (default 60).
 */
export type ReadOptions = { maxCol?: number };

const DEFAULT_MAX_COL = 60;

export async function readWorkbook(path: string, opts: ReadOptions = {}): Promise<SheetMatrix[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return wb.worksheets.map((ws) => toMatrix(ws, opts.maxCol ?? DEFAULT_MAX_COL));
}

function toMatrix(ws: ExcelJS.Worksheet, maxColCap: number): SheetMatrix {
  const merges = parseMerges(ws);
  const slaveOf = new Map<string, string>();
  for (const m of merges) {
    const master = a1(m.r1, m.c1);
    for (let r = m.r1; r <= m.r2; r++) {
      for (let c = m.c1; c <= m.c2; c++) {
        if (r !== m.r1 || c !== m.c1) slaveOf.set(cellKey(r, c), master);
      }
    }
  }

  const cells: Record<string, CellRec> = {};
  let maxRow = 0;
  let maxCol = 0;
  const lastCol = Math.min(ws.columnCount, maxColCap);

  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.findRow(r);
    if (!row) continue;
    for (let c = 1; c <= lastCol; c++) {
      const key = cellKey(r, c);
      const master = slaveOf.get(key);
      if (master) {
        cells[key] = { v: null, fill: null, slaveOf: master };
        continue;
      }
      const cell = row.findCell(c);
      if (!cell) continue;
      const rec = toCellRec(cell);
      if (rec.v === null && rec.formula === undefined && rec.fill === null) continue;
      cells[key] = rec;
      if (rec.v !== null || rec.formula !== undefined) {
        maxRow = Math.max(maxRow, r);
        maxCol = Math.max(maxCol, c);
      }
    }
  }

  return { name: ws.name, maxRow, maxCol, cells, merges };
}

function toCellRec(cell: ExcelJS.Cell): CellRec {
  const fill = fillKey(cell.fill as RawFill);
  const raw = cell.value as unknown;

  if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.formula === "string" || typeof obj.sharedFormula === "string") {
      const formula = (obj.formula ?? obj.sharedFormula) as string;
      return { v: scalar(obj.result), formula, fill };
    }
    if (Array.isArray(obj.richText)) {
      const text = (obj.richText as { text?: string }[]).map((t) => t.text ?? "").join("");
      return { v: text === "" ? null : text, fill };
    }
    if (raw instanceof Date) return { v: raw.toISOString(), fill };
    if (typeof obj.text === "string") return { v: obj.text, fill }; // hyperlink cells
    if (typeof obj.error === "string") return { v: null, fill };
  }
  return { v: scalar(raw), fill };
}

function scalar(v: unknown): string | number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") return v === "" ? null : v;
  if (typeof v === "boolean") return String(v);
  return null;
}

function parseMerges(ws: ExcelJS.Worksheet): MergeRange[] {
  const refs = ((ws.model as unknown as { merges?: string[] }).merges ?? []).slice().sort();
  return refs.map((ref) => {
    const [tl, br = tl] = ref.split(":");
    const a = decode(tl);
    const b = decode(br);
    return { r1: a.row, c1: a.col, r2: b.row, c2: b.col, ref };
  });
}

function decode(ref: string): { row: number; col: number } {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref);
  if (!m) throw new Error(`Unparseable cell ref in merge: ${ref}`);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]), col };
}
