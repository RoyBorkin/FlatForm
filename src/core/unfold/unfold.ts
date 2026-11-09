/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Unfolding engine shared by folded panels, paper-craft, minimal joinery and
 * flex hinges. Triangles are unfolded about their shared edges along a
 * spanning tree; a face joins an island only if it does not overlap it and the
 * island still fits the sheet. Optional charts restrict islands to groups of
 * faces (few, large pieces for flexible materials).
 */
import type { MeshData, Path2 } from '../types';
import { buildTopology, triNormal, type Topology } from '../mesh/mesh';
import { DSU } from '../graph/trees';
import { bounds } from '../polygon/polygon';
import { cross3, dot3, getV, sub3, type V2, type V3 } from '../math/vec';
import type { EdgeCtx } from '../joinery/edgeFeatures';

export type Tri2 = [V2, V2, V2];

export function triOverlap(a: Tri2, b: Tri2): boolean {
  const shrink = (t: Tri2): Tri2 => {
    const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
    return t.map(([x, y]) => [cx + (x - cx) * 0.995, cy + (y - cy) * 0.995]) as Tri2;
  };
  const A = shrink(a), B = shrink(b);
  for (const T of [A, B])
    for (let i = 0; i < 3; i++) {
      const p = T[i], q = T[(i + 1) % 3];
      const nx = q[1] - p[1], ny = p[0] - q[0];
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const v of A) {
        const d = v[0] * nx + v[1] * ny;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      for (const v of B) {
        const d = v[0] * nx + v[1] * ny;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA <= minB || maxB <= minA) return false;
    }
  return true;
}

export interface UnfoldOptions {
  strategy: 'flattest' | 'bfs' | 'longest';
  maxIslandFaces: number;
  autoSplit: boolean;
  /** Usable sheet size and how much room to leave around each island for tabs. */
  sheetW: number;
  sheetH: number;
  pad: number;
  /** Optional face → chart id; islands never cross charts. */
  chart?: Int32Array;
}

export interface Unfolded {
  m: MeshData;
  topo: Topology;
  normals: V3[];
  island: Int32Array;
  islands: number[][];
  pos2: Map<string, V2>;
  tri2: Tri2[];
  /** Folds: interior edges whose two faces are laid out side by side. */
  isFold: (e: number) => boolean;
  /** Seam numbers for edges cut between islands (or inside an island but not attached). */
  edgeNumber: Int32Array;
  seams: number;
  overlapSplits: number;
}

export function unfold(m: MeshData, o: UnfoldOptions): Unfolded {
  const topo = buildTopology(m);
  const nt = m.indices.length / 3;
  const P3 = (v: number) => getV(m.positions, v);
  const normals = Array.from({ length: nt }, (_, i) => triNormal(m, i));
  const ne = topo.edgeA.length;
  const chart = o.chart;
  const sameChart = (e: number) => !chart || chart[topo.edgeT0[e]] === chart[topo.edgeT1[e]];
  const weight = new Float64Array(ne);
  for (let e = 0; e < ne; e++) {
    const t0 = topo.edgeT0[e], t1 = topo.edgeT1[e];
    if (t1 < 0) continue;
    const len = Math.hypot(...(sub3(P3(topo.edgeA[e]), P3(topo.edgeB[e])) as [number, number, number]));
    const dih = Math.acos(Math.max(-1, Math.min(1, dot3(normals[t0], normals[t1]))));
    weight[e] = o.strategy === 'flattest' ? dih : o.strategy === 'longest' ? -len : 0;
  }
  const treeEdge = new Uint8Array(ne);
  if (o.strategy === 'bfs') {
    const seen = new Uint8Array(nt);
    for (let s = 0; s < nt; s++) {
      if (seen[s]) continue;
      seen[s] = 1;
      const q = [s];
      while (q.length) {
        const f = q.shift()!;
        for (let k = 0; k < 3; k++) {
          const e = topo.triEdge[f * 3 + k];
          const g = topo.triNeighbor[f * 3 + k];
          if (g >= 0 && !seen[g] && sameChart(e)) {
            seen[g] = 1;
            treeEdge[e] = 1;
            q.push(g);
          }
        }
      }
    }
  } else {
    const order = Array.from({ length: ne }, (_, i) => i).filter((e) => topo.edgeT1[e] >= 0 && sameChart(e));
    order.sort((a, b) => weight[a] - weight[b]);
    const dsu = new DSU(nt);
    for (const e of order) if (dsu.union(topo.edgeT0[e], topo.edgeT1[e])) treeEdge[e] = 1;
  }

  const island = new Int32Array(nt).fill(-1);
  const pos2 = new Map<string, V2>();
  const tri2: Tri2[] = new Array(nt);
  const islands: number[][] = [];
  const fits = (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const w = b.maxX - b.minX + 2 * o.pad, h = b.maxY - b.minY + 2 * o.pad;
    return (w <= o.sheetW && h <= o.sheetH) || (w <= o.sheetH && h <= o.sheetW);
  };
  let overlapSplits = 0;
  let edgeLen = 0;
  for (let e = 0; e < Math.min(ne, 200); e++) edgeLen += Math.hypot(...(sub3(P3(topo.edgeA[e]), P3(topo.edgeB[e])) as [number, number, number]));
  const cell = Math.max(1, (edgeLen / Math.max(1, Math.min(ne, 200))) * 2);
  for (let root = 0; root < nt; root++) {
    if (island[root] >= 0) continue;
    const id = islands.length;
    const faces: number[] = [];
    const [a, b, c] = [m.indices[root * 3], m.indices[root * 3 + 1], m.indices[root * 3 + 2]];
    const pa = P3(a), pb = P3(b), pc = P3(c);
    const lab = Math.hypot(...(sub3(pb, pa) as [number, number, number])) || 1e-6;
    const ex = sub3(pb, pa).map((x) => x / lab) as V3;
    const ey = cross3(normals[root], ex);
    const ac = sub3(pc, pa);
    const place = (f: number, verts: number[], pts: V2[]) => {
      verts.forEach((v, i) => pos2.set(`${f}:${v}`, pts[i]));
      const ord = [m.indices[f * 3], m.indices[f * 3 + 1], m.indices[f * 3 + 2]];
      tri2[f] = ord.map((v) => pos2.get(`${f}:${v}`)!) as Tri2;
      island[f] = id;
      faces.push(f);
    };
    place(root, [a, b, c], [[0, 0], [lab, 0], [dot3(ac, ex), dot3(ac, ey)]]);
    let bb = bounds([tri2[root]]);
    const grid = new Map<string, number[]>();
    const addGrid = (f: number) => {
      const tb = bounds([tri2[f]]);
      for (let x = Math.floor(tb.minX / cell); x <= Math.floor(tb.maxX / cell); x++)
        for (let y = Math.floor(tb.minY / cell); y <= Math.floor(tb.maxY / cell); y++) {
          const k = `${x},${y}`;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k)!.push(f);
        }
    };
    addGrid(root);
    const queue = [root];
    while (queue.length) {
      const f = queue.shift()!;
      for (let k = 0; k < 3; k++) {
        const e = topo.triEdge[f * 3 + k];
        const g = topo.triNeighbor[f * 3 + k];
        if (g < 0 || !treeEdge[e] || island[g] >= 0) continue;
        if (faces.length >= o.maxIslandFaces) continue;
        const va = m.indices[f * 3 + k], vb = m.indices[f * 3 + ((k + 1) % 3)];
        const vc = [m.indices[g * 3], m.indices[g * 3 + 1], m.indices[g * 3 + 2]].find((v) => v !== va && v !== vb)!;
        const A = pos2.get(`${f}:${va}`)!, B = pos2.get(`${f}:${vb}`)!;
        const dab = Math.hypot(B[0] - A[0], B[1] - A[1]);
        const dac = Math.hypot(...(sub3(P3(vc), P3(va)) as [number, number, number]));
        const dbc = Math.hypot(...(sub3(P3(vc), P3(vb)) as [number, number, number]));
        const x = (dab * dab + dac * dac - dbc * dbc) / (2 * dab);
        const h = Math.sqrt(Math.max(0, dac * dac - x * x));
        const ux = (B[0] - A[0]) / dab, uy = (B[1] - A[1]) / dab;
        const C: V2 = [A[0] + ux * x + uy * h, A[1] + uy * x - ux * h];
        const cand: Tri2 = [A, B, C];
        const cb = bounds([cand]);
        let clash = false;
        for (let gx = Math.floor(cb.minX / cell); gx <= Math.floor(cb.maxX / cell) && !clash; gx++)
          for (let gy = Math.floor(cb.minY / cell); gy <= Math.floor(cb.maxY / cell) && !clash; gy++)
            for (const q of grid.get(`${gx},${gy}`) ?? [])
              if (q !== f && triOverlap(cand, tri2[q])) {
                clash = true;
                break;
              }
        const nb = { minX: Math.min(bb.minX, cb.minX), minY: Math.min(bb.minY, cb.minY), maxX: Math.max(bb.maxX, cb.maxX), maxY: Math.max(bb.maxY, cb.maxY) };
        if (clash) {
          overlapSplits++;
          if (o.autoSplit) continue;
        }
        if (!fits(nb)) continue;
        bb = nb;
        place(g, [va, vb, vc], [A, B, C]);
        addGrid(g);
        queue.push(g);
      }
    }
    islands.push(faces);
  }

  const isFold = (e: number) => {
    const t0 = topo.edgeT0[e], t1 = topo.edgeT1[e];
    if (t1 < 0 || island[t0] !== island[t1]) return false;
    const a = topo.edgeA[e], b = topo.edgeB[e];
    const pa0 = pos2.get(`${t0}:${a}`), pa1 = pos2.get(`${t1}:${a}`), pb0 = pos2.get(`${t0}:${b}`), pb1 = pos2.get(`${t1}:${b}`);
    if (!pa0 || !pa1 || !pb0 || !pb1) return false;
    return Math.hypot(pa0[0] - pa1[0], pa0[1] - pa1[1]) < 1e-3 && Math.hypot(pb0[0] - pb1[0], pb0[1] - pb1[1]) < 1e-3;
  };
  const edgeNumber = new Int32Array(ne).fill(0);
  let seams = 0;
  for (let e = 0; e < ne; e++) if (topo.edgeT1[e] >= 0 && !isFold(e)) edgeNumber[e] = ++seams;
  return { m, topo, normals, island, islands, pos2, tri2, isFold, edgeNumber, seams, overlapSplits };
}

/** Edge-local frame for edge k of face f in its island layout. */
export function edgeContext(U: Unfolded, f: number, k: number, thickness: number): EdgeCtx & { e: number; g: number; a: number; b: number; u: V2 } {
  const { topo, pos2, tri2, normals, m } = U;
  const e = topo.triEdge[f * 3 + k];
  const g = topo.triNeighbor[f * 3 + k];
  const a = topo.edgeA[e], b = topo.edgeB[e];
  const A = pos2.get(`${f}:${a}`)!, B = pos2.get(`${f}:${b}`)!;
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1e-6;
  const u: V2 = [(B[0] - A[0]) / len, (B[1] - A[1]) / len];
  const tr = tri2[f];
  const cx = (tr[0][0] + tr[1][0] + tr[2][0]) / 3, cy = (tr[0][1] + tr[1][1] + tr[2][1]) / 3;
  let out: V2 = [u[1], -u[0]];
  if ((cx - A[0]) * out[0] + (cy - A[1]) * out[1] > 0) out = [-out[0], -out[1]];
  let foldAngle = 0, convex = true;
  if (g >= 0) {
    foldAngle = Math.acos(Math.max(-1, Math.min(1, dot3(normals[f], normals[g]))));
    convex = dot3(cross3(normals[f], normals[g]), sub3(getV(m.positions, b), getV(m.positions, a))) > 0;
  }
  return {
    e,
    g,
    a,
    b,
    u,
    A,
    B,
    len,
    toXY: (s, n) => [A[0] + u[0] * s + out[0] * n, A[1] + u[1] * s + out[1] * n],
    male: g < 0 ? true : f < g,
    foldAngle,
    convex,
    num: U.edgeNumber[e],
    thickness,
  };
}

export type { Path2 };
