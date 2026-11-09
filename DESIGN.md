<!-- FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved -->
# Design

FlatForm is a working tool (Operate mode): people spend long sessions tuning parameters. The layout is fixed and familiar. A "world" lends the interface its type, palette, density and one signature detail. Three worlds ship, each in dark and light. Users switch between them in Settings; the components never change.

## Layout

| Region | Purpose |
|---|---|
| Top bar | Project name, view switch (3D · Flat parts · Sheets), undo/redo, open/save, Export |
| Left rail | The build order as navigation: Shape → Surface → Method → Joinery → Material & making → Nest → Export, then Settings and the author credit, each step with its live result and a status dot |
| Viewport | 3D (R3F) or 2D sheet canvas, a display toolbar, and the selected-part card |
| Inspector | Controls for the active step, grouped in collapsible sections |
| Status bar | Live numbers: triangles, parts, pins, sheets or plates, cut length, machine time, weight, material cost, engine state |

## Worlds

| World | Ground / panel (dark) | Accent | Type | Signature |
|---|---|---|---|---|
| **Model shop** (default) | graphite `#1b1916` / `#22201c` | basswood `#d9b07a` | Hanken Grotesk + JetBrains Mono numerals | Sheets render in the chosen stock (plywood grain, brushed metal, acrylic, card) |
| **Pattern tissue** | ink `#17181d` / `#1e2027` | pattern red `#ff6b5e` | Archivo, uppercase tracked labels | Each layer gets its own line dash, like sewing-pattern sizes |
| **Drafting** | blueprint `#0d2136` / `#11283f` | `#8fd0ff` | Barlow + Barlow Condensed labels | Square corners, and a title-block status bar |

The light modes are museum board `#e4e1db`, tissue `#e8e2d3` and drafting film `#e3eaf0`. All tokens live in `src/styles/tokens.css`. Components read only the variables.

## Brand palette, part and layer colours

The FlatForm palette is orange-red `#ee4036`, amber yellow `#faaf40` and dark grey `#262626`. The mark is two layers of branching strips, amber and red, pinned at their nodes on a dark grey tile (`src/ui/components/LogoMark.tsx`, `docs/app-icon.svg`).

Every world defaults its part and layer colours to the palette and its tints (`PALETTE_LAYERS` in `src/themes/themes.ts`): A red, B dark grey, C amber, then lighter and deeper versions. Users can edit them per world. Dark grey is too deep to read on a graphite ground, so `themes/legible.ts` lifts very dark colours toward white in dark mode (and deepens very pale ones in light mode) before they reach `--layer-n` and the viewport; the stored colour is unchanged.

## Method picker

Eleven methods are grouped into four families (Surface, Frames, Sections, Folded) as compact tiles: a line glyph drawn in the layer colours and the name. The selected method's one-line description sits under the grid, so the controls stay close to the top of the inspector.

## Loading

A splash with the mark, the name, a red-to-amber progress sweep and the current pipeline stage covers the first load. After that, slow work appears in a small floating card above the status bar (spinner, label, stage, bar), never as a blocking modal.

## Motion

Motion is minimal and functional. Easing is `cubic-bezier(0.23, 1, 0.32, 1)`, 120–200 ms. Pressed controls scale to 0.97. Popovers scale in from their trigger. Toasts and the part card enter with `@starting-style`. Keyboard actions never animate, and `prefers-reduced-motion` removes movement.

## Accessibility

Every control is a labelled native or Radix widget. Focus rings use `--focus`. Text contrast is at least 4.5:1 in all six theme combinations. Colour is never the only signal: layers also carry letters, and Pattern tissue adds dashes.
