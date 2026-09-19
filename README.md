# Harborview Dock Schedule

A berth reservation system for a marine research facility, built for the Columbia Software Solutions take-home (option 1, Dock Scheduling System).

The facility ran its waterfront from a spreadsheet for 23 years. Two checks were done by eye: is this berth already taken, and is this vessel too long for it. Here both are guarantees.

The full write-up of assumptions and decisions lives in the app itself, on the **About** page, because this repository is private.

## The two rules

| Rule | Where it lives | Why there |
|---|---|---|
| A berth has one confirmed occupant per day | A Postgres **exclusion constraint** (`drizzle/0001_constraints.sql`) | No code path, race or future script can create a double-booking. The app pre-checks so it can name who is in the way; SQLSTATE `23P01` is the race backstop. |
| A vessel must fit its berth | The service layer, inside the booking transaction | Legacy data legitimately breaks it and lengths get corrected. Misfits are computed at read time, never stored, so fixing one length re-scores that vessel's whole history. |

Dates are whole days, inclusive at both ends, carried as `YYYY-MM-DD` strings from the database to the screen.

## Run it locally (no database setup)

```bash
npm install
npm run db:local        # PGlite (real Postgres, in memory) with migrations + the imported archive, served on :5433
# in a second terminal
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres npm run dev
```

Against a real Postgres (Neon): put `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` in `.env.local`, then `npm run db:migrate && npm run db:seed`.

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Vitest: domain, importer, services and queries. Database tests run the real migrations on PGlite. |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run import` | Re-runs the legacy import: `data/source/*.xlsx` to `data/seed/*.json`. Deterministic: running it twice changes nothing. |
| `npm run import:parity` | Proves ExcelJS reads the workbook exactly as openpyxl (which generated it) does |
| `npm run db:migrate` / `npm run db:seed` | Apply migrations / load the committed seed |
| `npm run db:local` | The zero-setup local database described above |

## Layout

```
lib/domain/     pure rules: dates, inclusive ranges, fit, vessel identity, berth classification, timeline lanes
lib/import/     the one-time legacy import, as small pure stages (only read-workbook.ts touches ExcelJS)
lib/seed/       the contract between importer and app, and validateSeed() which mirrors the DB constraint
lib/db/         Drizzle schema, migrations' types, read queries
lib/services/   transactions and rules; every refusal is returned as a value with a sentence in it
lib/actions/    thin 'use server' wrappers around the services
app/, components/   server-rendered screens; the month and the selected stay live in the URL
data/source/    the synthetic legacy workbook      data/seed/   the committed import output
```

## The legacy import, in one paragraph

One sheet per year, months as blocks, berths as rows, days as columns, a stay as a run of coloured cells with a name somewhere inside it. The layout changed three times, early day numbers are uncached formulas, and from 2009 a stay is usually a merged range where only the first cell carries the colour. The importer dates each column from the number printed above it (validated against the real calendar), reads stays merge-first then by colour, stitches stays across month and year boundaries, links vessels to the messy length lists with an explicit confidence, and audits the result. Anything it cannot read with certainty is imported as `needs_review` with a finding attached, and **every text cell in the year sheets is accounted for exactly once or the import fails**. Numbers are on the About page and in `data/seed/import-report.json`.

## Deployment

Vercel (CLI deploys) with Neon Postgres from the Vercel Marketplace. `GET /api/health` reports row counts and whether `btree_gist` and the exclusion constraint are present.

All data is synthetic. "Harborview Marine Research Center" is the placeholder name printed in the sample workbook; this project is not affiliated with any real institution.
