# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One **dock coordinator** in Marine Operations at a marine research facility. They own the waterfront schedule, plan weeks to months ahead, and work at a desk on a desktop monitor. Berth requests reach them by email or phone from captains, scientists and event organisers, who never log in themselves. The coordinator is fluent in the domain (berths, LOA, vessel type prefixes such as R/V and M/Y) and has used a colour-coded spreadsheet grid for this job for decades.

A secondary, temporary audience: reviewers of a take-home project who open the public URL cold and need to see within a couple of minutes that the system works and why it was built this way.

## Product Purpose

Harborview Dock Schedule manages reservations of six berths of different lengths. Vessels, non-vessel events (community sail days, tours) and closures (pier repair) each occupy a berth for an inclusive range of whole days.

It exists to remove two manual checks the spreadsheet forced on the coordinator:

1. **Double-bookings**, previously found by eyeballing a grid.
2. **Fit**, previously verified by hand: is the vessel longer than the berth it was given?

Success: a double-booking of a confirmed berth-day is impossible, a vessel that is too long cannot be booked, and the coordinator can answer "where can this vessel go on these dates?" in one step.

## Positioning

The guarantees are structural, not procedural. Double-booking is prevented by a database exclusion constraint, so no code path, race or future script can create one. The 23 years of legacy spreadsheet data are imported honestly: what could not be interpreted with certainty is counted, flagged and queued for a person to resolve, never silently guessed or dropped.

## Operating Context

- Source of truth before this system: an Excel workbook, one sheet per year (1997 to 2019), months as blocks, berths as rows, days as columns, bookings as coloured cell runs labelled with a vessel or event name. Vessel lengths lived in separate, messy contact sheets.
- The coordinator's mental model is that grid: berths down the side, days across the top, a month at a time.
- Whole-day granularity. One occupant per berth per day; a departure and an arrival on the same berth on the same day was never representable.
- The deployed instance is an open, shared demo with no sign-in and a "Reset demo data" action.

## Capabilities and Constraints

- Six berths: North Pier West 410 ft, North Pier Face 75 ft, North Pier East 240 ft, Inner Channel 55 ft, South Float West 90 ft, South Float East 90 ft.
- Reservation kinds: vessel, event, closure. Statuses: confirmed, needs review (unresolved legacy data), cancelled.
- Fit is length only (vessel LOA against berth length, whole feet). Beam, draft and rafting alongside are out of scope.
- A vessel's length is one of four states: verified, probable (registry name match under a different type prefix), conflict (the registry lists two lengths), unknown. Most legacy vessels are unknown. A vessel with no usable length cannot be booked until a length is entered.
- Imported data carries issues for review: genuine overlaps, unlabelled bookings, calendar defects in the source, ambiguous extents, conflicting registry lengths.
- Terminology to keep: berth, vessel, stay, LOA, needs review, closure. Type prefixes are written as in the source (R/V, M/V, M/Y, S/V, S/Y, F/V, OSV, Tug, Barge).
- Stack: Next.js on Vercel, Postgres on Neon. No authentication.

## Brand Commitments

- Name: **Harborview Dock Schedule** (facility: Harborview Marine Research Center, the synthetic name printed in the source workbook). No affiliation with, or branding of, any real institution.
- Voice: plain, specific, written for a working coordinator. Errors name the berth, the vessel, the dates and the number of feet. No jargon, no exclamation, no marketing tone.

## Evidence on Hand

- `data/source/Dock Schedule - Synthetic Sample.xlsx`: the synthetic 23-year legacy workbook.
- `data/seed/*.json`: the imported berths, vessels, reservations, issues and an import report with real counts.
- No logo, photography or brand assets exist. None should be invented as if official.
- No real customers, usage numbers or testimonials exist; none may be claimed.

## Product Principles

1. **Trustworthy and fast to scan wins every trade-off.** A calm, dense, familiar working tool. Nothing decorative.
2. **A conflict or a misfit is impossible to miss**, and never signalled by colour alone.
3. **Never invent certainty.** Unknown lengths, ambiguous legacy rows and probable matches are shown as what they are.
4. **Say exactly what is wrong and what to do.** Name the berth, the vessel, the dates, the feet.
5. **The grid is the home screen.** Respect the coordinator's existing mental model; improve it rather than replace it.

## Accessibility & Inclusion

Keyboard-operable throughout; status conveyed by shape, pattern or text as well as colour (colour-blind safe); WCAG AA contrast; respects reduced-motion preferences.
