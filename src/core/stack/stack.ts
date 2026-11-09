/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Stacked layers, in four ways:
 *  - laminated skins: the surface built from several thin sheets laid face to
 *    face, each cut into pieces with different seams so the joints overlap;
 *  - nested shells: offset copies of the shape, one inside the other, each an
 *    unfolded shell of panels;
 *  - layered relief: what you see of the shape from one side, as outlines at
 *    several depths, stacked flat (shadow-box / topographic style);
 *  - solid stack: touching sections through the shape, held by bend tabs or rods.
 */
import type { Junction, MeshData, MethodResult, Part2D, Path2, Polyline2 } from '../types';
import type { JoineryParams, MaterialParams, SheetParams, StackParams } from '../params';
import { remesh, edgeLengthForTriangles } from '../mesh/remesh';
import { vertexNormals } from '../mesh/mesh';
import { projectRange, slicePlane, type PlaneFrame } from '../mesh/slice';
import { sectionRegion } from '../slices/section';
import { bounds, difference, offsetPolygons, pointInRegion, signedArea, union } from '../polygon/polygon';
import { dot3, type V2, type V3 } from '../math/vec';
import { frameFromNormal } from '../sections/curve';
import { layerNormal } from '../sections/layers';
import { sectionParts, type IdCounter } from '../sections/parts';
import { pinHoleDiameter } from '../joinery/holes';
import { stackTabs } from '../joinery/bendTabs';
import { unfold, type Unfolded } from '../unfold/unfold';
import { flattenCharts } from '../unfold/flatten';
import { charts } from '../unfold/methods';
import { buildPanelParts, oversizeWarning } from '../unfold/panels';
import { foldLine, type EdgeCtx, type Features } from '../joinery/edgeFeatures';
import { AngleCounter, seamFeature, seamLabelInset } from '../joinery/seams';
import { panelJunctions } from '../joinery/junction';

export interface StackInput {
  surface: MeshData;
  params: StackParams;
  joinery: JoineryParams;
  material: MaterialParams;
  sheet: SheetParams;
  onProgress?: (f: number, s: string) => void;
}

const HOLE_KINDS = new Set(['screws', 'printed', 'lego', 'crossing', 'none', 'wire']);

export function buildStack(input: StackInput): MethodResult {
  switch (input.params.mode) {
    case 'relief':
      return flatStack(input, reliefLayers(input));
    case 'solid':
      return flatStack(input, solidLayers(input));
    case 'laminate':
      return laminate(input);
    case 'shells':
      return shells(input);
  }
}

// ------------------------------------------------------------------ flat stacks

interface FlatLayers {
  frame: PlaneFrame;
  /** Plane offset of each layer's back face. */
  d: number[];
  regions: Path2[][];
  warnings: string[];
  backing?: Path2[];
}

/** Silhouette of the part of the mesh in front of the plane n·p = d, seen along n. */
function silhouette(m: MeshData, f: PlaneFrame, d: number): Path2[] {
  const P = m.positions, I = m.indices;
  const polys: Path2[] = [];
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]].map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]] as V3);
    const s = v.map((p) => dot3(f.n, p) - d);
    if (s[0] < 0 && s[1] < 0 && s[2] < 0) continue;
    const out: V3[] = [];
    for (let i = 0; i < 3; i++) {
      const a = v[i], b = v[(i + 1) % 3], sa = s[i], sb = s[(i + 1) % 3];
      if (sa >= 0) out.push(a);
      if (sa >= 0 !== sb >= 0) {
        const k = sa / (sa - sb);
        out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
      }
    }
    if (out.length < 3) continue;
    let poly: Path2 = out.map((p) => [dot3(f.u, p), dot3(f.v, p)] as V2);
    const a = signedArea(poly);
    if (Math.abs(a) < 1e-6) continue;
    if (a < 0) poly = poly.reverse();
    polys.push(poly);
  }
  if (!polys.length) return [];
  // Grow a hair to fuse the triangles, then shrink back.
  const merged = union(offsetPolygons(polys, 0.05, 'miter'));
  return offsetPolygons(merged, -0.05, 'miter').filter((p) => Math.abs(signedArea(p)) > 1);
}

function reliefLayers({ surface, params: P, material, onProgress }: StackInput): FlatLayers {
  const warnings: string[] = [];
  const t = material.thickness;
  const m = surface.indices.length / 3 > 8000 ? remesh(surface, { targetEdge: edgeLengthForTriangles(surface, 8000), iterations: 2 }) : surface;
  // n points from the shape toward the viewer.
  const f = frameFromNormal(layerNormal(P.azimuth, P.elevation), Math.abs(P.elevation) > 80 ? [0, 1, 0] : [0, 0, 1]);
  const [lo, hi] = projectRange(m, f.n);
  const N = Math.max(2, Math.round(P.count));
  const e = 1 / Math.max(0.2, P.depthCurve);
  const regions: Path2[][] = [];
  for (let k = 0; k < N; k++) {
    const depth = lo + (hi - lo) * Math.pow(k / N, e);
    regions.push(silhouette(m, f, depth + 1e-4));
    onProgress?.((0.6 * k) / N, 'Relief layers');
  }
  let backing: Path2[] | undefined;
  if (P.backing && regions[0]?.length) {
    const b = bounds(regions[0]);
    const r = P.margin;
    const x0 = b.minX - r, y0 = b.minY - r, x1 = b.maxX + r, y1 = b.maxY + r;
    backing = offsetPolygons([[[x0 + r / 2, y0 + r / 2], [x1 - r / 2, y0 + r / 2], [x1 - r / 2, y1 - r / 2], [x0 + r / 2, y1 - r / 2]]], r / 2);
  }
  // Relief depth is compressed: every layer sits one sheet in front of the last.
  const base = lo - (backing ? t : 0);
  const all = backing ? [backing, ...regions] : regions;
  const d = all.map((_, i) => base + i * t);
  if (hi - lo > N * t * 4) warnings.push(`The relief is ${Math.round(((hi - lo) / (N * t)) * 10) / 10}× shallower than the shape. Add layers or use thicker sheet for more depth.`);
  return { frame: f, d, regions: all, warnings, backing };
}

function solidLayers({ surface, params: P, material, onProgress }: StackInput): FlatLayers {
  const warnings: string[] = [];
  const t = material.thickness;
  const f = frameFromNormal(layerNormal(P.azimuth, P.elevation), Math.abs(P.elevation) > 80 ? [1, 0, 0] : [0, 0, 1]);
  const [lo, hi] = projectRange(surface, f.n);
  const N = Math.floor((hi - lo) / t);
  if (N > 600) warnings.push(`${N} touching layers is a lot of cutting. Use thicker sheet or the Stacked slices method with gaps.`);
  const count = Math.min(N, 1200);
  const regions: Path2[][] = [];
  const d: number[] = [];
  const first = lo + (hi - lo - count * t) / 2;
  for (let k = 0; k < count; k++) {
    const s = slicePlane(surface, f, first + (k + 0.5) * t);
    regions.push(sectionRegion(s.closed, s.open, P.margin, false));
    d.push(first + k * t);
    if (k % 20 === 0) onProgress?.((0.6 * k) / Math.max(1, count), 'Layers');
  }
  return { frame: f, d, regions, warnings };
}

/** Rods through the longest unbroken run of layers. */
function rodPoints(regions: Path2[][], count: number, clear: number): V2[] {
  const safe = regions.map((r) => (r.length ? offsetPolygons(r, -clear) : []));
  const all = safe.flat();
  if (!all.length || count < 1) return [];
  const xs = all.flat().map((q) => q[0]), ys = all.flat().map((q) => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cands: { p: V2; run: number }[] = [];
  const N = 28;
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const q: V2 = [minX + ((maxX - minX) * i) / N, minY + ((maxY - minY) * j) / N];
      let run = 0, best = 0;
      for (const sv of safe) {
        run = sv.length && pointInRegion(q, sv) ? run + 1 : 0;
        best = Math.max(best, run);
      }
      if (best >= 2) cands.push({ p: q, run: best });
    }
  cands.sort((a, b) => b.run - a.run);
  const out: V2[] = [];
  const gap = Math.max(clear * 3, Math.hypot(maxX - minX, maxY - minY) * 0.18);
  const minRun = Math.max(2, Math.ceil(regions.length * 0.3));
  for (const c of cands) {
    if (out.length >= count || c.run < minRun) break;
    if (out.every((q) => Math.hypot(q[0] - c.p[0], q[1] - c.p[1]) >= gap)) out.push(c.p);
  }
  return out;
}

function flatStack(input: StackInput, L: FlatLayers): MethodResult {
  const { params: P, joinery: J, material } = input;
  const t = material.thickness;
  const warnings = [...L.warnings];
  const regions = L.regions.map((r) => r.slice());
  const scores: Polyline2[][] = regions.map(() => []);
  let tabs = 0;
  if (J.kind === 'bendtabs') {
    const res = stackTabs(regions, t, 0, J.bendtabs);
    res.features.forEach((F, k) => {
      if (F.add.length) regions[k] = union([...regions[k], ...F.add]);
      if (F.sub.length) regions[k] = difference(regions[k], F.sub);
      scores[k].push(...F.score);
    });
    tabs = res.count;
    if (!tabs) warnings.push('No layer pair had room for a bend tab (each tab needs the layer below to reach past the one above). Try narrower tabs or use rods.');
    if (material.minBendRadius === 0 || /acrylic|mdf|plywood/i.test(material.name)) warnings.push(`${material.name} cracks when bent. Bend tabs suit sheet metal, card, cardboard and thin plastics.`);
  }
  // Rods through the stack when the joinery uses holes.
  const holeD = Math.max(0.5, pinHoleDiameter(J));
  const rods = HOLE_KINDS.has(J.kind) && P.rods > 0 ? rodPoints(L.regions, P.rods, holeD / 2 + Math.max(2.5, holeD)) : [];
  let rodHoles = 0;
  input.onProgress?.(0.75, 'Parts');
  const parts: Part2D[] = [];
  const ids: IdCounter = new Map();
  regions.forEach((region, k) => {
    if (!region.length) return;
    const holes = rods.filter((q) => pointInRegion(q, L.regions[k]) && pointInRegion(q, region)).map((q, i) => ({ x: q[0], y: q[1], r: holeD / 2, label: `R${i + 1}` }));
    rodHoles += holes.length;
    const engrave: Polyline2[] = [];
    // Registration: where the next layer sits.
    const next = L.regions[k + 1];
    if (P.registration && next?.length) for (const poly of next) engrave.push({ pts: [...poly, poly[0]], kind: 'registration' });
    const isBacking = !!L.backing && k === 0;
    parts.push(
      ...sectionParts(
        {
          frame: L.frame,
          d: L.d[k],
          thickness: t,
          region,
          group: isBacking ? 1 : 0,
          groupName: isBacking ? 'Backing' : 'Layers',
          label: isBacking ? 'B' : String(L.backing ? k : k + 1),
          holes,
          engrave,
          score: scores[k],
          labelParts: P.labelParts,
          textHeight: P.textHeight,
          meta: { layer: k + 1 },
        },
        ids,
      ),
    );
  });
  const runs = rods.length;
  return {
    parts,
    assembly: { kind: 'planar', thickness: t },
    overlays: {},
    stats: { layers: regions.filter((r) => r.length).length, tabs, rods: runs },
    warnings,
    connectorData: {
      pinCount: runs,
      gripLength: regions.length * t,
      collars: J.kind === 'crossing' && runs ? { bore: holeD, count: runs * 2 } : undefined,
    },
  };
  void rodHoles;
}

// ------------------------------------------------------------------ panel-based stacks

/** Offset a mesh inward along its vertex normals. */
function offsetMesh(m: MeshData, dist: number): MeshData {
  if (!dist) return m;
  const n = vertexNormals(m);
  const pos = new Float32Array(m.positions.length);
  for (let i = 0; i < pos.length; i++) pos[i] = m.positions[i] - n[i] * dist;
  return { positions: pos, indices: m.indices };
}

/** Share of faces whose normal flipped after an offset (the shell turned inside out). */
function flippedShare(a: MeshData, b: MeshData): number {
  let flips = 0;
  const nt = a.indices.length / 3;
  const nrm = (m: MeshData, f: number): V3 => {
    const p = (k: number) => [m.positions[m.indices[f * 3 + k] * 3], m.positions[m.indices[f * 3 + k] * 3 + 1], m.positions[m.indices[f * 3 + k] * 3 + 2]];
    const [p0, p1, p2] = [p(0), p(1), p(2)];
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  };
  for (let f = 0; f < nt; f++) if (dot3(nrm(a, f), nrm(b, f)) < 0) flips++;
  return flips / Math.max(1, nt);
}

function mergePanels(list: { parts: Part2D[]; assembly: MethodResult['assembly'] }[], t: number): { parts: Part2D[]; assembly: MethodResult['assembly'] } {
  const parts: Part2D[] = [];
  const pos: number[] = [], nrm: number[] = [], isl: number[] = [];
  for (const r of list) {
    const off = parts.length;
    parts.push(...r.parts);
    const p = r.assembly.panels;
    if (!p) continue;
    for (let i = 0; i < p.positions.length; i++) pos.push(p.positions[i]);
    for (let i = 0; i < p.normals.length; i++) nrm.push(p.normals[i]);
    for (let i = 0; i < p.island.length; i++) isl.push(p.island[i] + off);
  }
  return { parts, assembly: { kind: 'panels', thickness: t, panels: { positions: new Float32Array(pos), normals: new Float32Array(nrm), island: new Uint32Array(isl) } } };
}

function laminate(input: StackInput): MethodResult {
  const { params: P, joinery: J, material, sheet } = input;
  const t = material.thickness;
  const warnings: string[] = [];
  const N = Math.max(2, Math.min(8, Math.round(P.count)));
  const W = sheet.width - 2 * sheet.margin, H = sheet.height - 2 * sheet.margin;
  const base = remesh(input.surface, { targetEdge: edgeLengthForTriangles(input.surface, P.targetFaces), iterations: 4 });
  const layers: { m: MeshData; U: Unfolded }[] = [];
  let stretch = 0;
  for (let k = 0; k < N; k++) {
    const m = offsetMesh(base, k * t);
    // A different seed per layer puts the seams in different places, so they overlap like brickwork.
    const chart = charts(m, P.pieces, P.seed + k * 101);
    const U = unfold(m, { strategy: 'flattest', maxIslandFaces: 1e9, autoSplit: true, sheetW: W, sheetH: H, pad: 4, chart });
    stretch = Math.max(stretch, flattenCharts(U, chart, W, H, 4).stretch);
    layers.push({ m, U });
    input.onProgress?.(0.1 + (0.5 * (k + 1)) / N, `Layer ${k + 1}`);
  }
  if (stretch > 0.04) warnings.push(`Some pieces stretch up to ${Math.round(stretch * 100)}% to lie flat. Laminated skins suit thin, flexible sheet (veneer, card, thin plastic).`);
  // Pins at face centres away from every layer's seams, at least `pinSpacing` apart.
  const nt = base.indices.length / 3;
  const onSeam = new Uint8Array(nt);
  for (const { U } of layers)
    for (let f = 0; f < nt; f++)
      for (let k = 0; k < 3; k++) {
        const g = U.topo.triNeighbor[f * 3 + k];
        if (g < 0 || U.island[g] !== U.island[f]) onSeam[f] = 1;
      }
  const useTabs = J.kind === 'bendtabs';
  const pins: number[] = [];
  const holeD = Math.max(0.5, pinHoleDiameter(J));
  if (HOLE_KINDS.has(J.kind) || useTabs) {
    const c = (f: number): V3 => {
      const P3 = base.positions, I = base.indices;
      return [0, 1, 2].map((a) => (P3[I[f * 3] * 3 + a] + P3[I[f * 3 + 1] * 3 + a] + P3[I[f * 3 + 2] * 3 + a]) / 3) as V3;
    };
    const chosen: V3[] = [];
    for (let f = 0; f < nt; f++) {
      if (onSeam[f]) continue;
      const p = c(f);
      if (chosen.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) >= P.pinSpacing)) {
        chosen.push(p);
        pins.push(f);
      }
    }
  }
  const pinSet = new Set(pins);
  const hasRim = layers[0].U.topo.edgeT1.some((g) => g < 0);
  if (useTabs && !hasRim) warnings.push('Bend tabs wrap round the open edges of a laminate; this shape has none, so the layers are pinned instead.');
  const results = layers.map(({ U }, k) =>
    buildPanelParts(
      U,
      {
        group: k,
        groupName: `Layer ${k + 1}`,
        thickness: t,
        numberSeams: true,
        textHeight: P.textHeight,
        pieceLabels: P.labelParts,
        island: (_i, faces, _r, F: Features) => {
          if (useTabs && hasRim) return;
          for (const f of faces)
            if (pinSet.has(f)) {
              const tri = U.tri2[f];
              F.holes.push({ x: (tri[0][0] + tri[1][0] + tri[2][0]) / 3, y: (tri[0][1] + tri[1][1] + tri[2][1]) / 3, r: holeD / 2 });
            }
        },
        // The outer layer's rim carries hem tabs that wrap round every layer below.
        rim:
          useTabs && hasRim && k === 0
            ? (ctx: EdgeCtx, F: Features) => {
                const b = J.bendtabs;
                const wrap = b.bendRadius + N * t;
                const n = Math.max(1, Math.round(ctx.len / Math.max(b.pitch, b.width * 2)));
                for (let i = 0; i < n; i++) {
                  const s = ((i + 0.5) * ctx.len) / n;
                  if (s - b.width / 2 < 0.5 || s + b.width / 2 > ctx.len - 0.5) continue;
                  F.add.push([ctx.toXY(s - b.width / 2, -0.01), ctx.toXY(s + b.width / 2, -0.01), ctx.toXY(s + b.width / 2, wrap + b.fold), ctx.toXY(s - b.width / 2, wrap + b.fold)]);
                  F.score.push({ pts: [ctx.toXY(s - b.width / 2, 0), ctx.toXY(s + b.width / 2, 0)], kind: 'valley' });
                  F.score.push({ pts: [ctx.toXY(s - b.width / 2, wrap), ctx.toXY(s + b.width / 2, wrap)], kind: 'valley' });
                }
              }
            : undefined,
      },
      warnings,
    ),
  );
  const merged = mergePanels(results, t);
  oversizeWarning(merged.parts, W, H, warnings);
  if (!HOLE_KINDS.has(J.kind) && !useTabs) warnings.push('Laminated skins are joined with pins through every layer or bend tabs. The pin holes are drawn for plain pins.');
  return {
    ...merged,
    overlays: {},
    stats: { layers: N, pieces: merged.parts.length, pins: pins.length },
    warnings,
    connectorData: { pinCount: useTabs && hasRim ? 0 : pins.length, gripLength: N * t },
  };
}

function shells(input: StackInput): MethodResult {
  const { params: P, joinery: J, material, sheet } = input;
  const t = material.thickness;
  const warnings: string[] = [];
  const W = sheet.width - 2 * sheet.margin, H = sheet.height - 2 * sheet.margin;
  const base = remesh(input.surface, { targetEdge: edgeLengthForTriangles(input.surface, P.targetFaces), iterations: 4 });
  const N = Math.max(1, Math.min(8, Math.round(P.count)));
  const results: { parts: Part2D[]; assembly: MethodResult['assembly'] }[] = [];
  const clips = new AngleCounter(5); // a cardboard channel takes a few degrees either way
  const junctions: Junction[] = [];
  let made = 0;
  for (let k = 0; k < N; k++) {
    const m = offsetMesh(base, k * P.shellGap);
    if (k > 0 && flippedShare(base, m) > 0.02) {
      warnings.push(`Only ${k} shell${k > 1 ? 's' : ''} fit: the next one would turn inside out. Lower the gap between shells.`);
      break;
    }
    const U = unfold(m, { strategy: 'flattest', maxIslandFaces: 300, autoSplit: true, sheetW: W, sheetH: H, pad: 8 });
    let relief: Map<number, number> | undefined;
    if (J.kind === 'junction') {
      const res = panelJunctions(U, J.junction, t);
      res.junctions.forEach((h) => (h.id = `${String.fromCharCode(65 + k)}-${h.id}`));
      junctions.push(...res.junctions);
      relief = res.relief;
    }
    results.push(
      buildPanelParts(
        U,
        {
          group: k,
          groupName: `Shell ${k + 1}`,
          thickness: t,
          numberSeams: true,
          textHeight: P.textHeight,
          pieceLabels: P.labelParts,
          labelInset: seamLabelInset(J, t),
          fold: (ctx, F) => foldLine(ctx, F, 'score'),
          seam: seamFeature(J, { glueTabWidth: J.kind === 'none' ? 8 : 0, onClip: (_c, n, a) => clips.add(a, n) }),
          vertexRelief: relief ? (v) => relief!.get(v) ?? 0 : undefined,
        },
        warnings,
      ),
    );
    made++;
    input.onProgress?.(0.1 + (0.8 * (k + 1)) / N, `Shell ${k + 1}`);
  }
  const merged = mergePanels(results, t);
  oversizeWarning(merged.parts, W, H, warnings);
  if (made > 1) warnings.push('Nested shells stand on their own; to hold them together, hang them on a rod or thread, or rest each on printed spacers.');
  return {
    ...merged,
    overlays: {},
    stats: { shells: made, parts: merged.parts.length },
    warnings,
    connectorData: {
      pinCount: junctions.length,
      gripLength: t * 2,
      junctions: junctions.length ? junctions : undefined,
      seamClips: clips.total ? clips.list() : undefined,
    },
  };
}
