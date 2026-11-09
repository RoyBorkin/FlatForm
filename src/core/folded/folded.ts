/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Folded panels: a faceted version of the shape unfolded into islands. Folds
 * are scored, perforated, or turned into Flaticulation joints; cut edges are
 * numbered and joined with the chosen joinery.
 */
import type { MeshData, MethodResult } from '../types';
import type { FoldedParams, JoineryParams, MaterialParams, SheetParams } from '../params';
import { remesh, edgeLengthForTriangles } from '../mesh/remesh';
import { unfold } from '../unfold/unfold';
import { buildPanelParts, oversizeWarning } from '../unfold/panels';
import { flaticulationFold, foldLine } from '../joinery/edgeFeatures';
import { addCuts, bendRelief, hingeFill } from '../joinery/hinges';
import { edgeContext } from '../unfold/unfold';
import { difference, intersection, offsetPolygons, strokePaths, union } from '../polygon/polygon';
import type { Path2 } from '../types';
import type { V2 } from '../math/vec';
import { AngleCounter, seamFeature, seamLabelInset } from '../joinery/seams';
import { hubPanelConfig, panelJunctions } from '../joinery/junction';
import { getV } from '../math/vec';

export interface FoldedInput {
  surface: MeshData;
  params: FoldedParams;
  joinery: JoineryParams;
  material: MaterialParams;
  sheet: SheetParams;
  onProgress?: (f: number, s: string) => void;
}

export function buildFolded(input: FoldedInput): MethodResult {
  const { params: P, joinery: J, material, sheet } = input;
  const warnings: string[] = [];
  const t = material.thickness;
  const L = edgeLengthForTriangles(input.surface, P.targetFaces);
  const m = remesh(input.surface, { targetEdge: L, iterations: 4 });
  input.onProgress?.(0.25, 'Panels');
  const W = sheet.width - 2 * sheet.margin, H = sheet.height - 2 * sheet.margin;
  const U = unfold(m, { strategy: P.strategy, maxIslandFaces: P.maxIslandFaces, autoSplit: P.autoSplit, sheetW: W, sheetH: H, pad: P.tabWidth });
  if (U.overlapSplits && !P.autoSplit) warnings.push('Some panels overlap when unfolded. Turn on auto-split.');
  input.onProgress?.(0.55, 'Unfold');
  const connectors: number[] = [];
  const clips = new AngleCounter(5); // a cardboard channel takes a few degrees either way
  const hubs = J.kind === 'junction' ? panelJunctions(U, J.junction, t) : null;
  const bracketAngles: number[] = [];
  let pinPairs = 0;
  let flatJoints = 0;
  let reliefFolds = 0, hingeFolds = 0;
  const minA = (P.hinge.minAngle * Math.PI) / 180;
  const { parts, assembly } = buildPanelParts(
    U,
    {
      groupName: 'Panels',
      thickness: t,
      numberSeams: P.numberEdges,
      textHeight: P.textHeight,
      labelInset: seamLabelInset(J, t),
      fold:
        J.kind === 'flaticulation'
          ? (ctx, F) => {
              flaticulationFold(ctx, F, J.flaticulation);
              flatJoints++;
            }
          : P.foldLine === 'relief'
            ? (ctx, F) => {
                bendRelief(ctx, F, P.relief);
                reliefFolds++;
              }
            : P.foldLine === 'hinge'
              ? (ctx, F) => {
                  // Gentle folds stay scored; the rest get a hinge band (filled per island below).
                  if (ctx.foldAngle < minA) foldLine(ctx, F, 'score');
                }
              : (ctx, F) => foldLine(ctx, F, P.foldLine as 'score' | 'perforate', P.perforation),
      island:
        P.foldLine === 'hinge' && J.kind !== 'flaticulation'
          ? (_i, faces, region, F) => {
              const faceSet = new Set(faces);
              const bands: { poly: Path2[]; dir: V2; w: number }[] = [];
              for (const f of faces)
                for (let k = 0; k < 3; k++) {
                  const ctx = edgeContext(U, f, k, t);
                  if (ctx.g < 0 || !faceSet.has(ctx.g) || f > ctx.g || !U.isFold(ctx.e) || ctx.foldAngle < minA) continue;
                  const half = Math.max(P.hinge.spacing * 2, (ctx.foldAngle * P.hinge.bendRadius) / 2);
                  bands.push({ poly: strokePaths([[ctx.A, ctx.B]], half, 'miter', 'butt'), dir: ctx.u, w: ctx.foldAngle * ctx.len });
                }
              if (!bands.length) return;
              const keep = offsetPolygons(region, -Math.max(P.hinge.bridge * 1.5, t));
              let used: Path2[] = [];
              // Each fold gets a band of cuts along its own line; sharper folds claim shared corners first.
              for (const b of bands.sort((x, y) => y.w - x.w)) {
                let zone = intersection(b.poly, keep);
                if (used.length) zone = difference(zone, used);
                if (!zone.length) continue;
                addCuts(F, hingeFill(zone, b.dir, P.hinge));
                used = union([...used, ...zone]);
                hingeFolds++;
              }
            }
          : undefined,
      ...hubPanelConfig(hubs),
      seam: seamFeature(J, {
        glueTabWidth: P.tabs === 'glue' ? P.tabWidth : 0,
        onClip: (_c, n, a) => clips.add(a, n),
        onHoles: (ctx, n) => {
          const c = ctx as typeof ctx & { a: number; b: number; g: number };
          const pa = getV(m.positions, c.a), pb = getV(m.positions, c.b);
          const nn = U.normals[U.topo.edgeT0[(ctx as unknown as { e: number }).e]];
          connectors.push((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2, nn[0], nn[1], nn[2]);
          const inside = ctx.convex ? 180 - (ctx.foldAngle * 180) / Math.PI : 180 + (ctx.foldAngle * 180) / Math.PI;
          for (let i = 0; i < n; i++) bracketAngles.push(Math.round(inside));
          pinPairs += n;
        },
      }),
    },
    warnings,
  );
  input.onProgress?.(0.9, 'Joinery');
  oversizeWarning(parts, W, H, warnings);
  if (P.foldLine === 'relief' && J.kind !== 'flaticulation') {
    if (material.minBendRadius === 0 || /acrylic|mdf|plywood/i.test(material.name)) warnings.push(`${material.name} cracks when bent. Bend relief suits sheet metal, polypropylene and thick card.`);
  }
  if (P.foldLine === 'hinge' && t > 6) warnings.push('Living hinges work best in 2–6 mm plywood, MDF or acrylic.');
  if (J.kind === 'flaticulation' && t < 1.5) warnings.push('Flaticulation needs a stiff board (the paper used 3 mm MDF). Thin sheet will not clutch.');
  return {
    parts,
    assembly: { ...assembly, connectors: new Float32Array(connectors), hubs: hubs?.junctions.length ? new Float32Array(hubs.junctions.flatMap((h) => [...h.pos, h.core + J.junction.wall])) : undefined },
    overlays: {},
    stats: { faces: m.indices.length / 3, islands: U.islands.length, cutEdges: U.seams, flaticulated: flatJoints, reliefFolds, hingeFolds },
    warnings,
    connectorData: {
      pinCount: hubs ? hubs.junctions.length : pinPairs * 2,
      gripLength: t * 2,
      bracketAngles,
      junctions: hubs?.junctions.length ? hubs.junctions : undefined,
      seamClips: clips.total ? clips.list() : undefined,
    },
  };
}
