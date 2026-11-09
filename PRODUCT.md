<!-- FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved -->
# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Confirmed by user: a web app that also ships as desktop apps for Windows and macOS. Delegated details: Vite + React + TypeScript + Three.js, geometry in Web Workers, desktop via Tauri v2.

## Users

Designers, makers, architects and computational-design students who want to turn an organic 3D form into something they can cut from flat sheet stock and assemble. (Inferred from the brief: the reference is a How to Rhino Grasshopper workshop for intermediate and advanced users, but this app must not require Rhino.)

## Product Purpose

Take a 3D object (modelled in the app or imported) and rebuild it from flat 2D sheet parts, as in the reference "From Organic Shape to Fabrication" pipeline. Export the assembled 3D model, the flat parts, a ready-to-cut DXF, an assembly guide, a parts list, the original model, and printable connectors. Success: a file a laser or CNC cutter can cut (or a plate a printer can print) without cleanup, and parts that go back together.

Author: Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/. The name is FlatForm; the brand palette is orange-red #ee4036, amber #faaf40 and dark grey #262626.

## Positioning

One tool that covers the whole route from shape to cut file — modelling, surface prep, eleven construction methods, seven kinds of joinery, laser/CNC/3D-print making and nesting — with every parameter exposed, without needing a Grasshopper definition.

## Operating Context

Used at a desk alongside laser cutters, CNC routers and 3D printers. The output goes to laser/CNC software (DXF, SVG, PDF) and slicers (STL, 3MF). Materials range from paper and cardboard to plastics, plywood and sheet metal.

## Capabilities and Constraints

- Shape sources: skeleton lines → smooth body, a primitive library, sculpt/deform brushes, and import from a file.
- Construction methods, selectable: branching lattice (clusters → Kruskal maze → strips → layers pinned together → unroll), stacked slices, interlocking waffle, folded panels.
- User-controlled: pattern, scale, size, layers, sheet size, open faces, material thickness/kerf, and more.
- Joinery, user choice: screws (hole size chosen by user); 3D-printed parametric connectors (node hub, snap pin/rivet, angle bracket/edge clip, spacer/layer clip, hollow screw connector with an open centre); none (hole diameters chosen by user); integral folding latches (tab & slot, arrowhead snap, hook/barb, puzzle/dovetail), fully parametric.
- Exports: DXF cut file, project save, assembled 3D model, flat 2D parts, assembly guide, parts list + stats, original base 3D model.

## Brand Commitments

None yet. The product name "FlatForm" is a working name chosen during the build.

## Evidence on Hand

The user's reference: a 10-slide How to Rhino carousel plus two videos (workshop promotion). They are reference for the pipeline only; their brand must not be copied.

## Product Principles

1. Full control: every stage exposes its parameters; no hidden magic numbers.
2. The cut file is the truth: what is drawn on screen is exactly what is exported.
3. Stay responsive: heavy geometry never blocks the interface.
4. Every part is traceable: numbered parts and holes link the flat sheet to its place in 3D.
