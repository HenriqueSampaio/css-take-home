---
name: Harborview Dock Schedule
description: A light, colourful, calendar-style berth scheduler with purposeful motion.
colors:
  canvas: "#F5F6F8"
  surface: "#FFFFFF"
  fill: "#EEF1F5"
  line: "#E4E7EC"
  line-strong: "#CDD3DC"
  control: "#7C8798"
  ink: "#0F172A"
  ink-2: "#475569"
  ink-3: "#5B6678"
  brand: "#2563EB"
  brand-deep: "#1D4ED8"
  brand-tint: "#EAF1FF"
  vessel: "#2563EB"
  event: "#7C3AED"
  event-tint: "#F1EAFE"
  closure: "#F59E0B"
  closure-tint: "#FEF3C7"
  closure-ink: "#92400E"
  ok: "#15803D"
  ok-tint: "#DCFCE7"
  danger: "#DC2626"
  danger-ink: "#B91C1C"
  danger-tint: "#FEE2E2"
  warn-ink: "#9A4A06"
  warn-tint: "#FEF3C7"
  now: "#E11D48"
typography:
  display:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  lead:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.35
  label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  small:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
  micro:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  inner: "4px"
  chip: "6px"
  small: "8px"
  control: "10px"
  panel: "12px"
  surface: "16px"
  drawer: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.brand-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    height: "40px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  stay-vessel:
    backgroundColor: "{colors.vessel}"
    textColor: "{colors.surface}"
    rounded: "{rounded.chip}"
  stay-event:
    backgroundColor: "{colors.event}"
    textColor: "{colors.surface}"
    rounded: "{rounded.chip}"
  stay-closure:
    backgroundColor: "{colors.closure-tint}"
    textColor: "{colors.closure-ink}"
    rounded: "{rounded.chip}"
---

# Design System: Harborview Dock Schedule

## Overview

**Creative North Star: "The Calendar You Already Know"**

This is the modern calendar, played straight. The owner rejected an earlier engineering-drawing look as legacy-feeling and too dense, and chose an interface that sits alongside Notion Calendar and Google Calendar. Their craft level is the bar: a white month grid on a soft grey canvas, reservations as rounded, solidly coloured chips, one confident blue for actions, bold type for the things that matter and quiet grey for everything else.

The second commitment is restraint of content, not of colour. Each screen makes one thing obvious at a glance and keeps the rest one click away: the schedule shows stays, not their paperwork; the berth finder leads with the berths that work and folds away the ones that do not.

Motion is part of the material. The schedule arrives (stays grow along the timeline from their first day), the month slides the way you travelled, a live "now" line sits in today's column at the actual time of day, and the drawer, the results and a freshly booked stay each move in a way that says where they came from.

**Key Characteristics:**
- Light, airy, rounded. White surfaces on a soft grey canvas, hairline borders, soft shadows only on things that float.
- Colour carries category: blue vessels, violet events, striped amber closures. One blue for actions.
- Bold what matters: names, dates, numbers, verdicts. Everything else is regular weight in grey.
- One idea per screen; detail on demand.
- Motion explains cause, place and change. 150 to 450ms, ease-out, never a wait.

## Colors

A full-palette strategy with named roles. Category colour fills whole chips rather than dotting a neutral page.

### Primary
- **Harbor Blue** (`brand`): primary buttons, links, the current nav item, focus rings, today's date bubble. `brand-deep` on hover and press; `brand-tint` for selected and hovered surfaces. It is also the vessel colour, on purpose: vessels are the main thing this product books.

### Secondary
- **Event Violet** (`event`, wash `event-tint`): non-vessel events such as a community sail day.

### Tertiary
- **Closure Amber** (`closure`, wash `closure-tint`, text `closure-ink`): a berth taken out of service. Always drawn with diagonal stripes as well.
- **Now Rose** (`now`): the live current-time line and its dot. Nothing else.

### Neutral
- **Canvas** (`canvas`): the page. **Surface** (`surface`): cards, the grid, inputs, the top bar. **Fill** (`fill`): hovers, weekend columns, quiet chips.
- **Ink** (`ink`) for anything bold or primary; **Ink 2** (`ink-2`) for body and secondary text; **Ink 3** (`ink-3`) for captions and hints. All hold 4.5:1 on every neutral.
- **Line** (`line`) for hairlines; **Line Strong** (`line-strong`) for dividers that must read; **Control** (`control`) for input and button outlines (3:1 on both neutrals).

### Semantic
- **OK** (`ok`, wash `ok-tint`): a berth that fits and is free; a saved change.
- **Danger** (`danger`, text `danger-ink`, wash `danger-tint`): a refusal, a destructive action.
- **Warn** (`warn-ink` on `warn-tint`): something to double-check.

### Named Rules
**The Never Colour Alone Rule.** Every category and status also has an icon, a pattern or a word. Closures are striped, events carry a flag icon, verdicts are written out.

**The One Blue Rule.** Harbor Blue is the only colour that means "you can act here". Violet, amber and rose never appear on a control.

## Typography

**UI Font:** Figtree (with system-ui)

**Character:** One friendly geometric sans with real weight range. Hierarchy comes from weight and size, not from capitals or a second face: 800 for the month and page titles, 700 for names and numbers, 400 to 500 in grey for the rest.

### Hierarchy
- **Display** (800, 1.875rem, -0.02em): the month on the schedule; page titles.
- **Heading** (700, 1.25rem): drawer title, section headings.
- **Title** (700, 1rem): row names (a berth, a vessel), card headings.
- **Lead** (700, 1.0625rem): the facts a screen exists to show: the dates in the drawer, a berth's length, the counts in the today line.
- **Body** (400, 0.9375rem, 1.5): forms, descriptions.
- **Label** (600, 0.875rem): buttons, notices, links in running text, sub-headings inside a panel.
- **Small** (500, 0.8125rem): stay chips, table cells, hints, secondary lines.
- **Micro** (600, 0.75rem): pills, weekday letters, counts.

### Named Rules
**The Bold Rule.** On any row, exactly the facts a coordinator scans for are bold (the name, the date, the number of feet, the verdict). If everything is bold, nothing is.

**The Sentence Case Rule.** No uppercase tracked labels anywhere. Labels are sentence case, medium weight, grey.

## Layout

A sticky white top bar (brand, three destinations, the live date and time, one primary action) over a soft grey canvas. Content sits in white rounded surfaces with generous padding. The schedule uses the full width up to 100rem; every other page is capped at 64rem. Spacing runs on a 4px base with generous separation: 24 to 32px between regions, 12 to 16px inside them.

Detail never pushes the page around. A selected reservation opens in a drawer that slides over the right edge (a bottom sheet on phones); unavailable berths fold behind a disclosure; notes and secondary fields appear on request.

Responsive behaviour is structural: under 64rem the schedule scrolls sideways inside its surface with the berth column pinned; two-column pages stack; the top bar keeps brand, clock and primary action and moves the destinations to a second row.

## Elevation & Depth

Mostly flat: surfaces are separated from the canvas by a hairline and a whisper of shadow. Real elevation is reserved for things that float over content.

### Shadow Vocabulary
- **Surface** (`0 1px 2px rgb(15 23 42 / 0.04), 0 1px 1px rgb(15 23 42 / 0.03)`): cards and the grid at rest.
- **Lift** (`0 6px 16px -4px rgb(15 23 42 / 0.16)`): a stay chip or row under the pointer.
- **Float** (`0 24px 48px -12px rgb(15 23 42 / 0.24), 0 0 0 1px rgb(15 23 42 / 0.05)`): the drawer, popover lists, the toast.

## Shapes

Rounded and soft, on one scale: 4px for marks inside a chip and the focus ring; 6px stay chips; 8px small buttons and the inner segments of a segmented control; 10px buttons and inputs; 12px notices and inset panels; 16px cards and the grid; 20px the drawer; status pills fully round. Borders are 1px hairlines. Focus is a 2px Harbor Blue ring offset by 2px, never removed.

## Components

### Buttons
40px tall, 10px radius, 600 weight. **Primary:** Harbor Blue, white text, one per view. **Secondary:** white with a control outline. **Ghost:** no outline, grey text, fill on hover. **Danger:** white with danger text and outline; fills danger on press. Hover deepens over 150ms; press scales to 0.98; disabled drops to 50% opacity; pending swaps the label for its gerund.

### Inputs / Fields
40px, 10px radius, control outline, sentence-case label above in small medium-weight grey. Focus: Harbor Blue outline plus ring. Error: danger outline and a sentence beneath that names the fix.

### Navigation
Pill links in the top bar. Current: brand-tint fill, brand-deep text, 600. Others: ink-2, fill on hover.

### Stay Chip (signature)
A reservation on the grid: a 28px rounded chip, solidly coloured by kind, 600-weight white label. Closures are amber-tinted with diagonal stripes and dark text. Cancelled: outline only, struck through. A stay continuing past the month edge is squared off on that side. Hover lifts it; the selected chip wears a ring. On load each chip grows from its first day.

### Now Line (signature)
A rose vertical line with a dot, placed inside today's column at the fraction of the day that has passed, updated every minute. Today's date sits in a filled blue bubble; days before today are dimmed and cannot be booked.

### Berth Result Row (signature)
In Find a berth: the berth name and length in bold, a verdict pill (Fits and free / Too short / Occupied), a to-scale fit bar, and one Book button. Rows cascade in. Berths that cannot take the stay fold behind "Show the N that cannot".

### Drawer
The selected reservation: slides in from the right over 320ms with a float shadow; Escape or Close returns to the grid and to the chip that opened it.

### Pills
Fully round, micro type, icon plus word: status, verdicts, counts.

## Do's and Don'ts

### Do:
- **Do** lead every screen with its one answer, in bold, and fold the rest away.
- **Do** colour whole chips by kind and keep controls blue.
- **Do** pair every colour with an icon, a pattern or a word.
- **Do** animate arrival, change and acknowledgement; keep routine transitions under 300ms and exits faster than entrances.
- **Do** honour reduced motion: everything still works and reads with all motion off.

### Don't:
- **Don't** use uppercase tracked labels, square corners, heavy black borders or ruled tables: that was the rejected legacy look.
- **Don't** show every fact at once. If a row needs more than one line of secondary text, it belongs in the drawer.
- **Don't** put violet, amber or rose on a control, or blue on a status.
- **Don't** animate for decoration, loop anything except the now-dot, or make anyone wait for choreography.
- **Don't** nest cards, or wrap every list item in its own card.
