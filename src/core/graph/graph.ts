/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import type { MeshData } from '../types';
import { buildTopology, triCentroid, triNormal, vertexNormals } from '../mesh/mesh';
import { add3, getV, lerp3, norm3, type V3 } from '../math/vec';
import type { LatticePattern } from '../params';

/**
 * A graph drawn on the surface. Each edge carries the 3D polyline the strip
 * follows (e.g. centroid → shared-edge midpoint → centroid for the hex
 * pattern), plus a surface normal at every polyline point.
 */
export interface SurfaceGraph {
  nodePos: V3[];
  nodeNormal: V3[];
  /** Which mesh triangle each node relates to (for cluster colouring), -1 if none. */
  nodeFace: number[];
  edges: { a: number; b: number; pts: V3[]; normals: V3[] }[];
  adj: { e: number; to: number }[][];
}

function finish(nodePos: V3[], nodeNormal: V3[], nodeFace: number[], edges: SurfaceGraph['edges']): SurfaceGraph {
  const adj: SurfaceGraph['adj'] = nodePos.map(() => []);
  edges.forEach((e, i) => {
    adj[e.a].push({ e: i, to: e.b });
    adj[e.b].push({ e: i, to: e.a });
  });
  return { nodePos, nodeNormal, nodeFace, edges, adj };
}

/** Dual graph: one node per triangle; strips cross shared edges at their midpoints. */
function hexGraph(m: MeshData): SurfaceGraph {
  const topo = buildTopology(m);
  const nt = m.indices.length / 3;
  const pos: V3[] = [], nrm: V3[] = [], face: number[] = [];
  for (let t = 0; t < nt; t++) {
    pos.push(triCentroid(m, t));
    nrm.push(triNormal(m, t));
    face.push(t);
  }
  const edges: SurfaceGraph['edges'] = [];
  for (let e = 0; e < topo.edgeA.length; e++) {
    const t0 = topo.edgeT0[e], t1 = topo.edgeT1[e];
    if (t1 < 0) continue;
    const mid = lerp3(getV(m.positions, topo.edgeA[e]), getV(m.positions, topo.edgeB[e]), 0.5);
    const mn = norm3(add3(nrm[t0], nrm[t1]));
    edges.push({ a: t0, b: t1, pts: [pos[t0], mid, pos[t1]], normals: [nrm[t0], mn, nrm[t1]] });
  }
  return finish(pos, nrm, face, edges);
}

/** Primal graph: nodes are mesh vertices, strips run along mesh edges. */
function triGraph(m: MeshData): SurfaceGraph {
  const topo = buildTopology(m);
  const vn = vertexNormals(m);
  const nv = m.positions.length / 3;
  const pos: V3[] = [], nrm: V3[] = [], face: number[] = [];
  for (let v = 0; v < nv; v++) {
    pos.push(getV(m.positions, v));
    nrm.push(getV(vn, v));
    face.push(topo.vertexTris[v][0] ?? -1);
  }
  const edges: SurfaceGraph['edges'] = [];
  for (let e = 0; e < topo.edgeA.length; e++) {
    const a = topo.edgeA[e], b = topo.edgeB[e];
    edges.push({ a, b, pts: [pos[a], pos[b]], normals: [nrm[a], nrm[b]] });
  }
  return finish(pos, nrm, face, edges);
}

/** Pair triangles into quads, then take the dual: a square-ish grid. */
function quadGraph(m: MeshData): SurfaceGraph {
  const topo = buildTopology(m);
  const nt = m.indices.length / 3;
  const group = new Int32Array(nt).fill(-1);
  // Greedy pairing by most coplanar, shortest-diagonal neighbour.
  const cand: { e: number; score: number }[] = [];
  for (let e = 0; e < topo.edgeA.length; e++) {
    const t0 = topo.edgeT0[e], t1 = topo.edgeT1[e];
    if (t1 < 0) continue;
    const n0 = triNormal(m, t0), n1 = triNormal(m, t1);
    const len = Math.hypot(
      m.positions[topo.edgeA[e] * 3] - m.positions[topo.edgeB[e] * 3],
      m.positions[topo.edgeA[e] * 3 + 1] - m.positions[topo.edgeB[e] * 3 + 1],
      m.positions[topo.edgeA[e] * 3 + 2] - m.positions[topo.edgeB[e] * 3 + 2],
    );
    cand.push({ e, score: -len * (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) });
  }
  cand.sort((a, b) => a.score - b.score);
  let g = 0;
  for (const { e } of cand) {
    const t0 = topo.edgeT0[e], t1 = topo.edgeT1[e];
    if (group[t0] >= 0 || group[t1] >= 0) continue;
    group[t0] = group[t1] = g++;
  }
  for (let t = 0; t < nt; t++) if (group[t] < 0) group[t] = g++;
  const pos: V3[] = Array.from({ length: g }, () => [0, 0, 0] as V3);
  const nrm: V3[] = Array.from({ length: g }, () => [0, 0, 0] as V3);
  const cnt = new Int32Array(g);
  const face: number[] = new Array(g).fill(-1);
  for (let t = 0; t < nt; t++) {
    const k = group[t];
    const c = triCentroid(m, t), n = triNormal(m, t);
    for (let i = 0; i < 3; i++) {
      pos[k][i] += c[i];
      nrm[k][i] += n[i];
    }
    cnt[k]++;
    if (face[k] < 0) face[k] = t;
  }
  for (let k = 0; k < g; k++) {
    pos[k] = [pos[k][0] / cnt[k], pos[k][1] / cnt[k], pos[k][2] / cnt[k]];
    nrm[k] = norm3(nrm[k]);
  }
  const seen = new Set<string>();
  const edges: SurfaceGraph['edges'] = [];
  for (let e = 0; e < topo.edgeA.length; e++) {
    const t0 = topo.edgeT0[e], t1 = topo.edgeT1[e];
    if (t1 < 0) continue;
    const a = group[t0], b = group[t1];
    if (a === b) continue;
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mid = lerp3(getV(m.positions, topo.edgeA[e]), getV(m.positions, topo.edgeB[e]), 0.5);
    edges.push({ a, b, pts: [pos[a], mid, pos[b]], normals: [nrm[a], norm3(add3(nrm[a], nrm[b])), nrm[b]] });
  }
  return finish(pos, nrm, face, edges);
}

/** Kis graph: vertices plus face centres, every face centre linked to its three corners. */
function kisGraph(m: MeshData): SurfaceGraph {
  const tg = triGraph(m);
  const nt = m.indices.length / 3;
  const pos = tg.nodePos.slice(), nrm = tg.nodeNormal.slice(), face = tg.nodeFace.slice();
  const edges: SurfaceGraph['edges'] = [];
  for (let t = 0; t < nt; t++) {
    const c = pos.length;
    pos.push(triCentroid(m, t));
    nrm.push(triNormal(m, t));
    face.push(t);
    for (let k = 0; k < 3; k++) {
      const v = m.indices[t * 3 + k];
      edges.push({ a: c, b: v, pts: [pos[c], pos[v]], normals: [nrm[c], nrm[v]] });
    }
  }
  return finish(pos, nrm, face, edges);
}

export function buildSurfaceGraph(m: MeshData, pattern: LatticePattern): SurfaceGraph {
  switch (pattern) {
    case 'tri':
      return triGraph(m);
    case 'quad':
      return quadGraph(m);
    case 'kis':
      return kisGraph(m);
    default:
      return hexGraph(m);
  }
}

export function edgeLength(g: SurfaceGraph, e: number): number {
  const p = g.edges[e].pts;
  let l = 0;
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]);
  return l;
}
