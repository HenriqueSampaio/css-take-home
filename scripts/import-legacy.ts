/**
 * Legacy import CLI: workbook in, five JSON seed files out.
 *
 *   npm run import            (or: npx tsx scripts/import-legacy.ts [workbook.xlsx])
 *
 * One-time, offline and deterministic: no timestamps, no network, and running it
 * twice gives byte-identical files. It refuses to write anything when the seed
 * breaks the contract or when the reconciliation ledger does not balance, so a
 * committed seed is always one that accounted for every cell.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { readWorkbook } from "../lib/import/read-workbook";
import { runImport } from "../lib/import/pipeline";
import { stableStringify } from "../lib/import/emit";
import { assertValidSeed } from "../lib/seed/validate";

const DEFAULT_WORKBOOK = "data/source/Dock Schedule - Synthetic Sample.xlsx";
const OUT_DIR = "data/seed";

async function main() {
  const workbookPath = resolve(process.argv[2] ?? DEFAULT_WORKBOOK);
  const sha256 = createHash("sha256").update(readFileSync(workbookPath)).digest("hex");
  // No column cap: the ledger can only vouch for cells it was shown (sheet 2002 declares columns out to IV).
  const sheets = await readWorkbook(workbookPath, { maxCol: Number.MAX_SAFE_INTEGER });
  const { seed, report } = runImport(sheets, { file: basename(workbookPath), sha256 });

  assertValidSeed(seed);
  const rec = report.reconciliation;
  if (!rec.balanced) {
    console.error(`RECONCILIATION FAILED: ${rec.labelCells} valued cells, ${rec.imported} imported + ${rec.asNotes} notes + ${rec.notImported} not imported`);
    if (rec.unaccounted.length) console.error(`  unaccounted (${rec.unaccounted.length}): ${rec.unaccounted.slice(0, 20).join(", ")}`);
    if (rec.doubleCounted.length) console.error(`  counted twice (${rec.doubleCounted.length}): ${rec.doubleCounted.slice(0, 20).join(", ")}`);
    process.exit(1);
  }

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const files: [string, unknown][] = [
    ["berths.json", seed.berths],
    ["vessels.json", seed.vessels],
    ["reservations.json", seed.reservations],
    ["issues.json", seed.issues],
    ["import-report.json", report],
  ];
  for (const [name, value] of files) writeFileSync(resolve(OUT_DIR, name), stableStringify(value));

  const r = report.imported.reservations;
  const line = (label: string, value: string | number) => console.log(`  ${label.padEnd(28)} ${value}`);
  console.log(`Imported ${basename(workbookPath)} (sha256 ${sha256.slice(0, 12)}...)`);
  line("month blocks", `${report.blocks.total} (${report.blocks.primary} primary, ${report.blocks.carryOver} carry-over, ${report.blocks.weekdayValidated} weekday-validated)`);
  line("runs", `${report.runs.total} (${report.runs.merges} merges, ${report.runs.fillRuns} fill runs of which ${report.runs.decorativeColourBars} in a decorative colour, ${report.runs.labelOnly} label-only)`);
  line("month-edge blobs", `${report.runs.edgeBlobs.count} (${report.runs.edgeBlobs.cells} cells, never occupancy; ${report.runs.edgeBlobs.touchingBar} touch a bar and raise a warning)`);
  line("cross-month joins", `${report.stitching.joins} (${report.stitching.crossSheet} across sheets; ${report.stitching.apartByEdgeBlob} pairs kept apart only by an edge blob)`);
  line("reservations", `${r.total} (${r.confirmed} confirmed, ${r.needsReview} needs review)`);
  line("by kind", Object.entries(r.byKind).map(([k, n]) => `${k} ${n}`).join(", "));
  line("date range", `${report.imported.dateRange.first} .. ${report.imported.dateRange.last}`);
  line("vessels", `${report.imported.vessels.fromGrid} from the grid + ${report.imported.vessels.registryOnly} registry-only`);
  line("length linking", `${report.vesselLinking.verified} verified, ${report.vesselLinking.probable} probable, ${report.vesselLinking.conflict} conflict, ${report.vesselLinking.unknown} unknown (${report.vesselLinking.bookingCoveragePct}% of vessel bookings covered)`);
  line("issues", Object.entries(report.issues.byType).map(([k, n]) => `${k} ${n}`).join(", "));
  line("overlapping pairs", report.issues.overlapPairs);
  line("fit violations (not stored)", `${report.fit.violations} of ${report.fit.resolvableReservations} checkable`);
  line("reconciliation", `${rec.labelCells} valued cells = ${rec.imported} imported + ${rec.asNotes} notes + ${rec.notImported} not imported (balanced)`);
  for (const [reason, n] of Object.entries(rec.notImportedByReason)) line(`    ${reason}`, n);
  console.log(`Wrote ${files.length} files to ${OUT_DIR}/`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
