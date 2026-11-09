/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/**
 * Stretch-tolerant flattening for flexible materials (fabric, felt, leather,
 * thin plastic). Each disc-shaped chart is flattened in one piece with least
 * squares conformal maps (LSCM, Lévy et al. 2002), solved with conjugate
 * gradients. A chart that is not a disc, flips a triangle, overlaps itself or
 * outgrows the sheet keeps the exact tree unfolding instead.
 */
import type { MeshData } from '../types';
import { getV, sub3, cross3, dot3, norm3, type V2 } from '../math/vec';
import { bounds } from '../polygon/polygon';
import { triOverlap, type Tri2, type Unfolded } from './unfold';

/** Solve min |A x − b|² by CG on the normal equations. Rows: sparse (col, val) lists. */
function leastSquares(rows: { c: number[]; v: number[]; b: number }[], n: number, iters = 2000): Float64Array {
  const x = new Float64Array(n);
  const Ax = (p: Float64Array) => rows.map((r) => r.c.reduce((s, c, i) => s + r.v[i] * p[c], 0));
  const AtY = (y: number[]) => {
    const out = new Float64Array(n);
    rows.forEach((r, k) => r.c.forEach((c, i) => (out[c] += r.v[i] * y[k])));
    return out;
  };
  const r = AtY(rows.map((row) => row.b));
  const p = r.slice();
  let rr = r.reduce((s, v) => s + v * v, 0);
  const tol = rr * 1e-14;
  for (let it = 0; it < iters && rr > tol; it++) {
    const Ap = AtY(Ax(p));
    const pAp = p.reduce((s, v, i) => s + v * Ap[i], 0) || 1e-30;
    const a = rr / pAp;
    for (let i = 0; i < n; i++) {
      x[i] += a * p[i];
      r[i] -= a * Ap[i];
    }
    const rr2 = r.reduce((s, v) => s + v * v, 0);
    const beta = rr2 / rr;
    rr = rr2;
    for (let i = 0; i < n; i++) p[i] = r[i] + beta * p[i];
  }
  return x;
}

/** LSCM of a set of faces. Returns 2D positions per mesh vertex, or null. */
export function lscm(m: MeshData, faces: number[]): Map<number, V2> | null {
  const local = new Map<number, number>();
  for (const f of faces) for (let k = 0; k < 3; k++) {
    const v = m.indices[f * 3 + k];
    if (!local.has(v)) local.set(v, local.size);
  }
  const verts = [...local.keys()];
  const n = verts.length;
  if (n < 3) return null;
  // Pin the two vertices farthest apart.
  const P = (v: number) => getV(m.positions, v);
  let a = verts[0], b = verts[0], best = -1;
  for (let pass = 0; pass < 2; pass++) {
    best = -1;
    for (const v of verts) {
      const d = Math.hypot(...(sub3(P(v), P(a)) as [number, number, number]));
      if (d > best) (best = d), (b = v);
    }
    if (pass === 0) a = b;
  }
  if (a === b) return null;
  const pinned = new Map<number, V2>([
    [local.get(a)!, [0, 0]],
    [local.get(b)!, [best, 0]],
  ]);
  // Unknowns: u, v for every free vertex.
  const free = new Map<number, number>();
  for (let i = 0; i < n; i++) if (!pinned.has(i)) free.set(i, free.size);
  const rows: { c: number[]; v: number[]; b: number }[] = [];
  for (const f of faces) {
    const vi = [0, 1, 2].map((k) => m.indices[f * 3 + k]);
    const p0 = P(vi[0]), p1 = P(vi[1]), p2 = P(vi[2]);
    const e1 = sub3(p1, p0), e2 = sub3(p2, p0);
    const nrm = cross3(e1, e2);
    const area2 = Math.hypot(nrm[0], nrm[1], nrm[2]);
    if (area2 < 1e-12) continue;
    const x = norm3(e1), y = cross3(norm3(nrm), x);
    const q: V2[] = [[0, 0], [dot3(e1, x), dot3(e1, y)], [dot3(e2, x), dot3(e2, y)]];
    const s = 1 / Math.sqrt(area2);
    // W_j = (q_{j+2} − q_{j+1}) / sqrt(2A), as a complex number.
    const W = [0, 1, 2].map((j) => {
      const A = q[(j + 1) % 3], B = q[(j + 2) % 3];
      return [(B[0] - A[0]) * s, (B[1] - A[1]) * s] as V2;
    });
    const re = { c: [] as number[], v: [] as number[], b: 0 };
    const im = { c: [] as number[], v: [] as number[], b: 0 };
    for (let j = 0; j < 3; j++) {
      const li = local.get(vi[j])!;
      const [wr, wi] = W[j];
      // Re(W·U) = wr·u − wi·v ; Im(W·U) = wi·u + wr·v
      const pin = pinned.get(li);
      if (pin) {
        re.b -= wr * pin[0] - wi * pin[1];
        im.b -= wi * pin[0] + wr * pin[1];
      } else {
        const k = free.get(li)!;
        re.c.push(2 * k, 2 * k + 1);
        re.v.push(wr, -wi);
        im.c.push(2 * k, 2 * k + 1);
        im.v.push(wi, wr);
      }
    }
    rows.push(re, im);
  }
  const sol = leastSquares(rows, free.size * 2, Math.max(400, free.size * 6));
  const out = new Map<number, V2>();
  for (let i = 0; i < n; i++) {
    const pin = pinned.get(i);
    const k = free.get(i);
    out.set(verts[i], pin ?? [sol[2 * k!], sol[2 * k! + 1]]);
  }
  return out;
}

function isDisc(m: MeshData, U: Unfolded, faces: number[]): boolean {
  const set = new Set(faces);
  const verts = new Set<number>();
  const edges = new Set<number>();
  let boundary = 0;
  for (const f of faces)
    for (let k = 0; k < 3; k++) {
      verts.add(m.indices[f * 3 + k]);
      const e = U.topo.triEdge[f * 3 + k];
      if (edges.has(e)) continue;
      edges.add(e);
      const g = U.topo.triNeighbor[f * 3 + k];
      if (g < 0 || !set.has(g)) boundary++;
    }
  // Euler characteristic of a disc is 1, and it needs a boundary.
  return boundary > 0 && verts.size - edges.size + faces.length === 1;
}

/**
 * Replace the tree unfolding of each chart with one stretch-tolerant piece
 * where possible. Mutates and returns U; reports the worst edge stretch.
 */
export function flattenCharts(U: Unfolded, chart: Int32Array, sheetW: number, sheetH: number, pad: number): { U: Unfolded; stretch: number; flattened: number } {
  const m = U.m;
  const nt = m.indices.length / 3;
  const byChart = new Map<number, number[]>();
  for (let f = 0; f < nt; f++) {
    const c = chart[f];
    if (!byChart.has(c)) byChart.set(c, []);
    byChart.get(c)!.push(f);
  }
  let stretch = 0;
  let flattened = 0;
  let nextId = Math.max(...U.island) + 1;
  for (const faces of byChart.values()) {
    const islandsHere = new Set(faces.map((f) => U.island[f]));
    if (islandsHere.size <= 1 || !isDisc(m, U, faces)) continue;
    const uv = lscm(m, faces);
    if (!uv) continue;
    // Uniform scale so the flat area matches the 3D area; mirror if needed.
    let a2 = 0, a3 = 0, signed = 0;
    for (const f of faces) {
      const [p, q, r] = [0, 1, 2].map((k) => uv.get(m.indices[f * 3 + k])!);
      const s = ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / 2;
      signed += s;
      a2 += Math.abs(s);
      const P0 = getV(m.positions, m.indices[f * 3]), P1 = getV(m.positions, m.indices[f * 3 + 1]), P2 = getV(m.positions, m.indices[f * 3 + 2]);
      const c = cross3(sub3(P1, P0), sub3(P2, P0));
      a3 += Math.hypot(c[0], c[1], c[2]) / 2;
    }
    const k = Math.sqrt(a3 / Math.max(1e-9, a2));
    const mir = signed < 0 ? -1 : 1;
    for (const [v, p] of uv) uv.set(v, [p[0] * k, p[1] * k * mir]);
    const tris: Tri2[] = faces.map((f) => [0, 1, 2].map((j) => uv.get(m.indices[f * 3 + j])!) as Tri2);
    // Reject flips, overlaps and pieces that do not fit the sheet.
    if (tris.some((t) => (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) <= 0)) continue;
    const bb = bounds(tris);
    const w = bb.maxX - bb.minX + 2 * pad, h = bb.maxY - bb.minY + 2 * pad;
    if (!((w <= sheetW && h <= sheetH) || (w <= sheetH && h <= sheetW))) continue;
    const cell = Math.max(1, Math.sqrt(a3 / faces.length) * 2);
    const grid = new Map<string, number[]>();
    let clash = false;
    tris.forEach((t, i) => {
      if (clash) return;
      const tb = bounds([t]);
      const near = new Set<number>();
      for (let x = Math.floor(tb.minX / cell); x <= Math.floor(tb.maxX / cell); x++)
        for (let y = Math.floor(tb.minY / cell); y <= Math.floor(tb.maxY / cell); y++) {
          const key = `${x},${y}`;
          for (const j of grid.get(key) ?? []) near.add(j);
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key)!.push(i);
        }
      for (const j of near) {
        // Neighbours that share a vertex touch by construction.
        const shared = [0, 1, 2].some((a) => [0, 1, 2].some((b) => m.indices[faces[i] * 3 + a] === m.indices[faces[j] * 3 + b]));
        if (!shared && triOverlap(t, tris[j])) {
          clash = true;
          return;
        }
      }
    });
    if (clash) continue;
    const id = nextId++;
    faces.forEach((f, i) => {
      for (let j = 0; j < 3; j++) U.pos2.set(`${f}:${m.indices[f * 3 + j]}`, tris[i][j]);
      U.tri2[f] = tris[i];
      U.island[f] = id;
      for (let j = 0; j < 3; j++) {
        const va = m.indices[f * 3 + j], vb = m.indices[f * 3 + ((j + 1) % 3)];
        const l3 = Math.hypot(...(sub3(getV(m.positions, va), getV(m.positions, vb)) as [number, number, number]));
        const l2 = Math.hypot(tris[i][(j + 1) % 3][0] - tris[i][j][0], tris[i][(j + 1) % 3][1] - tris[i][j][1]);
        stretch = Math.max(stretch, Math.abs(l2 / Math.max(1e-9, l3) - 1));
      }
    });
    flattened++;
  }
  // Renumber islands compactly and rebuild seam numbers.
  const remap = new Map<number, number>();
  const islands: number[][] = [];
  for (let f = 0; f < nt; f++) {
    const old = U.island[f];
    if (!remap.has(old)) {
      remap.set(old, islands.length);
      islands.push([]);
    }
    const id = remap.get(old)!;
    U.island[f] = id;
    islands[id].push(f);
  }
  U.islands = islands;
  let seams = 0;
  U.edgeNumber.fill(0);
  for (let e = 0; e < U.topo.edgeA.length; e++) if (U.topo.edgeT1[e] >= 0 && !U.isFold(e)) U.edgeNumber[e] = ++seams;
  U.seams = seams;
  return { U, stretch, flattened };
}
