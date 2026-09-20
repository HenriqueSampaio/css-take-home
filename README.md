# Harborview Dock Schedule

A berth reservation system for a marine research facility, built for the Columbia Software Solutions take-home (option 1, Dock Scheduling System).

The facility used to run its waterfront from a spreadsheet, and two checks were done by eye: is this berth already taken, and is this vessel too long for it. Here both are guarantees. A reservation is either valid and confirmed, or refused on the spot with the reason.

The system is **forward-only**: it starts with an empty schedule and books from today onwards. The sample workbook that came with the brief was used to learn how the dock works and which berths and vessels exist; none of its historical bookings are loaded.

## The rules, and where each one lives

| Rule | Where it lives | Why there |
|---|---|---|
| A berth has one confirmed occupant per day | A Postgres **exclusion constraint** (`drizzle/0001_constraints.sql`) | No code path, race or future script can create a double-booking. The app pre-checks so it can name who is in the way; SQLSTATE `23P01` is the race backstop. |
| A vessel must fit its berth | The service layer, inside the transaction, on **every** write path | Booking, moving a stay, changing a vessel's length and shrinking a berth are all refused if an upcoming stay would stop fitting. |
| Reservations start today or later | The service layer, using the facility's date (US Eastern) | A stay that has ended is history and cannot be changed; one already in progress can be extended but its start cannot move. |
| Berths are retired, never deleted | `berths.retired_at` | Their history stays intact. A berth with upcoming stays cannot be retired. |

Dates are whole days, inclusive at both ends (a stay ending on a day and another starting that day on the same berth collide), carried as `YYYY-MM-DD` strings from the database to the screen.

## Screens

- **Schedule**: the month grid, with stays as colour-coded chips (vessel, event, closure), a live "now" line at the actual time of day, and past days dimmed. Click a free day to reserve it; click a stay for its details.
- **Find a berth**: say what needs a berth and when; every berth is checked for being free and for fit, the ones that work come first, and you book with one click.
- **Berths**: add a berth, correct its name or length, retire or bring one back.
- **Vessels**: the registry. Every vessel has a length; add one or correct a length.

## Run it locally (no database setup)

```bash
npm install
npm run db:local        # PGlite (real Postgres, in memory) with migrations + the starting berths and vessels, on :5433
# in a second terminal
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres npm run dev
```

Against a real Postgres (Neon): put `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` in `.env.local`, then `npm run db:migrate && npm run db:seed`.

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Vitest: domain rules, services, queries and actions. Database tests run the real migrations on PGlite. |
| `npm run test:tz` | The same suite under three time zones (dates must never shift) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run db:migrate` / `npm run db:seed` | Apply migrations / load the starting berths and vessels |
| `npm run db:local` | The zero-setup local database described above |

## Layout

```
lib/domain/     pure rules: dates, inclusive ranges, fit, stay phase, vessel identity, berth classification, month layout
lib/seed/       the starting data contract and its validator
lib/db/         Drizzle schema and read queries
lib/services/   transactions and rules; every refusal is returned as a value with a sentence in it
lib/actions/    thin 'use server' wrappers around the services
app/, components/   server-rendered screens; the month and the selected stay live in the URL
data/seed/      six berths and 156 vessels (every vessel the sample lists with one unambiguous length)
data/source/    the sample workbook from the brief, kept for reference only
```

`PRODUCT.md` and `DESIGN.md` record the product decisions and the design system. An earlier version of this project imported the workbook's 23 years of bookings and had a review queue for what could not be read with certainty; it is preserved at the git tag `legacy-import-v1`. A calendar-style visual design was also tried and set aside; it is at the tag `calendar-design-v2`.

## Deployment

Vercel (CLI deploys) with Neon Postgres from the Vercel Marketplace. `GET /api/health` reports row counts and whether `btree_gist` and the exclusion constraint are present.

All data is synthetic. "Harborview Marine Research Center" is the placeholder name printed in the sample workbook; this project is not affiliated with any real institution.
