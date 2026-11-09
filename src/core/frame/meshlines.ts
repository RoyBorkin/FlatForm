/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Mesh lines: every edge of a (remeshed) surface becomes a flat bar. Bars
 * stand on edge (radial, like the matchstick lattice) or lie flat in the
 * surface, meet at nodes, and are joined with holes, lacing or printed hubs.
 */
import type { MeshData, MethodResult, Part2D, Path2, Polyline2 } from '../types';
import type { JoineryParams, MaterialParams, MeshLinesParams } from '../params';
import { remesh, edgeLengthForTriangles } from '../mesh/remesh';
import { buildTopology, triNormal } from '../mesh/mesh';
import { pinHoleDiameter } from '../joinery/holes';
import { textPolylines, textWidth } from '../text/hershey';
import { normalizePart, partId } from '../parts';
import { basisMatrix, cross3, dot3, getV, norm3, sub3, tangentFrame, type V3 } from '../math/vec';
import { vertexNormals } from '../mesh/mesh';

function barOutline(len: number, w: number, round: boolean): Path2 {
  if (!round) return [[0, -w / 2], [len, -w / 2], [len, w / 2], [0, w / 2]];
  const r = w / 2;
  const pts: Path2 = [];
  const seg = 12;
  for (let i = 0; i <= seg; i++) {
    const a = -Math.PI / 2 + (i / seg) * Math.PI;
    pts.push([len - r + Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI / 2 + (i / seg) * Math.PI;
    pts.push([r + Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

export function buildMeshLines(surface: MeshData, P: MeshLinesParams, joinery: JoineryParams, material: MaterialParams, onProgress?: (f: number, s: string) => void): MethodResult {
  const warnings: string[] = [];
  const t = material.thickness;
  const m = P.targetFaces > 0 ? remesh(surface, { targetEdge: edgeLengthForTriangles(surface, P.targetFaces), iterations: 4 }) : surface;
  onProgress?.(0.3, 'Edges');
  const topo = buildTopology(m);
  const vn = vertexNormals(m);
  const nE = topo.edgeA.length;
  const holeD = pinHoleDiameter(joinery);
  const w = P.barWidth;
  const radial = P.orientation === 'radial';
  const step = Math.max(0.1, P.lengthStep);
  const parts: Part2D[] = [];
  const byLength = new Map<number, string>();
  let shortest = Infinity;
  const nodeArms: V3[][] = Array.from({ length: m.positions.length / 3 }, () => []);
  for (let e = 0; e < nE; e++) {
    const a = topo.edgeA[e], b = topo.edgeB[e];
    const pa = getV(m.positions, a), pb = getV(m.positions, b);
    const d = sub3(pb, pa);
    const L = Math.hypot(d[0], d[1], d[2]);
    const x = norm3(d);
    // Edge normal: mean of its faces, made square to the edge.
    let n = triNormal(m, topo.edgeT0[e]);
    if (topo.edgeT1[e] >= 0) {
      const n2 = triNormal(m, topo.edgeT1[e]);
      n = [n[0] + n2[0], n[1] + n2[1], n[2] + n2[2]];
    }
    const k = dot3(n, x);
    n = norm3([n[0] - x[0] * k, n[1] - x[1] * k, n[2] - x[2] * k]);
    const side = cross3(n, x); // in the tangent plane
    // Radial: width along the normal, thickness across; flat: the other way round.
    const yAx = radial ? n : side;
    const zAx = cross3(x, yAx);
    const len = L - 2 * P.nodeClearance;
    if (len < w * 0.8) continue;
    shortest = Math.min(shortest, L);
    nodeArms[a].push(x);
    nodeArms[b].push([-x[0], -x[1], -x[2]]);
    const lenKey = Math.round(len / step) * step;
    const cls = byLength.get(lenKey) ?? `${byLength.size + 1}`;
    byLength.set(lenKey, cls);
    const barLen = lenKey;
    // Part frame: x along the bar, y across its width, z through the sheet (0..t).
    // Radial bars hang just inside the surface; flat bars lie just under it.
    const along = P.nodeClearance + (len - barLen) / 2;
    const yC = radial ? -w / 2 : 0;
    const zC = radial ? -t / 2 : -t;
    const o2: V3 = [0, 1, 2].map((i) => pa[i] + x[i] * along + yAx[i] * yC + zAx[i] * zC) as V3;
    const holes = [];
    if (holeD > 0) {
      const inset = Math.max(w / 2, holeD * 1.2);
      if (barLen > inset * 2 + holeD) holes.push({ x: inset, y: 0, r: holeD / 2, label: `N${a + 1}` }, { x: barLen - inset, y: 0, r: holeD / 2, label: `N${b + 1}` });
    }
    const engrave: Polyline2[] = [];
    if (P.labelBars) {
      const label = `${cls}·${e + 1}`;
      const h = Math.min(P.textHeight, w * 0.5);
      if (h > 0.8 && textWidth(label, h) < barLen - 2 * Math.max(w, holeD * 3)) engrave.push(...textPolylines(label, barLen / 2, 0, h, 0));
    }
    const cut = [barOutline(barLen, w, P.endStyle === 'round')];
    parts.push(
      normalizePart(
        {
          id: partId(0, parts.length + 1),
          group: 0,
          groupName: 'Bars',
          cut,
          holes,
          score: [],
          engrave,
          planar: { matrix: basisMatrix(x, yAx, zAx, o2) },
          meta: { type: cls, length: Math.round(barLen * 10) / 10, from: a + 1, to: b + 1 },
        },
        false,
      ),
    );
    if (e % 200 === 0) onProgress?.(0.3 + (0.6 * e) / nE, 'Bars');
  }
  if (!parts.length) warnings.push('Every edge is shorter than the bar width plus the node clearance. Use fewer faces or narrower bars.');
  if (byLength.size > 40) warnings.push(`${byLength.size} different bar lengths. Raise the length step to group them.`);
  // Node hubs: arm directions in each node's tangent frame.
  const hubs: { node: number; dirs: V3[] }[] = [];
  nodeArms.forEach((arms, v) => {
    if (!arms.length) return;
    const nn = getV(vn, v);
    const { t: tx, b: by } = tangentFrame(nn);
    hubs.push({ node: v + 1, dirs: arms.map((d) => [dot3(d, tx), dot3(d, by), dot3(d, nn)] as V3) });
  });
  return {
    parts,
    assembly: { kind: 'planar', thickness: t },
    overlays: {},
    stats: { bars: parts.length, nodes: hubs.length, lengths: byLength.size, shortest: Number.isFinite(shortest) ? Math.round(shortest) : 0 },
    warnings,
    connectorData: { pinCount: hubs.length, gripLength: t, hubs, hubChannel: radial ? { width: t, height: w } : { width: w, height: t } },
  };
}
