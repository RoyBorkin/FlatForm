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
import { seamFeature, seamLabelInset } from '../joinery/seams';
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
  const bracketAngles: number[] = [];
  let pinPairs = 0;
  let flatJoints = 0;
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
          : (ctx, F) => foldLine(ctx, F, P.foldLine, P.perforation),
      seam: seamFeature(J, {
        glueTabWidth: P.tabs === 'glue' ? P.tabWidth : 0,
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
  if (J.kind === 'flaticulation' && t < 1.5) warnings.push('Flaticulation needs a stiff board (the paper used 3 mm MDF). Thin sheet will not clutch.');
  return {
    parts,
    assembly: { ...assembly, connectors: new Float32Array(connectors) },
    overlays: {},
    stats: { faces: m.indices.length / 3, islands: U.islands.length, cutEdges: U.seams, flaticulated: flatJoints },
    warnings,
    connectorData: { pinCount: pinPairs * 2, gripLength: t * 2, bracketAngles },
  };
}
