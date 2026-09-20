---
name: Harborview Dock Schedule
description: A berth reservation tool drawn like a marine engineer's berthing plan, with purposeful motion.
colors:
  sheet: "#F3F5F7"
  sheet-raised: "#FCFDFE"
  sheet-sunk: "#E8ECF0"
  ink: "#0F1C2B"
  ink-2: "#43536A"
  ink-3: "#566577"
  line: "#CBD3DC"
  line-strong: "#8A98A8"
  prussian: "#14508F"
  prussian-deep: "#0E3F73"
  prussian-tone: "#DCE8F5"
  revision: "#B3261E"
  revision-tone: "#FBE9E7"
  caution: "#855600"
  caution-line: "#B7791F"
  caution-tone: "#FFF3D6"
  clear: "#1B6541"
  clear-tone: "#E2F2E9"
typography:
  headline:
    fontFamily: "Barlow, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.4375rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Barlow, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Barlow, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "'Barlow Semi Condensed', 'Arial Narrow', Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.25
    fontFeature: "'tnum' 1, 'lnum' 1"
  heading:
    fontFamily: "Barlow, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
  prose:
    fontFamily: "Barlow, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  small:
    fontFamily: "Barlow, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  tag:
    fontFamily: "'Barlow Semi Condensed', 'Arial Narrow', Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1
  caption:
    fontFamily: "'Barlow Semi Condensed', 'Arial Narrow', Arial, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.07em"
rounded:
  none: "0px"
  control: "2px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.prussian}"
    textColor: "{colors.sheet-raised}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.prussian-deep}"
  button-secondary:
    backgroundColor: "{colors.sheet-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "36px"
  button-danger:
    backgroundColor: "{colors.sheet-raised}"
    textColor: "{colors.revision}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.sheet-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    height: "36px"
  stay-vessel:
    backgroundColor: "{colors.prussian}"
    textColor: "{colors.sheet-raised}"
    rounded: "{rounded.none}"
  stay-event:
    backgroundColor: "{colors.prussian-tone}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  stay-closure:
    backgroundColor: "{colors.sheet-sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  drawer:
    backgroundColor: "{colors.sheet-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    width: "26rem"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet-raised}"
    rounded: "{rounded.control}"
---

# Design System: Harborview Dock Schedule

## Overview

**Creative North Star: "The Berthing Plan"**

The interface is a marine engineer's general-arrangement drawing of a pier, put to work. Technical drawings exist to make two things unarguable: how long something is, and what state an area is in. Those are exactly the two questions this product answers, so the drawing's native devices carry the data. A berth's length is drawn to scale. A vessel is laid against a berth and the overage is dimensioned. What occupies a berth is told by its fill: solid ink for a vessel, a dotted tone for an event, cross-hatching for a closure.

It is a plotted sheet seen in a daylight marine operations office: cool drafting-film white, blue-black plot ink, line weight doing the work that shadows and cards do elsewhere. It is flat and calm, and each sheet leads with one answer. It is not a white-card SaaS dashboard, and it is not dark "mission control" with neon.

The owner tried a light, colourful calendar-style replacement and came back to this look, keeping three things from that round: **purposeful animation**, **bold type on the facts that matter**, and **less on screen at once**. They are part of this system now, expressed in its own grammar rather than bolted on.

One test governs every borrowed convention: **it must carry data** (a dimension, a status, a reference) or it is cut. No compass roses, no fake fold marks, no coffee rings, no blueprint-blue backgrounds.

**Key Characteristics:**
- Line weight is hierarchy: thin for day gridlines, medium for berth rows, heavy ink for the sheet border and title block.
- Status is pattern plus shape plus text. Colour reinforces; it never carries meaning alone.
- Lengths are drawn to a common scale wherever two lengths are compared.
- One accent. Revision red is reserved for things that are wrong.
- Flat. Square. No cards.
- Bold what matters; fold away what does not need to be seen yet.
- Motion is the pen moving: things are drawn in, slid into place, or acknowledged. Never decoration.

## Colors

A restrained strategy: cool neutrals, one Prussian blue, and three semantic inks that appear only when a state demands them.

### Primary
- **Prussian** (`prussian`): the blueprint blue. Primary actions, links, the current selection, and the solid fill of a confirmed vessel stay. `prussian-deep` is its hover and pressed state; `prussian-tone` is its wash, used for selected rows and event stays.

### Neutral
- **Drafting Film** (`sheet`): the page ground, a cool white with a trace of blue-grey.
- **Bond** (`sheet-raised`): the drawing surface itself: the schedule grid, tables, inputs.
- **Title Block** (`sheet-sunk`): the second neutral layer: header, toolbars, berth row headers, weekend columns.
- **Plot Ink** (`ink`): text and heavy linework. `ink-2` for secondary text, `ink-3` for captions and placeholders (both hold 4.5:1 on every neutral).
- **Thin Line** (`line`) and **Medium Line** (`line-strong`): the two lighter pen weights.

### Semantic inks
- **Revision Red** (`revision`, wash `revision-tone`): a double-booking conflict, a vessel too long for a berth, a destructive action.
- **Trace Amber** (`caution`, hatch `caution-line`, wash `caution-tone`): something to double-check before acting, such as dates changed but not yet saved.
- **Survey Green** (`clear`, wash `clear-tone`): fits and free.

### Named Rules
**The Red Pen Rule.** Revision red appears only where something is wrong or about to be destroyed. It is never a brand colour, a highlight, or a hover.

**The Never Colour Alone Rule.** Every status has a pattern or a glyph and a text label as well as its colour. Remove all colour from the schedule and it must still read.

## Typography

**UI Font:** Barlow (with Helvetica Neue, Arial)
**Data and Label Font:** Barlow Semi Condensed (with Arial Narrow, Arial)

**Character:** One superfamily in two widths. Barlow comes from plate and signage lettering, monoline and slightly squared, which sits naturally beside dimension numerals; the semi-condensed width lets vessel names and day numbers fit a 31-column grid without shrinking below legibility.

### Hierarchy
Nine fixed steps, each with one job. Nothing sits between them.
- **Headline** (600, 1.4375rem, 1.2): one per page: the page name.
- **Heading** (600, 1.25rem, 1.25): the product name in the title block; the drawer's title; a results headline.
- **Title** (600, 1.0625rem, 1.3): section headings, panel titles, a page's lead sentence.
- **Prose** (400 to 700, 1rem): the lead facts of a panel, such as the dates of a stay in the drawer.
- **Body** (400, 0.9375rem, 1.5): forms, descriptions, navigation.
- **Small** (400 to 600, 0.875rem): buttons, tables, notices, secondary explanations.
- **Data** (500, 0.8125rem, tabular lining figures): stay labels, day numbers, lengths, hints.
- **Tag** (600, 0.75rem): status tags.
- **Caption** (600, 0.6875rem, uppercase, 0.07em tracking): title-block captions and table column heads only.

### Named Rules
**The Bold Rule.** On any row, exactly the facts a coordinator scans for are 600 to 700 weight in ink: the name, the dates, the number of feet, the verdict. Everything around them is regular weight in `ink-2`. If everything is bold, nothing is.

**The Title Block Rule.** Uppercase tracked captions belong to table heads and title-block fields, where a drawing would have them. They are never an eyebrow over a section.

**The Feet Rule.** Lengths are written as a number and `ft` with tabular figures ("170 ft"). An overage is always stated in feet ("80 ft too long"), never as a bare warning.

## Layout

A full-width sheet. The header is the drawing's title block: bordered fields (facility and product, navigation, the live date and time with the one primary action) separated by medium rules. Below it, each page is one sheet with a heavy ink border; content sits directly on the sheet, separated by rules, not boxed in cards.

The schedule is a fixed berth column plus one column per day, and it owns the full viewport width. Every other page is capped at 64rem.

Each sheet shows one answer and keeps the rest a click away: the schedule shows stays, not their paperwork; the berth finder leads with the berths that can take the stay and folds the others behind a disclosure; notes and secondary fields appear on request; a stay's details open in a drawer that the page makes room for, never a modal. Spacing is a 4px base (4, 8, 12, 16, 24, 40); groups are tight, separation is generous, and a heading has more space above than below.

Responsive behaviour is structural. Under 64rem the schedule scrolls horizontally inside its sheet with the berth column sticky; the title block's fields stack and its navigation wraps onto a second line so every destination stays visible; side-by-side panels stack. Type does not scale fluidly.

## Elevation & Depth

Flat. Depth is line weight and tonal layering (`sheet` under `sheet-raised`, `sheet-sunk` for chrome). The exceptions are the things that float over the sheet: the vessel picker's list, the reservation drawer and the confirmation toast.

### Shadow Vocabulary
- **Floating** (`box-shadow: 0 8px 20px -6px rgb(15 28 43 / 0.22)`): the picker list, the drawer and the toast, always together with an ink border.

### Named Rules
**The No Card Rule.** Nothing is a rounded, shadowed card. A region is defined by rules and a caption, the way a drawing defines a detail.

## Shapes

Square. The sheet, tables, stay bars and hatches have no radius (0). Interactive controls take a 2px radius so they read as controls rather than as drawn geometry. Borders are 1px in one of the three pen weights; the sheet border and title-block dividers are 1.5px ink. Focus is a 2px Prussian outline offset by 2px, never removed.

## Components

### Buttons
- **Shape:** crisp, 2px radius, 36px tall, Barlow 600 at 0.875rem.
- **Primary:** Prussian fill, Bond text. One per view.
- **Secondary:** Bond fill, 1px medium-line border, ink text. **Danger:** the same with revision-red text and border.
- **Hover / Focus:** fill deepens (primary) or takes the title-block tone (secondary) over 150ms; focus-visible shows the Prussian outline. Disabled drops to 45% opacity with a not-allowed cursor; pending shows the action's gerund ("Booking...") and disables the control.

### Inputs / Fields
- **Style:** Bond fill, 1px medium-line border, 2px radius, 36px tall, caption-style label above.
- **Focus:** border becomes Prussian plus the focus outline. **Error:** revision-red border, and a message beneath that names the problem and the fix.

### Navigation
The title block's middle field: text links in Barlow 500. The current page takes ink text and a 2px Prussian underline; others are `ink-2` and darken on hover.

### Stay Bar (signature)
A stay drawn on the schedule. **Kind is the fill:** vessel = solid Prussian with Bond text; event = Prussian wash with a dotted pattern and a Prussian border; closure = title-block tone with ink cross-hatch and an ink border. **State is overlaid:** cancelled = no fill, dashed line border, struck-through label; ended = the same fill at reduced strength. A stay that continues past the month edge loses that edge's border and shows a chevron. Selected = a 2px ink ring. On load each bar is inked in from its first day; a stay that was just booked lands with a brief Prussian glow.

### Berth Scale (signature)
The berth row header: name, length in feet, and a dimension bar with end ticks drawn to a common scale against the longest berth (410 ft), so 55 ft reads as a sliver beside 410 ft.

### Fit Gauge (signature)
Used wherever a vessel is compared with a berth. The berth's dimension bar and the vessel's bar share one scale and one origin. A vessel that fits ends inside the berth bar with the spare length noted in survey green; one that does not overruns it, and the overrun is dimensioned in revision red ("80 ft over").

### Now Marker (signature)
Today's column carries a 1.5px Prussian line with a small solid triangle at the top border, placed at the fraction of the facility's day that has passed and moved every minute. Today's date sits in a filled Prussian square. Days before today are hatched out with thin lines and cannot be booked.

### Drawer
The selected stay: a sheet with an ink border that slides in from the right over 320ms (a bottom sheet on phones); the page makes room for it on wide screens. Escape or Close returns to the bar that opened it.

### Motion
One family of movements, all ease-out, all off under reduced motion: bars inked in along the timeline (420ms, staggered by row), the month sheet sliding in from the side travelled to (360ms), the drawer and notices sliding into place (240 to 320ms), result rows cascading (45ms apart), dimension bars striking out from their origin (520ms), a toast rising to acknowledge a booking. Hover and press are 100 to 150ms. Nothing loops.

### Key (signature)
Every view that shows stays carries a key explaining the fills and overlays in words.

## Do's and Don'ts

### Do:
- **Do** give every status a pattern or glyph and a text label in addition to its colour.
- **Do** draw lengths to a common scale whenever two are compared, and state differences in feet.
- **Do** separate regions with rules in one of the three pen weights.
- **Do** keep controls familiar: standard buttons, native selects and date inputs, real links.
- **Do** animate arrival, change and acknowledgement, ease-out, with routine transitions under 300ms; honour reduced motion completely.
- **Do** put the facts a coordinator scans for in bold and let the rest recede.
- **Do** lead with the answer and fold the rest away.

### Don't:
- **Don't** add drafting ornament that carries no data: compass roses, fold marks, grid-paper backgrounds, stamps, blueprint-blue page grounds.
- **Don't** use revision red for anything that is not wrong or destructive.
- **Don't** put content in rounded, shadowed cards, or nest containers.
- **Don't** use a monospace face to look technical; tabular figures in the data face do the aligning.
- **Don't** open a modal for a task that a side panel or an inline form can carry.
- **Don't** loop an animation, animate for decoration, or make anyone wait for choreography.
