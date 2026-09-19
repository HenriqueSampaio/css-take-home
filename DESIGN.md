---
name: Harborview Dock Schedule
description: A berth reservation tool drawn like a marine engineer's berthing plan.
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
---

# Design System: Harborview Dock Schedule

## Overview

**Creative North Star: "The Berthing Plan"**

The interface is a marine engineer's general-arrangement drawing of a pier, put to work. Technical drawings exist to make two things unarguable: how long something is, and what state an area is in. Those are exactly the two questions this product answers, so the drawing's native devices carry the data. A berth's length is drawn to scale. A vessel is laid against a berth and the overage is dimensioned. A stay's status is a hatch pattern. Anything unresolved carries a revision triangle, the way a marked-up drawing would.

It is a plotted sheet seen in a daylight marine operations office: cool drafting-film white, blue-black plot ink, line weight doing the work that shadows and cards do elsewhere. It is dense, flat and calm. It is not a white-card SaaS dashboard, and it is not dark "mission control" with neon.

One test governs every borrowed convention: **it must carry data** (a dimension, a status, a reference) or it is cut. No compass roses, no fake fold marks, no coffee rings, no blueprint-blue backgrounds.

**Key Characteristics:**
- Line weight is hierarchy: thin for day gridlines, medium for berth rows, heavy ink for the sheet border and title block.
- Status is pattern plus shape plus text. Colour reinforces; it never carries meaning alone.
- Lengths are drawn to a common scale wherever two lengths are compared.
- One accent. Revision red is reserved for things that are wrong.
- Flat. Square. No cards.

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
- **Trace Amber** (`caution`, hatch `caution-line`, wash `caution-tone`): needs review. Unresolved legacy data.
- **Survey Green** (`clear`, wash `clear-tone`): fits and free.

### Named Rules
**The Red Pen Rule.** Revision red appears only where something is wrong or about to be destroyed. It is never a brand colour, a highlight, or a hover.

**The Never Colour Alone Rule.** Every status has a pattern or a glyph and a text label as well as its colour. Remove all colour from the schedule and it must still read.

## Typography

**UI Font:** Barlow (with Helvetica Neue, Arial)
**Data and Label Font:** Barlow Semi Condensed (with Arial Narrow, Arial)

**Character:** One superfamily in two widths. Barlow comes from plate and signage lettering, monoline and slightly squared, which sits naturally beside dimension numerals; the semi-condensed width lets vessel names and day numbers fit a 31-column grid without shrinking below legibility.

### Hierarchy
- **Headline** (600, 1.4375rem, 1.2): one per page: the page name.
- **Title** (600, 1.0625rem, 1.3): section headings, panel titles.
- **Body** (400, 0.9375rem, 1.5): forms, descriptions, the About page (measure capped at 70ch).
- **Data** (500, 0.8125rem, tabular lining figures): stay labels, table cells, day numbers, lengths.
- **Caption** (600, 0.6875rem, uppercase, 0.07em tracking): title-block captions and table column heads only.

### Named Rules
**The Title Block Rule.** Uppercase tracked captions belong to table heads and title-block fields, where a drawing would have them. They are never an eyebrow over a section.

**The Feet Rule.** Lengths are written as a number and `ft` with tabular figures ("170 ft"). An overage is always stated in feet ("80 ft too long"), never as a bare warning.

## Layout

A full-width sheet. The header is the drawing's title block: bordered fields (facility and product, navigation, demo status) separated by medium rules. Below it, each page is one sheet with a heavy ink border; content sits directly on the sheet, separated by rules, not boxed in cards.

The schedule is a fixed berth column plus one column per day, and it owns the full viewport width. Every other page is capped at 72rem. Spacing is a 4px base (4, 8, 12, 16, 24, 40); groups are tight, separation is generous, and a heading has more space above than below.

Responsive behaviour is structural. Under 64rem the schedule scrolls horizontally inside its sheet with the berth column sticky; the title block's navigation becomes a single scrolling row; side-by-side panels stack. Type does not scale fluidly.

## Elevation & Depth

Flat. Depth is line weight and tonal layering (`sheet` under `sheet-raised`, `sheet-sunk` for chrome). The one exception is a floating list (the vessel picker's results), which needs to clear the content beneath it.

### Shadow Vocabulary
- **Floating list** (`box-shadow: 0 8px 20px -6px rgb(15 28 43 / 0.22)`): popover lists only, always together with a 1px ink border.

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
A stay drawn on the schedule. **Kind is the fill:** vessel = solid Prussian with Bond text; event = Prussian wash with a dotted pattern and a Prussian border; closure = title-block tone with ink cross-hatch and an ink border. **State is overlaid:** needs review = amber diagonal hatch, dashed amber border and a revision triangle; too long = a revision-red overrun glyph at the bar's end; cancelled = no fill, dashed line border, struck-through label. A stay that continues past the month edge loses that edge's border and shows a chevron. Selected = 2px ink outline.

### Berth Scale (signature)
The berth row header: name, length in feet, and a dimension bar with end ticks drawn to a common scale against the longest berth (410 ft), so 55 ft reads as a sliver beside 410 ft.

### Fit Gauge (signature)
Used wherever a vessel is compared with a berth. The berth's dimension bar and the vessel's bar share one scale and one origin. A vessel that fits ends inside the berth bar with the spare length noted in survey green; one that does not overruns it, and the overrun is dimensioned in revision red ("80 ft over").

### Revision Triangle (signature)
A small outlined triangle holding a count: the drafting mark for "changed, check this". Marks anything with open review issues.

### Key (signature)
Every view that shows stays carries a key explaining the fills and overlays in words.

## Do's and Don'ts

### Do:
- **Do** give every status a pattern or glyph and a text label in addition to its colour.
- **Do** draw lengths to a common scale whenever two are compared, and state differences in feet.
- **Do** separate regions with rules in one of the three pen weights.
- **Do** keep controls familiar: standard buttons, native selects and date inputs, real links.
- **Do** keep motion to state changes, 150 to 200ms, ease-out, and honour reduced motion.

### Don't:
- **Don't** add drafting ornament that carries no data: compass roses, fold marks, grid-paper backgrounds, stamps, blueprint-blue page grounds.
- **Don't** use revision red for anything that is not wrong or destructive.
- **Don't** put content in rounded, shadowed cards, or nest containers.
- **Don't** use a monospace face to look technical; tabular figures in the data face do the aligning.
- **Don't** open a modal for a task that a side panel or an inline form can carry.
