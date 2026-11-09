/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * The unfold-based methods that share the engine in unfold.ts:
 *  - paper-craft: Pepakura-style pieces with glue flaps and fold lines,
 *  - minimal joinery: a few large pieces of flexible material, laced together,
 *  - flex hinges: the same few pieces in rigid sheet, made to bend with
 *    living-hinge slits wherever the surface curves.
 */
import type { MeshData, MethodResult, Path2 } from '../types';
import type { FlexHingeParams, JoineryParams, MaterialParams, MinimalParams, PapercraftParams, SheetParams } from '../params';
import { remesh, edgeLengthForTriangles } from '../mesh/remesh';
import { unfold } from './unfold';
import { flattenCharts } from './flatten';
import { buildPanelParts, oversizeWarning } from './panels';
import { edgeContext } from './unfold';
import { foldLine, glueFlap, latches, wireStitches, type EdgeCtx, type Features } from '../joinery/edgeFeatures';
import { AngleCounter, seamFeature, seamLabelInset } from '../joinery/seams';
import { hubPanelConfig, panelJunctions } from '../joinery/junction';
import { seamBendTabs } from '../joinery/bendTabs';
import { buildSurfaceGraph } from '../graph/graph';
import { buildTopology } from '../mesh/mesh';
import { clusterGraph } from '../graph/cluster';
import { offsetPolygons, strokePaths, union, intersection, difference } from '../polygon/polygon';
import { addCuts, hingeFill, hingeIsClosed } from '../joinery/hinges';
import type { V2 } from '../math/vec';

interface Common {
  surface: MeshData;
  joinery: JoineryParams;
  material: MaterialParams;
  sheet: SheetParams;
  onProgress?: (f: number, s: string) => void;
}

const usable = (s: SheetParams) => ({ W: s.width - 2 * s.margin, H: s.height - 2 * s.margin });

// ------------------------------------------------------------------ paper-craft

export function buildPapercraft(input: Common & { params: PapercraftParams }): MethodResult {
  const { params: P, joinery: J, material, sheet } = input;
  const warnings: string[] = [];
  const t = material.thickness;
  if (t > 1.2) warnings.push(`${material.name} is thick for paper-craft. Paper or card (0.2–0.5 mm) folds cleanly.`);
  const m = remesh(input.surface, { targetEdge: edgeLengthForTriangles(input.surface, P.targetFaces), iterations: 4 });
  input.onProgress?.(0.3, 'Pieces');
  const { W, H } = usable(sheet);
  const U = unfold(m, { strategy: P.strategy, maxIslandFaces: P.maxPieceFaces, autoSplit: P.autoSplit, sheetW: W, sheetH: H, pad: P.flapWidth });
  const flat = (P.flatThreshold * Math.PI) / 180;
  const pcHubs = J.kind === 'junction' ? panelJunctions(U, J.junction, t) : null;
  const flapOn = (ctx: EdgeCtx) => {
    switch (P.flaps) {
      case 'none':
        return false;
      case 'both':
        return true;
      case 'oneSide':
        return ctx.male;
      default:
        return ctx.num % 2 === 0 ? ctx.male : !ctx.male;
    }
  };
  const { parts, assembly } = buildPanelParts(
    U,
    {
      groupName: 'Pieces',
      thickness: t,
      numberSeams: P.edgeNumbers,
      textHeight: P.textHeight,
      pieceLabels: P.pieceLabels,
      labelInset: (ctx) => (J.kind === 'wire' ? J.wire.edgeOffset + J.wire.holeDiameter : J.kind === 'latches' && !ctx.male ? 3 : 0),
      fold: (ctx, F) => {
        if (P.foldStyle === 'lines' && ctx.foldAngle > flat) foldLine(ctx, F, 'score');
      },
      ...hubPanelConfig(pcHubs),
      seam: (ctx, F) => {
        if (J.kind === 'latches') latches(ctx, F, J.latch);
        else if (J.kind === 'wire') wireStitches(ctx, F, J.wire);
        else if (J.kind === 'bendtabs') seamBendTabs(ctx, F, J.bendtabs);
        else if (J.kind === 'junction') return;
        else if (flapOn(ctx)) glueFlap(ctx, F, P.flaps === 'both' ? P.flapWidth * 0.6 : P.flapWidth, P.flapShape, P.flapAngle);
      },
    },
    warnings,
  );
  oversizeWarning(parts, W, H, warnings);
  return {
    parts,
    assembly: { ...assembly, hubs: pcHubs?.junctions.length ? new Float32Array(pcHubs.junctions.flatMap((h) => [...h.pos, h.core + J.junction.wall])) : undefined },
    overlays: {},
    stats: { faces: m.indices.length / 3, pieces: U.islands.length, seams: U.seams },
    warnings,
    connectorData: pcHubs?.junctions.length ? { pinCount: pcHubs.junctions.length, gripLength: t, junctions: pcHubs.junctions } : undefined,
  };
}

// ------------------------------------------------------------------ charts

export function charts(m: MeshData, pieces: number, seed: number): Int32Array {
  const g = buildSurfaceGraph(m, 'hex'); // node i = face i
  const chart = clusterGraph(g, Math.max(1, pieces), seed, 8);
  return splitToDiscs(m, chart);
}

/**
 * Charts must be discs to lie flat in one piece. Split each chart into its
 * connected parts, then cut tubes and rings in half along their long axis
 * (a plane through the major principal axis) until every chart is a disc.
 */
export function splitToDiscs(m: MeshData, chart: Int32Array, maxDepth = 3): Int32Array {
  const topo = buildTopology(m);
  const nt = m.indices.length / 3;
  const out = new Int32Array(nt).fill(-1);
  let next = 0;
  const centroid = (f: number) => [0, 1, 2].map((a) => (m.positions[m.indices[f * 3] * 3 + a] + m.positions[m.indices[f * 3 + 1] * 3 + a] + m.positions[m.indices[f * 3 + 2] * 3 + a]) / 3);
  const components = (faces: number[]): number[][] => {
    const set = new Set(faces);
    const seen = new Set<number>();
    const comps: number[][] = [];
    for (const f0 of faces) {
      if (seen.has(f0)) continue;
      const comp = [f0];
      seen.add(f0);
      for (let i = 0; i < comp.length; i++)
        for (let k = 0; k < 3; k++) {
          const g = topo.triNeighbor[comp[i] * 3 + k];
          if (g >= 0 && set.has(g) && !seen.has(g)) {
            seen.add(g);
            comp.push(g);
          }
        }
      comps.push(comp);
    }
    return comps;
  };
  const disc = (faces: number[]) => {
    const set = new Set(faces);
    const verts = new Set<number>(), edges = new Set<number>();
    let boundary = 0;
    for (const f of faces)
      for (let k = 0; k < 3; k++) {
        verts.add(m.indices[f * 3 + k]);
        const e = topo.triEdge[f * 3 + k];
        if (edges.has(e)) continue;
        edges.add(e);
        const g = topo.triNeighbor[f * 3 + k];
        if (g < 0 || !set.has(g)) boundary++;
      }
    return boundary > 0 && verts.size - edges.size + faces.length === 1;
  };
  const halve = (faces: number[]): number[][] => {
    const c = faces.map(centroid);
    const mean = [0, 1, 2].map((a) => c.reduce((s, p) => s + p[a], 0) / c.length);
    // Covariance → major axis by power iteration, then the second axis.
    const cov = [0, 1, 2].map((a) => [0, 1, 2].map((b) => c.reduce((s, p) => s + (p[a] - mean[a]) * (p[b] - mean[b]), 0)));
    const power = (deflate?: number[]) => {
      let v = deflate ? [deflate[1], -deflate[0] + 0.3, 0.7] : [1, 0.5, 0.25];
      for (let i = 0; i < 40; i++) {
        let w = [0, 1, 2].map((a) => cov[a][0] * v[0] + cov[a][1] * v[1] + cov[a][2] * v[2]);
        if (deflate) {
          const d = w[0] * deflate[0] + w[1] * deflate[1] + w[2] * deflate[2];
          w = w.map((x, a) => x - d * deflate[a]);
        }
        const l = Math.hypot(w[0], w[1], w[2]) || 1;
        v = w.map((x) => x / l);
      }
      return v;
    };
    const major = power();
    const second = power(major);
    const a: number[] = [], b: number[] = [];
    faces.forEach((f, i) => ((c[i][0] - mean[0]) * second[0] + (c[i][1] - mean[1]) * second[1] + (c[i][2] - mean[2]) * second[2] >= 0 ? a : b).push(f));
    return [a, b].filter((x) => x.length);
  };
  const byChart = new Map<number, number[]>();
  for (let f = 0; f < nt; f++) {
    if (!byChart.has(chart[f])) byChart.set(chart[f], []);
    byChart.get(chart[f])!.push(f);
  }
  const place = (faces: number[], depth: number) => {
    for (const comp of components(faces)) {
      if (depth >= maxDepth || comp.length < 8 || disc(comp)) {
        for (const f of comp) out[f] = next;
        next++;
      } else for (const half of halve(comp)) place(half, depth + 1);
    }
  };
  for (const faces of byChart.values()) place(faces, 0);
  return out;
}

// ------------------------------------------------------------------ minimal joinery

export function buildMinimal(input: Common & { params: MinimalParams }): MethodResult {
  const { params: P, joinery: J, material, sheet } = input;
  const warnings: string[] = [];
  const t = material.thickness;
  if (material.minBendRadius === 0 || material.minBendRadius > 60) warnings.push(`${material.name} is not flexible. Minimal joinery needs paper, fabric, felt, leather, thin plastic or card. For rigid sheet, use Flex hinges.`);
  const m = remesh(input.surface, { targetEdge: edgeLengthForTriangles(input.surface, P.targetFaces), iterations: 4 });
  input.onProgress?.(0.3, 'Pieces');
  const chart = charts(m, P.pieces, P.seed);
  const { W, H } = usable(sheet);
  const U = unfold(m, { strategy: 'flattest', maxIslandFaces: 1e9, autoSplit: P.autoSplit, sheetW: W, sheetH: H, pad: 4, chart });
  input.onProgress?.(0.5, 'Flatten');
  // Flexible sheet can stretch a little: flatten whole charts where that keeps the piece count low.
  const { stretch } = flattenCharts(U, chart, W, H, 4);
  if (stretch > 0.04) warnings.push(`Some pieces stretch up to ${Math.round(stretch * 100)}% to lie flat. Felt, fabric and thin plastic absorb this; for paper, add pieces.`);
  input.onProgress?.(0.6, 'Unfold');
  if (U.islands.length > P.pieces * 1.5) warnings.push(`The shape needed ${U.islands.length} pieces instead of ${P.pieces} so that none overlaps itself or outgrows the sheet.`);
  const { parts, assembly } = buildPanelParts(
    U,
    {
      groupName: 'Pieces',
      thickness: t,
      numberSeams: P.numberSeams,
      textHeight: P.textHeight,
      seamMarks: P.seamMarks,
      pieceLabels: true,
      labelInset: seamLabelInset(J, t),
      seam: seamFeature(J, { glueTabWidth: 8 }),
    },
    warnings,
  );
  oversizeWarning(parts, W, H, warnings);
  return { parts, assembly, overlays: {}, stats: { faces: m.indices.length / 3, pieces: U.islands.length, seams: U.seams }, warnings };
}

// ------------------------------------------------------------------ flex hinges

export function buildFlexHinge(input: Common & { params: FlexHingeParams }): MethodResult {
  const { params: P, joinery: J, material, sheet } = input;
  const warnings: string[] = [];
  const t = material.thickness;
  if (t > 6) warnings.push('Living hinges work best in 2–6 mm plywood, MDF or acrylic.');
  if (hingeIsClosed(P.pattern) && P.spacing - Math.min(2 * P.slotWidth, P.spacing * 0.9) < Math.max(0.6, t * 0.25))
    warnings.push('The hinge cut-outs leave very thin webs between rows. Increase the row spacing or make the slots narrower.');
  const m = remesh(input.surface, { targetEdge: edgeLengthForTriangles(input.surface, P.targetFaces), iterations: 4 });
  input.onProgress?.(0.3, 'Pieces');
  const chart = charts(m, P.pieces, P.seed);
  const { W, H } = usable(sheet);
  const U = unfold(m, { strategy: 'flattest', maxIslandFaces: 1e9, autoSplit: P.autoSplit, sheetW: W, sheetH: H, pad: 4, chart });
  input.onProgress?.(0.6, 'Hinges');
  const minA = (P.minAngle * Math.PI) / 180;
  let hingeArea = 0;
  const clips = new AngleCounter(5); // a cardboard channel takes a few degrees either way
  const fhHubs = J.kind === 'junction' ? panelJunctions(U, J.junction, t) : null;
  const { parts, assembly } = buildPanelParts(
    U,
    {
      groupName: 'Pieces',
      thickness: t,
      numberSeams: P.numberSeams,
      textHeight: P.textHeight,
      seamMarks: P.seamMarks,
      pieceLabels: true,
      labelInset: seamLabelInset(J, t),
      seam: seamFeature(J, { glueTabWidth: 0, onClip: (_c, n, a) => clips.add(a, n) }),
      ...hubPanelConfig(fhHubs),
      island: (_i, faces, region, F: Features) => {
        // Bands around every fold that needs bending.
        const faceSet = new Set(faces);
        const bands: { poly: Path2[]; dir: V2; w: number }[] = [];
        let dx = 0, dy = 0;
        for (const f of faces)
          for (let k = 0; k < 3; k++) {
            const ctx = edgeContext(U, f, k, t);
            if (ctx.g < 0 || !faceSet.has(ctx.g) || f > ctx.g || !U.isFold(ctx.e) || ctx.foldAngle < minA) continue;
            const half = Math.max(P.spacing * 2, (ctx.foldAngle * P.bendRadius) / 2);
            const w = ctx.foldAngle * ctx.len;
            bands.push({ poly: strokePaths([[ctx.A, ctx.B]], half, 'round', 'round'), dir: ctx.u, w });
            // Average axis (sign-free) weighted by how much it bends.
            const ang = Math.atan2(ctx.u[1], ctx.u[0]) * 2;
            dx += Math.cos(ang) * w;
            dy += Math.sin(ang) * w;
          }
        if (!bands.length) return;
        const keep = offsetPolygons(region, -Math.max(P.bridge * 1.5, t));
        if (P.align === 'fold') {
          // Curved bending: each band follows its own fold; stronger bends claim their area first.
          let used: Path2[] = [];
          for (const b of bands.sort((x, y) => y.w - x.w)) {
            let zone = intersection(b.poly, keep);
            if (used.length) zone = difference(zone, used);
            if (!zone.length) continue;
            addCuts(F, hingeFill(zone, b.dir, P));
            used = union([...used, ...zone]);
            hingeArea += zone.reduce((s, p) => s + Math.abs(areaOf(p)), 0);
          }
          return;
        }
        const axis = Math.atan2(dy, dx) / 2;
        const zone = intersection(union(bands.flatMap((b) => b.poly)), keep);
        if (!zone.length) return;
        addCuts(F, hingeFill(zone, [Math.cos(axis), Math.sin(axis)], P));
        hingeArea += zone.reduce((s, p) => s + Math.abs(areaOf(p)), 0);
      },
    },
    warnings,
  );
  oversizeWarning(parts, W, H, warnings);
  return {
    parts,
    assembly: { ...assembly, hubs: fhHubs?.junctions.length ? new Float32Array(fhHubs.junctions.flatMap((h) => [...h.pos, h.core + J.junction.wall])) : undefined },
    overlays: {},
    stats: { faces: m.indices.length / 3, pieces: U.islands.length, seams: U.seams, hingeArea: Math.round(hingeArea) },
    warnings,
    connectorData: {
      pinCount: fhHubs?.junctions.length ?? 0,
      gripLength: t,
      junctions: fhHubs?.junctions.length ? fhHubs.junctions : undefined,
      seamClips: clips.total ? clips.list() : undefined,
    },
  };
}

function areaOf(p: Path2) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]);
  return a / 2;
}
