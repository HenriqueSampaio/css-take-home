# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One **dock coordinator** in Marine Operations at a marine research facility. They own the waterfront schedule, plan weeks to months ahead, and work at a desk on a desktop monitor. Berth requests reach them by email or phone from captains, scientists and event organisers, who never log in themselves. They are fluent in the domain (berths, vessel length, type prefixes such as R/V and M/Y).

A secondary, temporary audience: reviewers of a take-home project who open the public URL cold and should understand the product within seconds.

## Product Purpose

Harborview Dock Schedule manages reservations of the facility's berths, which have different lengths. Vessels, non-vessel events (community sail days, tours) and closures (pier repair) each occupy a berth for an inclusive range of whole days.

It removes two manual checks the old spreadsheet forced on the coordinator:

1. **Double-bookings**, previously found by eyeballing a grid.
2. **Fit**, previously verified by hand: is the vessel longer than the berth it was given?

Success: a double-booking is impossible, a vessel that is too long cannot be booked, and "where can this vessel go on these dates?" is answered in one step. A reservation is either valid and confirmed, or refused on the spot with the reason. Nothing waits in a review queue.

## Positioning

The guarantees are structural, not procedural. Double-booking is prevented by a database exclusion constraint, so no code path, race or future script can create one. The fit rule holds on every write path, not only booking: a vessel's length or a berth's length cannot be changed in a way that would break an upcoming stay.

## Operating Context

- **Forward-only.** The system books from today onwards and starts with an empty schedule. The sample workbook supplied with the brief was used only to learn how the dock works and which berths and vessels exist; none of its historical bookings are loaded.
- The system knows the facility's current date and time (US Eastern) and shows it. A reservation cannot start before today; a stay that has ended is history and cannot be changed.
- The coordinator's mental model is a month grid: berths down the side, days across the top.
- Whole-day granularity. One occupant per berth per day; a stay ending on a day and another starting that same day on the same berth collide.
- The deployed instance is an open, shared demo with no sign-in and a quiet "Reset demo data" action.

## Capabilities and Constraints

- Starting berths: North Pier West 410 ft, North Pier Face 75 ft, North Pier East 240 ft, Inner Channel 55 ft, South Float West 90 ft, South Float East 90 ft. The coordinator can add a berth, correct its name or length, and retire one that is no longer used.
- Reservation kinds: vessel, event, closure. Statuses: confirmed, cancelled (a cancelled stay can be restored if its days are still free).
- Fit is length only (vessel length against berth length, whole feet). Beam, draft and rafting alongside are out of scope.
- Every vessel has a length; registering a vessel requires one. The starting registry is the 156 vessels the sample lists with a single unambiguous length.
- Terminology: berth, vessel, stay, reservation, closure, retired (berth). Type prefixes as written in the trade (R/V, M/V, M/Y, S/V, S/Y, F/V, OSV, Tug, Barge).
- Stack: Next.js on Vercel, Postgres on Neon. No authentication.

## Brand Commitments

- Name: **Harborview Dock Schedule** (facility: Harborview Marine Research Center, the placeholder name printed in the sample workbook). No affiliation with, or branding of, any real institution.
- **Look: the Berthing Plan.** The interface is drawn like a marine engineer's berthing plan: a title-block header, ink-bordered sheets, berth lengths drawn to scale, fill patterns for what occupies a berth, Barlow type. The owner tried a light, colourful calendar-style replacement and chose to come back to this look, keeping three things from that round as standing preferences: purposeful animation, bold type on the facts that matter, and less on screen at once. (The calendar version is preserved at git tag `calendar-design-v2`.)
- Voice: plain, specific, friendly without being chatty. Refusals name the berth, the vessel, the dates and the number of feet. No jargon, no exclamation marks, no marketing tone.

## Evidence on Hand

- `data/source/Dock Schedule - Synthetic Sample.xlsx`: the sample workbook from the brief (reference only).
- `data/seed/berths.json`, `data/seed/vessels.json`: the starting berths and vessel registry.
- No logo, photography or brand assets exist. None should be invented as if official.
- No real customers, usage numbers or testimonials exist; none may be claimed.

## Product Principles

1. **Glanceable first.** One thing per screen is obvious at a glance; the rest is one click away. When in doubt, show less.
2. **Bold what matters.** Names, dates, numbers and verdicts carry weight; everything else recedes.
3. **A refusal is a sentence, not a colour.** Say exactly what is in the way and what to do. Status is never carried by colour alone.
4. **The month grid is home.** Berths down the side, days across the top, as the coordinator has always read it.
5. **Motion explains.** Animation shows where something came from, what changed, or that the system heard you. Never decoration, never a wait.

## Accessibility & Inclusion

Keyboard-operable throughout; status conveyed by shape, icon or text as well as colour; WCAG AA contrast; reduced-motion preferences fully respected.
