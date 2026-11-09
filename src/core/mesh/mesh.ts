/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import type { MeshData } from '../types';
import { cross3, getV, norm3, sub3, type V3 } from '../math/vec';

export function emptyMesh(): MeshData {
  return { positions: new Float32Array(0), indices: new Uint32Array(0) };
}

export const vertexCount = (m: MeshData) => m.positions.length / 3;
export const triCount = (m: MeshData) => m.indices.length / 3;

export function cloneMesh(m: MeshData): MeshData {
  return { positions: m.positions.slice(), indices: m.indices.slice() };
}

export function bbox(m: MeshData): { min: V3; max: V3; size: V3; center: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  const p = m.positions;
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (p[i + k] < min[k]) min[k] = p[i + k];
      if (p[i + k] > max[k]) max[k] = p[i + k];
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0], center: [0, 0, 0] };
  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  };
}

export function triNormal(m: MeshData, t: number): V3 {
  const a = getV(m.positions, m.indices[t * 3]);
  const b = getV(m.positions, m.indices[t * 3 + 1]);
  const c = getV(m.positions, m.indices[t * 3 + 2]);
  return norm3(cross3(sub3(b, a), sub3(c, a)));
}

export function triArea(m: MeshData, t: number): number {
  const a = getV(m.positions, m.indices[t * 3]);
  const b = getV(m.positions, m.indices[t * 3 + 1]);
  const c = getV(m.positions, m.indices[t * 3 + 2]);
  const n = cross3(sub3(b, a), sub3(c, a));
  return 0.5 * Math.hypot(n[0], n[1], n[2]);
}

export function surfaceArea(m: MeshData): number {
  let s = 0;
  for (let t = 0; t < triCount(m); t++) s += triArea(m, t);
  return s;
}

export function triCentroid(m: MeshData, t: number): V3 {
  const p = m.positions;
  const i = m.indices[t * 3] * 3;
  const j = m.indices[t * 3 + 1] * 3;
  const k = m.indices[t * 3 + 2] * 3;
  return [(p[i] + p[j] + p[k]) / 3, (p[i + 1] + p[j + 1] + p[k + 1]) / 3, (p[i + 2] + p[j + 2] + p[k + 2]) / 3];
}

/** Area-weighted vertex normals. */
export function vertexNormals(m: MeshData): Float32Array {
  const n = new Float32Array(m.positions.length);
  const p = m.positions;
  const idx = m.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      n[v] += nx;
      n[v + 1] += ny;
      n[v + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

/** Merge vertices closer than `tol` (spatial hash). Drops degenerate triangles. */
export function weld(m: MeshData, tol = 1e-4): MeshData {
  const p = m.positions;
  const nv = p.length / 3;
  const inv = 1 / tol;
  const map = new Map<string, number>();
  const remap = new Uint32Array(nv);
  const out: number[] = [];
  for (let i = 0; i < nv; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = out.length / 3;
      out.push(x, y, z);
      map.set(key, id);
    }
    remap[i] = id;
  }
  const idx: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = remap[m.indices[t]], b = remap[m.indices[t + 1]], c = remap[m.indices[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { positions: new Float32Array(out), indices: new Uint32Array(idx) };
}

/** Remove vertices no triangle references. */
export function compact(m: MeshData): MeshData {
  const nv = m.positions.length / 3;
  const used = new Int32Array(nv).fill(-1);
  let k = 0;
  for (let i = 0; i < m.indices.length; i++) {
    const v = m.indices[i];
    if (used[v] < 0) used[v] = k++;
  }
  const pos = new Float32Array(k * 3);
  for (let v = 0; v < nv; v++) {
    const u = used[v];
    if (u >= 0) {
      pos[u * 3] = m.positions[v * 3];
      pos[u * 3 + 1] = m.positions[v * 3 + 1];
      pos[u * 3 + 2] = m.positions[v * 3 + 2];
    }
  }
  const idx = new Uint32Array(m.indices.length);
  for (let i = 0; i < idx.length; i++) idx[i] = used[m.indices[i]];
  return { positions: pos, indices: idx };
}

/** Keep only the largest connected component (by triangle count). */
export function largestComponent(m: MeshData): MeshData {
  const nt = triCount(m);
  if (nt === 0) return m;
  const adj = buildTopology(m);
  const comp = new Int32Array(nt).fill(-1);
  let best = -1, bestSize = 0, c = 0;
  const stack: number[] = [];
  for (let s = 0; s < nt; s++) {
    if (comp[s] >= 0) continue;
    let size = 0;
    stack.push(s);
    comp[s] = c;
    while (stack.length) {
      const t = stack.pop()!;
      size++;
      for (let e = 0; e < 3; e++) {
        const n = adj.triNeighbor[t * 3 + e];
        if (n >= 0 && comp[n] < 0) {
          comp[n] = c;
          stack.push(n);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = c;
    }
    c++;
  }
  if (c === 1) return m;
  const idx: number[] = [];
  for (let t = 0; t < nt; t++) if (comp[t] === best) idx.push(m.indices[t * 3], m.indices[t * 3 + 1], m.indices[t * 3 + 2]);
  return compact({ positions: m.positions, indices: new Uint32Array(idx) });
}

/** Apply scale (about origin), then Euler rotation XYZ in degrees. */
export function transformMesh(m: MeshData, scale: V3, rotDeg: V3): MeshData {
  const [rx, ry, rz] = rotDeg.map((d) => (d * Math.PI) / 180);
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const p = m.positions;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    let x = p[i] * scale[0], y = p[i + 1] * scale[1], z = p[i + 2] * scale[2];
    // X
    let y1 = y * cx - z * sx, z1 = y * sx + z * cx;
    y = y1; z = z1;
    // Y
    let x1 = x * cy + z * sy;
    z1 = -x * sy + z * cy;
    x = x1; z = z1;
    // Z
    x1 = x * cz - y * sz;
    y1 = x * sz + y * cz;
    out[i] = x1; out[i + 1] = y1; out[i + 2] = z;
  }
  // Mirroring flips winding.
  const flip = scale[0] * scale[1] * scale[2] < 0;
  let idx = m.indices;
  if (flip) {
    idx = m.indices.slice();
    for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
  }
  return { positions: out, indices: idx };
}

export function translateMesh(m: MeshData, d: V3): MeshData {
  const out = m.positions.slice();
  for (let i = 0; i < out.length; i += 3) {
    out[i] += d[0];
    out[i + 1] += d[1];
    out[i + 2] += d[2];
  }
  return { positions: out, indices: m.indices };
}

/**
 * Edge/triangle adjacency for a manifold-ish triangle mesh.
 *  - triNeighbor[t*3+e]: triangle across edge e (edge e goes from corner e to e+1), or -1.
 *  - edges: unique undirected edges with their (up to 2) incident triangles.
 *  - boundary: per-vertex flag.
 */
export interface Topology {
  triNeighbor: Int32Array;
  edgeA: Uint32Array;
  edgeB: Uint32Array;
  edgeT0: Int32Array;
  edgeT1: Int32Array;
  triEdge: Uint32Array; // edge index for t*3+e
  boundaryVertex: Uint8Array;
  vertexTris: number[][];
  vertexNeighbors: number[][];
}

export function buildTopology(m: MeshData): Topology {
  const nt = m.indices.length / 3;
  const nv = m.positions.length / 3;
  const idx = m.indices;
  const map = new Map<number, number>();
  const eA: number[] = [], eB: number[] = [], eT0: number[] = [], eT1: number[] = [];
  const triEdge = new Uint32Array(nt * 3);
  const key = (a: number, b: number) => (a < b ? a * nv + b : b * nv + a);
  for (let t = 0; t < nt; t++) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t * 3 + e];
      const b = idx[t * 3 + ((e + 1) % 3)];
      const k = key(a, b);
      let ei = map.get(k);
      if (ei === undefined) {
        ei = eA.length;
        map.set(k, ei);
        eA.push(Math.min(a, b));
        eB.push(Math.max(a, b));
        eT0.push(t);
        eT1.push(-1);
      } else if (eT1[ei] === -1) {
        eT1[ei] = t;
      }
      triEdge[t * 3 + e] = ei;
    }
  }
  const triNeighbor = new Int32Array(nt * 3).fill(-1);
  for (let t = 0; t < nt; t++)
    for (let e = 0; e < 3; e++) {
      const ei = triEdge[t * 3 + e];
      triNeighbor[t * 3 + e] = eT0[ei] === t ? eT1[ei] : eT0[ei];
    }
  const boundaryVertex = new Uint8Array(nv);
  for (let i = 0; i < eA.length; i++)
    if (eT1[i] === -1) {
      boundaryVertex[eA[i]] = 1;
      boundaryVertex[eB[i]] = 1;
    }
  const vertexTris: number[][] = Array.from({ length: nv }, () => []);
  for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) vertexTris[idx[t * 3 + e]].push(t);
  const vertexNeighbors: number[][] = Array.from({ length: nv }, () => []);
  for (let i = 0; i < eA.length; i++) {
    vertexNeighbors[eA[i]].push(eB[i]);
    vertexNeighbors[eB[i]].push(eA[i]);
  }
  return {
    triNeighbor,
    edgeA: Uint32Array.from(eA),
    edgeB: Uint32Array.from(eB),
    edgeT0: Int32Array.from(eT0),
    edgeT1: Int32Array.from(eT1),
    triEdge,
    boundaryVertex,
    vertexTris,
    vertexNeighbors,
  };
}

/** Orient triangles consistently (BFS over adjacency). */
export function orientConsistently(m: MeshData): MeshData {
  const idx = m.indices.slice();
  const out = { positions: m.positions, indices: idx };
  const topo = buildTopology(out);
  const nt = idx.length / 3;
  const seen = new Uint8Array(nt);
  for (let s = 0; s < nt; s++) {
    if (seen[s]) continue;
    seen[s] = 1;
    const q = [s];
    while (q.length) {
      const t = q.pop()!;
      for (let e = 0; e < 3; e++) {
        const n = topo.triNeighbor[t * 3 + e];
        if (n < 0 || seen[n]) continue;
        const a = idx[t * 3 + e], b = idx[t * 3 + ((e + 1) % 3)];
        // Neighbor should traverse edge as b→a.
        let ok = false;
        for (let f = 0; f < 3; f++) if (idx[n * 3 + f] === b && idx[n * 3 + ((f + 1) % 3)] === a) ok = true;
        if (!ok) [idx[n * 3 + 1], idx[n * 3 + 2]] = [idx[n * 3 + 2], idx[n * 3 + 1]];
        seen[n] = 1;
        q.push(n);
      }
    }
  }
  return out;
}

/** Ordered boundary loops (vertex indices). */
export function boundaryLoops(m: MeshData, topo = buildTopology(m)): number[][] {
  const next = new Map<number, number>();
  const idx = m.indices;
  for (let i = 0; i < topo.edgeA.length; i++) {
    if (topo.edgeT1[i] !== -1) continue;
    const t = topo.edgeT0[i];
    // Directed as in its triangle.
    for (let e = 0; e < 3; e++) {
      const a = idx[t * 3 + e], b = idx[t * 3 + ((e + 1) % 3)];
      if ((a === topo.edgeA[i] && b === topo.edgeB[i]) || (b === topo.edgeA[i] && a === topo.edgeB[i])) next.set(a, b);
    }
  }
  const loops: number[][] = [];
  const used = new Set<number>();
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop: number[] = [];
    let v: number | undefined = start;
    let guard = 0;
    while (v !== undefined && !used.has(v) && guard++ < 1e6) {
      used.add(v);
      loop.push(v);
      v = next.get(v);
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}
