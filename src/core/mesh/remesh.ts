/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/**
 * Isotropic remeshing (after Botsch & Kobbelt 2004), written as a sequence of
 * whole-mesh passes on an indexed mesh. Each pass rebuilds adjacency, which
 * keeps the code simple and robust; vertex locking inside a pass guarantees
 * that every local operation sees a valid neighbourhood.
 */
import type { MeshData } from '../types';
import { buildTopology, compact, surfaceArea, vertexNormals } from './mesh';
import { MeshProjector } from './project';

export interface RemeshOptions {
  targetEdge: number;
  iterations: number;
  /** Reference surface to project onto (defaults to the input mesh). */
  reference?: MeshData;
  onProgress?: (f: number) => void;
}

export function edgeLengthForTriangles(m: MeshData, triangles: number): number {
  const area = surfaceArea(m);
  return Math.sqrt((4 * area) / (Math.sqrt(3) * Math.max(4, triangles)));
}

export function remesh(input: MeshData, opt: RemeshOptions): MeshData {
  const L = opt.targetEdge;
  const hi = (4 / 3) * L;
  const lo = (4 / 5) * L;
  const projector = new MeshProjector(opt.reference ?? input);
  let m = input;
  for (let it = 0; it < opt.iterations; it++) {
    for (let k = 0; k < 6; k++) {
      const r = splitLong(m, hi);
      m = r.mesh;
      if (!r.changed) break;
    }
    for (let k = 0; k < 40; k++) {
      const r = collapseShort(m, lo, hi);
      m = r.mesh;
      if (r.count < Math.max(2, (m.indices.length / 3) * 0.002)) break;
    }
    m = flipEdges(m);
    m = flipEdges(m);
    m = relaxTangential(m, 0.6);
    m = projector.project(m);
    opt.onProgress?.((it + 1) / opt.iterations);
  }
  return m;
}

// ------------------------------------------------------------------ split

function splitLong(m: MeshData, hi: number): { mesh: MeshData; changed: boolean } {
  const p = m.positions;
  const nv = p.length / 3;
  const hi2 = hi * hi;
  const mid = new Map<number, number>();
  const pos: number[] = Array.from(p);
  const key = (a: number, b: number) => (a < b ? a * nv + b : b * nv + a);
  const len2 = (a: number, b: number) => {
    const dx = p[a * 3] - p[b * 3], dy = p[a * 3 + 1] - p[b * 3 + 1], dz = p[a * 3 + 2] - p[b * 3 + 2];
    return dx * dx + dy * dy + dz * dz;
  };
  const idx = m.indices;
  // Mark long edges.
  for (let t = 0; t < idx.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e], b = idx[t + ((e + 1) % 3)];
      const k = key(a, b);
      if (!mid.has(k) && len2(a, b) > hi2) {
        mid.set(k, pos.length / 3);
        pos.push((p[a * 3] + p[b * 3]) / 2, (p[a * 3 + 1] + p[b * 3 + 1]) / 2, (p[a * 3 + 2] + p[b * 3 + 2]) / 2);
      }
    }
  if (mid.size === 0) return { mesh: m, changed: false };
  const out: number[] = [];
  const P = (i: number) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const d2 = (a: number, b: number) => {
    const A = P(a), B = P(b);
    return (A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]];
    const mm = [0, 1, 2].map((e) => mid.get(key(v[e], v[(e + 1) % 3])) ?? -1);
    const count = mm.filter((x) => x >= 0).length;
    if (count === 0) out.push(v[0], v[1], v[2]);
    else if (count === 3) {
      out.push(v[0], mm[0], mm[2], mm[0], v[1], mm[1], mm[2], mm[1], v[2], mm[0], mm[1], mm[2]);
    } else if (count === 1) {
      const e = mm.findIndex((x) => x >= 0);
      const a = v[e], b = v[(e + 1) % 3], c = v[(e + 2) % 3], x = mm[e];
      out.push(a, x, c, x, b, c);
    } else {
      // Two marked edges: rotate so the unmarked edge is e=2 (c→a).
      const free = mm.findIndex((x) => x < 0);
      const r = (free + 1) % 3; // first marked edge index
      const a = v[r], b = v[(r + 1) % 3], c = v[(r + 2) % 3];
      const mab = mm[r], mbc = mm[(r + 1) % 3];
      out.push(mab, b, mbc);
      if (d2(a, mbc) < d2(mab, c)) out.push(a, mab, mbc, a, mbc, c);
      else out.push(a, mab, c, mab, mbc, c);
    }
  }
  return { mesh: { positions: new Float32Array(pos), indices: new Uint32Array(out) }, changed: true };
}

// ------------------------------------------------------------------ collapse

function collapseShort(m: MeshData, lo: number, hi: number): { mesh: MeshData; count: number } {
  const topo = buildTopology(m);
  const p = m.positions.slice();
  const nv = p.length / 3;
  const ne = topo.edgeA.length;
  const lens = new Float64Array(ne);
  const cand: number[] = [];
  for (let e = 0; e < ne; e++) {
    const a = topo.edgeA[e], b = topo.edgeB[e];
    const l = Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
    lens[e] = l;
    if (l < lo) cand.push(e);
  }
  cand.sort((x, y) => lens[x] - lens[y]);
  const locked = new Uint8Array(nv);
  const rep = new Int32Array(nv);
  for (let i = 0; i < nv; i++) rep[i] = i;
  const idx = m.indices;
  const hi2 = hi * hi;
  let count = 0;

  const triNormalWith = (t: number, from: number, P: number[]) => {
    const q = [0, 1, 2].map((k) => {
      const v = idx[t * 3 + k];
      return v === from ? P : [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]];
    });
    const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], uz = q[1][2] - q[0][2];
    const vx = q[2][0] - q[0][0], vy = q[2][1] - q[0][1], vz = q[2][2] - q[0][2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };

  for (const e of cand) {
    const a0 = topo.edgeA[e], b0 = topo.edgeB[e];
    if (locked[a0] || locked[b0]) continue;
    const isBoundaryEdge = topo.edgeT1[e] === -1;
    const ba = topo.boundaryVertex[a0], bb = topo.boundaryVertex[b0];
    if (ba && bb && !isBoundaryEdge) continue;
    // keep = surviving vertex, gone = removed vertex
    let keep = a0, gone = b0;
    let P: number[];
    if (ba && !bb) P = [p[a0 * 3], p[a0 * 3 + 1], p[a0 * 3 + 2]];
    else if (bb && !ba) {
      keep = b0;
      gone = a0;
      P = [p[b0 * 3], p[b0 * 3 + 1], p[b0 * 3 + 2]];
    } else P = [(p[a0 * 3] + p[b0 * 3]) / 2, (p[a0 * 3 + 1] + p[b0 * 3 + 1]) / 2, (p[a0 * 3 + 2] + p[b0 * 3 + 2]) / 2];

    // Link condition.
    const na = topo.vertexNeighbors[a0], nb = topo.vertexNeighbors[b0];
    const setA = new Set(na);
    let common = 0;
    for (const x of nb) if (setA.has(x)) common++;
    if (common !== (isBoundaryEdge ? 1 : 2)) continue;
    if (!ba && !bb && na.length + nb.length - 4 < 3) continue;

    // No new long edges.
    let ok = true;
    for (const w of [...na, ...nb]) {
      if (w === a0 || w === b0) continue;
      const d2 = (p[w * 3] - P[0]) ** 2 + (p[w * 3 + 1] - P[1]) ** 2 + (p[w * 3 + 2] - P[2]) ** 2;
      if (d2 > hi2) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    // No flipped triangles.
    for (const v of [a0, b0]) {
      for (const t of topo.vertexTris[v]) {
        const tv = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
        if (tv.includes(a0) && tv.includes(b0)) continue;
        const before = triNormalWith(t, -1, P);
        const after = triNormalWith(t, v, P);
        if (before[0] * after[0] + before[1] * after[1] + before[2] * after[2] < 0.3) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
    if (!ok) continue;

    rep[gone] = keep;
    p[keep * 3] = P[0];
    p[keep * 3 + 1] = P[1];
    p[keep * 3 + 2] = P[2];
    locked[a0] = locked[b0] = 1;
    for (const w of na) locked[w] = 1;
    for (const w of nb) locked[w] = 1;
    count++;
  }
  if (count === 0) return { mesh: m, count };
  const out: number[] = [];
  const seen = new Set<string>();
  for (let t = 0; t < idx.length; t += 3) {
    const a = rep[idx[t]], b = rep[idx[t + 1]], c = rep[idx[t + 2]];
    if (a === b || b === c || a === c) continue;
    const k = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a, b, c);
  }
  return { mesh: compact({ positions: p, indices: new Uint32Array(out) }), count };
}

// ------------------------------------------------------------------ flip

function flipEdges(m: MeshData): MeshData {
  const topo = buildTopology(m);
  const p = m.positions;
  const idx = m.indices.slice();
  const nv = p.length / 3;
  const nbr: Set<number>[] = topo.vertexNeighbors.map((n) => new Set(n));
  const target = (v: number) => (topo.boundaryVertex[v] ? 4 : 6);
  const touched = new Uint8Array(idx.length / 3);
  const normal = (a: number, b: number, c: number) => {
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  void nv;
  for (let e = 0; e < topo.edgeA.length; e++) {
    const t0 = topo.edgeT0[e], t1 = topo.edgeT1[e];
    if (t1 < 0 || touched[t0] || touched[t1]) continue;
    const ea = topo.edgeA[e], eb = topo.edgeB[e];
    // Orient: t0 contains a→b.
    let a = ea, b = eb, c = -1, d = -1;
    for (let k = 0; k < 3; k++) {
      const x = idx[t0 * 3 + k], y = idx[t0 * 3 + ((k + 1) % 3)];
      if ((x === ea && y === eb) || (x === eb && y === ea)) {
        a = x;
        b = y;
        c = idx[t0 * 3 + ((k + 2) % 3)];
      }
    }
    for (let k = 0; k < 3; k++) {
      const x = idx[t1 * 3 + k];
      if (x !== a && x !== b) d = x;
    }
    if (c < 0 || d < 0 || c === d || nbr[c].has(d)) continue;
    const va = nbr[a].size, vb = nbr[b].size, vc = nbr[c].size, vd = nbr[d].size;
    const before = Math.abs(va - target(a)) + Math.abs(vb - target(b)) + Math.abs(vc - target(c)) + Math.abs(vd - target(d));
    const after = Math.abs(va - 1 - target(a)) + Math.abs(vb - 1 - target(b)) + Math.abs(vc + 1 - target(c)) + Math.abs(vd + 1 - target(d));
    if (after >= before) continue;
    if (va <= 3 || vb <= 3) continue;
    const n0 = normal(a, b, c), n1 = normal(b, a, d);
    if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0.5) continue; // keep creases
    const m0 = normal(a, d, c), m1 = normal(d, b, c);
    const avg = [n0[0] + n1[0], n0[1] + n1[1], n0[2] + n1[2]];
    if (m0[0] * avg[0] + m0[1] * avg[1] + m0[2] * avg[2] < 0.4) continue;
    if (m1[0] * avg[0] + m1[1] * avg[1] + m1[2] * avg[2] < 0.4) continue;
    idx[t0 * 3] = a; idx[t0 * 3 + 1] = d; idx[t0 * 3 + 2] = c;
    idx[t1 * 3] = d; idx[t1 * 3 + 1] = b; idx[t1 * 3 + 2] = c;
    touched[t0] = touched[t1] = 1;
    nbr[a].delete(b); nbr[b].delete(a);
    nbr[c].add(d); nbr[d].add(c);
  }
  return { positions: p, indices: idx };
}

// ------------------------------------------------------------------ smooth

/** Move interior vertices toward their neighbour centroid, within the tangent plane. */
export function relaxTangential(m: MeshData, lambda: number): MeshData {
  const topo = buildTopology(m);
  const p = m.positions;
  const n = vertexNormals(m);
  const out = p.slice();
  const nv = p.length / 3;
  for (let v = 0; v < nv; v++) {
    if (topo.boundaryVertex[v]) continue;
    const nb = topo.vertexNeighbors[v];
    if (nb.length === 0) continue;
    let cx = 0, cy = 0, cz = 0;
    for (const w of nb) {
      cx += p[w * 3];
      cy += p[w * 3 + 1];
      cz += p[w * 3 + 2];
    }
    cx = cx / nb.length - p[v * 3];
    cy = cy / nb.length - p[v * 3 + 1];
    cz = cz / nb.length - p[v * 3 + 2];
    const d = cx * n[v * 3] + cy * n[v * 3 + 1] + cz * n[v * 3 + 2];
    out[v * 3] += lambda * (cx - d * n[v * 3]);
    out[v * 3 + 1] += lambda * (cy - d * n[v * 3 + 1]);
    out[v * 3 + 2] += lambda * (cz - d * n[v * 3 + 2]);
  }
  return { positions: out, indices: m.indices };
}
