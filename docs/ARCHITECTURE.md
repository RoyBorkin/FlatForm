# Architecture

## One input, one pipeline

The whole app is driven by a single plain-JSON object, `ProjectParams` (`src/core/params.ts`). The UI edits it through `useProject().update(fn)`. That store is wrapped in `zundo`, so every edit can be undone, and slider drags are throttled into a single undo step. The same object is what a `.sheetform` file stores, along with any imported or sculpted mesh encoded in base64.

```
ProjectParams ──► worker.compute(params, knownKeys, until)
                    ├─ base     buildBase(shape)              skeleton / primitive / mesh asset
                    ├─ surface  prepareSurface(base)          transform → cut → remesh → relax
                    ├─ method   runMethod(surface)            lattice | slices | waffle | folded
                    └─ nest     nestParts(method.parts)       raster / maxrects
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

### Nesting

`nest/nest.ts` rasterises each orientation of a part twice. The *stamp* is the conservative footprint: interior cells plus every cell the outline passes through. The *test* mask is the stamp grown by the part spacing. Placement is bottom-left first fit, using 32-bit row bitsets and word-shifted AND tests. Masks use the full region, holes included, so small parts can nest inside large ones. Rotations are scored by their lowest top edge, and positions that cannot beat the current best are pruned.

## Front end

- **Viewport 3D** (`viewport/Scene3D.tsx`): React Three Fiber with on-demand rendering (it renders only when something changes), so the GPU is idle when nothing moves. Lattice strips are two `InstancedMesh`es per layer (segments and node discs), with per-instance colours for selection. Planar parts are extrusions placed by their matrices.
- **Viewport 2D** (`viewport/Canvas2D.tsx`): Canvas 2D with pan and zoom, and procedural material textures (plywood grain, brushed metal, acrylic, card).
- **Themes**: `styles/tokens.css` defines the tokens. Each look (`data-world`) and mode (`data-mode`) redefines them. Layer colours are applied as `--layer-n` variables from the settings.
- **Desktop**: `platform/save.ts` detects Tauri and uses the native dialog and fs plugins. Everything else is shared with the web build.

## Adding a construction method

1. Add its parameters to `ProjectParams` and `defaultProject()`.
2. Implement `buildX(surface, params, …): MethodResult` in `src/core/x/`, returning `Part2D[]` and an `Assembly3D`.
3. Add a case to `runMethod` and the method's parameters to `stageKeys`.
4. Add a card and controls in `ui/panels/MethodPanel.tsx`, and its supported joinery in `JOINERY_SUPPORT`.
