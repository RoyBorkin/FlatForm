<!-- FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved -->
# Architecture

## One input, one pipeline

The whole app is driven by a single plain-JSON object, `ProjectParams` (`src/core/params.ts`). The UI edits it through `useProject().update(fn)`. That store is wrapped in `zundo`, so every edit can be undone, and slider drags are throttled into a single undo step. The same object is what a `.flatform` file stores, along with any imported or sculpted mesh encoded in base64.

```
ProjectParams ──► worker.compute(params, knownKeys, until)
                    ├─ base     buildBase(shape)              skeleton / primitive / mesh asset
                    ├─ surface  prepareSurface(base)          transform → cut → remesh → relax
                    ├─ method   runMethod(surface)            one of 14 methods, then applyJoinery and applyManufacturing
                    └─ nest     nestParts(method.parts)       on the sheet, or the print bed
```

`stageKeys()` (`src/core/keys.ts`) hashes exactly the inputs each stage reads. The worker keeps the last result of every stage and recomputes only the stages whose key changed. The main thread sends the keys it already has, so unchanged results are never copied back. The engine (`src/state/engine.ts`) runs the pipeline in three passes (surface, method, nest), so the viewport updates as each stage finishes. Edits made while the worker is busy collapse into a single follow-up run.

## Core (`src/core`)

Pure TypeScript with no DOM access, so the same code runs in the worker and in Vitest.

- **Meshes** are indexed `{ positions: Float32Array, indices: Uint32Array }`, in mm with Z up.
- **Remeshing** (`mesh/remesh.ts`) runs whole-mesh passes on the indexed mesh: red-green splitting, collapses checked by the link condition, valence-driven flips, tangential smoothing, and BVH closest-point projection. Each pass rebuilds adjacency, and vertex locking keeps every local operation valid within a pass.
- **Parts** (`Part2D`) are the single source of truth for everything flat: closed `cut` contours (`cut[0]` is the outline), `holes` (circles, with pin labels), `score`, `engrave` and `perforations` polylines, and, for planar parts, a matrix mapping the part into the assembled model. `normalizePart` rotates each part to its minimum-area orientation and moves it to the origin, carrying everything with it.
- **Sheet drawing** (`export/sheetGeometry.ts`) places parts on sheets and orders cuts inner-first. The DXF writer, the SVG writer, the PDF writer, the 2D canvas and the assembly guide all draw from it, so what you see is what gets cut.

### Lattice unrolling

For each tree edge we keep the 3D polyline the strip follows and a normal at every point. A node's incident edges have angles measured in that node's tangent plane. Along a polyline, each bend is the *signed turning angle* in the local tangent plane, which is the geodesic curvature of the strip's centreline. Laying a tree out in 2D keeps every length and every one of these angles, which is exactly the shape a thin strip takes when it is bent onto the surface without stretching. Because trees have no cycles, no angle error builds up. Self-overlap is tested with a spatial hash of segment distances, and offending parts are split at the most balanced tree edge.

### Unfold engine (`unfold/`)

Folded panels, paper-craft, minimal joinery and flex hinges share one engine. `unfold()` lays triangles out along a spanning tree of the dual graph (flattest folds, longest edges or breadth first), refusing any face that would overlap its island (separating-axis test on a spatial hash) or outgrow the sheet. Optional *charts* restrict islands to groups of faces. `buildPanelParts()` unions each island's triangles and lets the method decorate every fold and every side of every seam through **edge features** (`joinery/edgeFeatures.ts`): glue flaps, latches, hole rows, lacing, finger joints, fold lines, living-hinge bands and Flaticulation patterns. Each feature draws in an edge-local frame (`s` along the edge from its lower-numbered vertex, `n` out of the panel), so both sides of a seam line up exactly.

**Junctions, kits and stacks (1.1).** Wherever parts meet at a point, `joinery/junction.ts` builds a `Junction`: the node position, a local frame with z on the surface normal, and one arm per member (`round`, `square` or `slot` sockets for sticks and bars, a `fork` for a panel corner). The core radius is the largest r / sin(α/2) over neighbouring arms, so sockets never overlap; members are shortened by the core (sticks, bars) or their corners cut back (panels, via `PanelConfig.vertexRelief`). Hubs are grouped by a signature of sorted arm specs and pairwise angles rounded to 1°, so identical hubs print from one file. `joinery/post.ts` (`applyJoinery`) runs after every method to turn lattice hubs into junctions and LEGO pin holes into axle holes. Seam-based kinds (cardboard connectors, LEGO Technic rows, bend tabs) are more edge features; cardboard and crossing clips are counted per angle with `AngleCounter`. `connectors/kit.ts` turns all of these, and LEGO-compatible bricks, into Manifold solids in print orientation. `bricks/` voxelises the shape on the 8 mm stud grid by slicing each layer, hollows it with a 3D distance transform and packs bricks greedily, largest first, turning direction every layer. `stack/` builds the four stacked modes: relief silhouettes (triangles clipped to a depth plane and unioned in projection), solid sections, laminated skins (offset surfaces flattened with a different chart seed per layer, so seams never line up) and nested shells (offset copies unfolded like folded panels).

For flexible sheet, `flatten.ts` replaces the tree layout of each disc-shaped chart with a **least-squares conformal map** (complex LSCM rows, solved by conjugate gradients on the normal equations), scaled to the true area. Charts that are not discs are first split into connected parts and then halved along their long axis (`splitToDiscs`). A chart that flips, overlaps itself or outgrows the sheet keeps the exact tree layout.

### Interlocking sections (`sections/`)

`interlock.ts` joins any two planar sections, whatever their orientation. The line where the planes meet is found from both normals, each section's solid intervals along it are found by even-odd crossing, and every overlapping interval gets a pair of half-slots meeting at its middle. All crossings of one pair open the same way, so the two parts slide together in a single move; grids and spines force the direction so every rib opens from the same side, and revolve profiles always open outward so each one slides into the rings from outside. `finishSection` hollows sections while keeping a post along every crossing. Guide curves (`curve.ts`) are Catmull-Rom splines through points normalised to the shape's bounding box, sampled by arc length; layers and ribs that fan around a curve are clipped to the radius where neighbouring planes would meet.

### Triangles

Edge lengths are clustered with 1-D k-means; Gauss-Seidel springs pull each edge toward its class length, the mesh is projected back onto the surface every few passes, and classes are re-fitted every 40. Each face is cut as the ideal triangle of its three classes and placed in 3D with its centroid on the face.

### Manufacturing (`manufacturing/`)

`applyManufacturing` runs after every method. For CNC it adds a dog-bone (or T-bone) relief at every corner the material wraps around, found from the turn direction and the outline's orientation. For 3D print, `effectiveSheet` makes the print bed the sheet, so nesting and plates follow it. `estimate()` gives weight (area × thickness × density, or shells plus infill for prints) and machine time for each process. Holding bridges and tabs are applied at export, in `sheetGeometry.ts`.

### Nesting

`nest/nest.ts` rasterises each orientation of a part twice. The *stamp* is the conservative footprint: interior cells plus every cell the outline passes through. The *test* mask is the stamp grown by the part spacing. Placement is bottom-left first fit, using 32-bit row bitsets and word-shifted AND tests. Masks use the full region, holes included, so small parts can nest inside large ones. Rotations are scored by their lowest top edge, and positions that cannot beat the current best are pruned.

## Front end

- **Viewport 3D** (`viewport/Scene3D.tsx`): React Three Fiber with on-demand rendering (it renders only when something changes), so the GPU is idle when nothing moves. Lattice strips are two `InstancedMesh`es per layer (segments and node discs), with per-instance colours for selection. Planar parts are extrusions placed by their matrices, merged into one mesh per group with a triangle-to-part table for picking; printed layer spacers are instanced prisms.
- **Viewport 2D** (`viewport/Canvas2D.tsx`): Canvas 2D with pan and zoom, and procedural material textures (plywood grain, brushed metal, acrylic, card).
- **Themes**: `styles/tokens.css` defines the tokens. Each look (`data-world`) and mode (`data-mode`) redefines them. Layer colours are applied as `--layer-n` variables from the settings, lifted on dark grounds when they are very deep (`themes/legible.ts`).
- **Desktop**: `platform/save.ts` detects Tauri and uses the native dialog and fs plugins. Everything else is shared with the web build.

## Loading and long tasks

`index.html` contains a self-contained splash (inline SVG and CSS) that shows the current pipeline stage and fades out when the first parts exist (`ui/useBootSplash.ts`). Anything slow afterwards is a *task* (`state/tasks.ts`): exports run inside `withTask`, and a recompute that takes longer than 0.7 s appears as one too. `ui/components/TaskOverlay.tsx` shows them as a non-blocking progress card.

## Adding a construction method

1. Add its parameters to `ProjectParams` and `defaultProject()` (the key must match the method id: `stageKeys` reads `p[p.method]`).
2. Implement `buildX(…): MethodResult` in `src/core/…`, returning `Part2D[]` and an `Assembly3D`. Panel methods can reuse `unfold` + `buildPanelParts`; section methods can reuse `makeSection` + `interlock`.
3. Add a case to `buildMethod` in `pipeline.ts`.
4. Add it to `METHODS` in `ui/labels.ts`, a glyph in `components/glyphs.tsx`, controls under `ui/panels/method/`, and its supported joinery in `JOINERY_SUPPORT`.
