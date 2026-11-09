/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Sticks: every mesh edge becomes a stick (dowel, toothpick, tube, square
 * profile, or a laser-cut flat strip), and every node gets a printed junction
 * hub with a socket at each stick's real angle. Sticks are shortened by the
 * hub's core at both ends, rounded to a length step and packed into stock.
 */
import type { JunctionArm, MeshData, MethodResult, Part2D, Polyline2 } from '../types';
import type { JoineryParams, MaterialParams, SticksParams } from '../params';
import { remesh, edgeLengthForTriangles } from '../mesh/remesh';
import { buildTopology, vertexNormals } from '../mesh/mesh';
import { basisMatrix, cross3, dot3, getV, norm3, sub3, type V3 } from '../math/vec';
import { makeJunction } from '../joinery/junction';
import { normalizePart, partId } from '../parts';
import { textPolylines, textWidth } from '../text/hershey';

/** First-fit decreasing: how many stock lengths the cut list needs. */
export function packStock(lengths: number[], stock: number, kerf = 2): { pieces: number; waste: number } {
  if (stock <= 0) return { pieces: 0, waste: 0 };
  const bins: number[] = [];
  for (const l of [...lengths].sort((a, b) => b - a)) {
    if (l > stock) {
      bins.push(0); // longer than the stock: needs its own (joined) piece
      continue;
    }
    const i = bins.findIndex((free) => free >= l + kerf);
    if (i >= 0) bins[i] -= l + kerf;
    else bins.push(stock - l - kerf);
  }
  return { pieces: bins.length, waste: bins.reduce((s, b) => s + Math.max(0, b), 0) };
}

const classLabel = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);

export function buildSticks(surface: MeshData, P: SticksParams, J: JoineryParams, material: MaterialParams, onProgress?: (f: number, s: string) => void): MethodResult {
  const warnings: string[] = [];
  const t = material.thickness;
  const m = P.targetFaces > 0 ? remesh(surface, { targetEdge: edgeLengthForTriangles(surface, P.targetFaces), iterations: 4 }) : surface;
  onProgress?.(0.3, 'Sticks');
  const topo = buildTopology(m);
  const vn = vertexNormals(m);
  const nv = m.positions.length / 3;
  const nE = topo.edgeA.length;
  const flat = P.profile === 'flat';
  const edgesOf: number[][] = Array.from({ length: nv }, () => []);
  for (let e = 0; e < nE; e++) {
    edgesOf[topo.edgeA[e]].push(e);
    edgesOf[topo.edgeB[e]].push(e);
  }
  // Member cross-section: flat strips stand on edge (width along the surface normal).
  const armOf = (dir: V3, normal: V3): JunctionArm => {
    const k = dot3(normal, dir);
    let up = norm3([normal[0] - dir[0] * k, normal[1] - dir[1] * k, normal[2] - dir[2] * k]);
    if (!Number.isFinite(up[0])) up = [0, 0, 1];
    if (flat) return { dir, up, shape: 'slot', w: t, h: P.size };
    if (P.profile === 'square') return { dir, up, shape: 'square', w: P.size, h: P.size };
    return { dir, up, shape: 'round', w: P.size, h: P.size };
  };

  // Junctions first: each stick loses its hub's core at both ends.
  const useHubs = J.kind === 'junction';
  const core = new Float64Array(nv);
  const junctions = [];
  if (useHubs)
    for (let v = 0; v < nv; v++) {
      if (!edgesOf[v].length) continue;
      const p = getV(m.positions, v), n = getV(vn, v);
      const arms = edgesOf[v].map((e) => {
        const o = topo.edgeA[e] === v ? topo.edgeB[e] : topo.edgeA[e];
        return armOf(norm3(sub3(getV(m.positions, o), p)), n);
      });
      const h = makeJunction(`N${v + 1}`, p, n, arms, J.junction);
      core[v] = h.core;
      junctions.push(h);
    }
  else if (J.kind === 'none') for (let v = 0; v < nv; v++) core[v] = P.size / 2; // butt joints, glued
  onProgress?.(0.55, 'Cut list');

  const step = Math.max(0.1, P.lengthStep);
  const rods: number[] = [];
  const lengths: number[] = [];
  const byLen = new Map<number, number>();
  const stickLen: { e: number; len: number }[] = [];
  let tooShort = 0;
  for (let e = 0; e < nE; e++) {
    const a = topo.edgeA[e], b = topo.edgeB[e];
    const pa = getV(m.positions, a), pb = getV(m.positions, b);
    const d = sub3(pb, pa);
    const L = Math.hypot(d[0], d[1], d[2]);
    const x = norm3(d);
    // With hubs the stick runs to the bottom of both sockets, which sit at the core radius.
    const raw = L - core[a] - core[b];
    const len = Math.round(raw / step) * step;
    if (len < Math.max(P.size, 2)) {
      tooShort++;
      continue;
    }
    lengths.push(len);
    byLen.set(len, (byLen.get(len) ?? 0) + 1);
    stickLen.push({ e, len });
    const inset = (L - len) / 2;
    rods.push(pa[0] + x[0] * inset, pa[1] + x[1] * inset, pa[2] + x[2] * inset, pb[0] - x[0] * inset, pb[1] - x[1] * inset, pb[2] - x[2] * inset);
  }
  if (tooShort) warnings.push(`${tooShort} edge${tooShort > 1 ? 's are' : ' is'} too short for a stick once the hubs are in place. Use fewer faces or thinner sticks.`);
  const classes = [...byLen.keys()].sort((a, b) => b - a);
  const labelOf = new Map(classes.map((l, i) => [l, classLabel(i)]));
  if (classes.length > 60) warnings.push(`${classes.length} different stick lengths. Raise the length step to group them.`);

  const parts: Part2D[] = [];
  if (flat) {
    // Flat strips, cut from the sheet, standing on edge in the hubs.
    for (const { e, len } of stickLen) {
      const a = topo.edgeA[e], b = topo.edgeB[e];
      const pa = getV(m.positions, a), pb = getV(m.positions, b);
      const L = Math.hypot(...(sub3(pb, pa) as [number, number, number]));
      const x = norm3(sub3(pb, pa));
      const n = norm3([vn[a * 3] + vn[b * 3], vn[a * 3 + 1] + vn[b * 3 + 1], vn[a * 3 + 2] + vn[b * 3 + 2]]);
      const k = dot3(n, x);
      const y = norm3([n[0] - x[0] * k, n[1] - x[1] * k, n[2] - x[2] * k]);
      const z = cross3(x, y);
      const inset = (L - len) / 2;
      const o: V3 = [0, 1, 2].map((i) => pa[i] + x[i] * inset - y[i] * (P.size / 2) - z[i] * (t / 2)) as V3;
      const label = `${labelOf.get(len)}${parts.length + 1}`;
      const engrave: Polyline2[] = [];
      const th = Math.min(P.textHeight, P.size * 0.55);
      if (P.labelSticks && th > 0.8 && textWidth(label, th) < len * 0.6) engrave.push(...textPolylines(label, len / 2, P.size / 2, th, 0));
      parts.push(
        normalizePart(
          {
            id: partId(0, parts.length + 1),
            group: 0,
            groupName: 'Strips',
            cut: [[[0, 0], [len, 0], [len, P.size], [0, P.size]]],
            holes: [],
            score: [],
            engrave,
            planar: { matrix: basisMatrix(x, y, z, o) },
            meta: { label, length: len },
          },
          false,
        ),
      );
    }
  }
  const sticks = classes.map((l) => ({ label: labelOf.get(l)!, length: l, count: byLen.get(l)! }));
  const stock = flat ? { pieces: 0, waste: 0 } : packStock(lengths, P.stockLength);
  const longest = Math.max(0, ...lengths);
  if (!flat && P.stockLength > 0 && longest > P.stockLength) warnings.push(`The longest stick (${Math.round(longest)} mm) is longer than the ${P.stockLength} mm stock.`);
  const total = lengths.reduce((s, l) => s + l, 0);
  const hubs: number[] = [];
  for (const h of junctions) hubs.push(...h.pos, h.core + J.junction.wall);
  return {
    parts,
    assembly: {
      kind: 'planar',
      thickness: t,
      rods: flat ? undefined : { data: new Float32Array(rods), profile: P.profile === 'square' ? 'square' : P.profile === 'tube' ? 'tube' : 'round', size: P.size },
      hubs: hubs.length ? new Float32Array(hubs) : undefined,
    },
    overlays: {},
    stats: { sticks: lengths.length, nodes: junctions.length || nv, lengths: classes.length, totalLength: Math.round(total), stockPieces: stock.pieces },
    warnings,
    kit: flat ? undefined : { sticks, stickProfile: P.profile === 'tube' ? `Ø${P.size}/${P.inner} tube` : P.profile === 'square' ? `${P.size} × ${P.size} square` : `Ø${P.size} round`, stickStock: { length: P.stockLength, ...stock } },
    connectorData: { pinCount: junctions.length, gripLength: t, junctions: useHubs ? junctions : undefined },
  };
}
