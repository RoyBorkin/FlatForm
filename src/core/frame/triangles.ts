/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Triangles: the surface is rebuilt from a handful of repeated triangle
 * shapes. Edge lengths are clustered into a few classes, the mesh is relaxed
 * (position-based springs, projected back to the surface) until every edge
 * is close to its class length, and each face is then cut as the ideal
 * triangle of its three classes, so identical panels can be batch-cut.
 */
import type { Junction, JunctionArm, MeshData, MethodResult, Part2D, Path2 } from '../types';
import type { JoineryParams, MaterialParams, TrianglesParams } from '../params';
import { remesh, edgeLengthForTriangles } from '../mesh/remesh';
import { buildTopology, triNormal } from '../mesh/mesh';
import { MeshProjector } from '../mesh/project';
import { basisMatrix, cross3, dot3, getV, norm3, sub3, type V2, type V3 } from '../math/vec';
import { circlePath, difference, interiorPoint, offsetPolygons, pointInRegion, regionArea, union } from '../polygon/polygon';
import { emptyFeatures, type EdgeCtx } from '../joinery/edgeFeatures';
import { AngleCounter, seamFeature, seamLabelInset } from '../joinery/seams';
import { makeJunction, panelHoleDists } from '../joinery/junction';
import { flatHub } from '../joinery/flatHub';
import { textPolylines, textWidth } from '../text/hershey';
import { normalizePart, partId } from '../parts';

/** 1D k-means; returns sorted centres. */
export function kmeans1d(values: Float64Array | number[], k: number, iters = 30): number[] {
  const v = Array.from(values).sort((a, b) => a - b);
  if (!v.length) return [];
  k = Math.max(1, Math.min(k, v.length));
  let c = Array.from({ length: k }, (_, i) => v[Math.floor(((i + 0.5) / k) * v.length)]);
  for (let it = 0; it < iters; it++) {
    const sum = new Float64Array(k), cnt = new Float64Array(k);
    for (const x of v) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < k; i++) {
        const d = Math.abs(x - c[i]);
        if (d < bd) (bd = d), (bi = i);
      }
      sum[bi] += x;
      cnt[bi]++;
    }
    c = c.map((ci, i) => (cnt[i] ? sum[i] / cnt[i] : ci));
  }
  return c.sort((a, b) => a - b);
}

const nearest = (c: number[], x: number) => {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < c.length; i++) {
    const d = Math.abs(x - c[i]);
    if (d < bd) (bd = d), (bi = i);
  }
  return bi;
};

/** Triangle with side a = |p0p1|, b = |p1p2|, c = |p2p0|, p0 at the origin, p1 on +x. */
function triFromSides(a: number, b: number, c: number): [V2, V2, V2] | null {
  if (a + b <= c || b + c <= a || c + a <= b) return null;
  const x = (a * a + c * c - b * b) / (2 * a);
  const y = Math.sqrt(Math.max(0, c * c - x * x));
  return [[0, 0], [a, 0], [x, y]];
}

/** Cut a little off every corner (keeps sharp tips from snagging and burning). */
function trimCorners(poly: Path2, trim: number): Path2 {
  if (trim <= 0) return poly;
  const out: Path2 = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ta = Math.min(trim, la * 0.3), tb = Math.min(trim, lb * 0.3);
    out.push([p[0] + ((a[0] - p[0]) / la) * ta, p[1] + ((a[1] - p[1]) / la) * ta], [p[0] + ((b[0] - p[0]) / lb) * tb, p[1] + ((b[1] - p[1]) / lb) * tb]);
  }
  return out;
}

export function buildTriangles(input: {
  surface: MeshData;
  params: TrianglesParams;
  joinery: JoineryParams;
  material: MaterialParams;
  onProgress?: (f: number, s: string) => void;
}): MethodResult {
  const { params: P, joinery: J, material } = input;
  const warnings: string[] = [];
  const t = material.thickness;
  const m0 = remesh(input.surface, { targetEdge: edgeLengthForTriangles(input.surface, P.targetFaces), iterations: 5 });
  const topo = buildTopology(m0);
  const nE = topo.edgeA.length;
  const pos = new Float64Array(m0.positions);
  const len = (e: number) => {
    const a = topo.edgeA[e] * 3, b = topo.edgeB[e] * 3;
    return Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
  };
  const lens0 = new Float64Array(nE);
  for (let e = 0; e < nE; e++) lens0[e] = len(e);
  let centres = kmeans1d(lens0, P.lengthClasses);
  const cls = new Int32Array(nE);
  for (let e = 0; e < nE; e++) cls[e] = nearest(centres, lens0[e]);
  input.onProgress?.(0.2, 'Relaxing');

  // Position-based springs toward the class lengths, projected back to the surface.
  const proj = new MeshProjector(input.surface);
  const iters = Math.max(0, P.iterations);
  const nv = pos.length / 3;
  for (let it = 0; it < iters; it++) {
    // Gauss-Seidel: each edge is corrected in place, which converges far faster than averaging.
    for (let e = 0; e < nE; e++) {
      const a = topo.edgeA[e] * 3, b = topo.edgeB[e] * 3;
      const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
      const l = Math.hypot(dx, dy, dz) || 1e-9;
      const k = (0.45 * (l - centres[cls[e]])) / l;
      pos[a] += dx * k, pos[a + 1] += dy * k, pos[a + 2] += dz * k;
      pos[b] -= dx * k, pos[b + 1] -= dy * k, pos[b + 2] -= dz * k;
    }
    if (it % 5 === 4 || it === iters - 1)
      for (let v = 0; v < nv; v++) {
        const q = proj.closest(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        pos[v * 3] = q[0], pos[v * 3 + 1] = q[1], pos[v * 3 + 2] = q[2];
      }
    if (it % 40 === 39) {
      // Let the classes follow the mesh: reassign, then recentre.
      const sum = new Float64Array(centres.length), n = new Float64Array(centres.length);
      for (let e = 0; e < nE; e++) {
        const l = len(e);
        cls[e] = nearest(centres, l);
        sum[cls[e]] += l;
        n[cls[e]]++;
      }
      centres = centres.map((c, i) => (n[i] ? sum[i] / n[i] : c));
      input.onProgress?.(0.2 + (0.5 * it) / iters, 'Relaxing');
    }
  }
  const m: MeshData = { positions: new Float32Array(pos), indices: m0.indices };
  let worst = 0, mean = 0;
  for (let e = 0; e < nE; e++) {
    const err = Math.abs(len(e) - centres[cls[e]]) / centres[cls[e]];
    worst = Math.max(worst, err);
    mean += err / nE;
  }
  if (mean > 0.03 || worst > 0.3)
    warnings.push(`Edges are ${(mean * 100).toFixed(1)}% off their class length on average (worst ${Math.round(worst * 100)}%). Panels are cut to the ideal size, so expect small gaps; add relax iterations or edge lengths.`);
  input.onProgress?.(0.75, 'Panels');

  const nt = m.indices.length / 3;
  const normals: V3[] = Array.from({ length: nt }, (_, f) => triNormal(m, f));
  const types = new Map<string, { name: string; count: number }>();
  const holeLabel = seamLabelInset(J, t);
  const clips = new AngleCounter(5); // a cardboard channel takes a few degrees either way
  const seam = seamFeature(J, { glueTabWidth: 0, onClip: (_c, n, a) => clips.add(a, n) });
  // Junction hubs at every vertex grip the corners of the panels around it.
  const junctions: Junction[] = [];
  const relief = new Float64Array(m.positions.length / 3);
  const cornerHole = new Map<string, number>(); // flat hubs: "face:vertex" → hole distance along the corner bisector
  if (J.kind === 'junction') {
    const around: number[][] = Array.from({ length: m.positions.length / 3 }, () => []);
    for (let f = 0; f < nt; f++) for (let k = 0; k < 3; k++) around[m.indices[f * 3 + k]].push(f);
    const forkW = Math.max(8, J.junction.socketDepth * 0.8);
    around.forEach((faces, v) => {
      if (faces.length < 2) return;
      const p = getV(m.positions, v);
      let nrm: V3 = [0, 0, 0];
      const arms: JunctionArm[] = faces.map((f) => {
        const ids = [0, 1, 2].map((k) => m.indices[f * 3 + k]);
        const k = ids.indexOf(v);
        const a = norm3(sub3(getV(m.positions, ids[(k + 1) % 3]), p)), b = norm3(sub3(getV(m.positions, ids[(k + 2) % 3]), p));
        const up = normals[f];
        nrm = [nrm[0] + up[0], nrm[1] + up[1], nrm[2] + up[2]];
        return { dir: norm3([a[0] + b[0], a[1] + b[1], a[2] + b[2]]), up, shape: 'fork', w: forkW, h: t };
      });
      const h = makeJunction(`V${v + 1}`, p, nrm, arms, J.junction);
      junctions.push(h);
      relief[v] = J.junction.style === 'flat' ? flatHub(h, J.junction).rb * 0.9 + J.junction.clearance : h.core + J.junction.clearance;
      panelHoleDists(h, J.junction).forEach((d, i) => d && cornerHole.set(`${faces[i]}:${v}`, d));
    });
  }
  const parts: Part2D[] = [];
  const seamNo = new Int32Array(nE);
  let seams = 0;
  for (let e = 0; e < nE; e++) if (topo.edgeT1[e] >= 0) seamNo[e] = ++seams;
  for (let f = 0; f < nt; f++) {
    const vi = [m.indices[f * 3], m.indices[f * 3 + 1], m.indices[f * 3 + 2]];
    const eIdx = [0, 1, 2].map((k) => topo.triEdge[f * 3 + k]); // edge k = v[k] → v[k+1]
    const sides = eIdx.map((e) => centres[cls[e]]);
    const key = sides
      .map((_, i) => cls[eIdx[i]])
      .slice()
      .sort((a, b) => a - b)
      .join('-');
    let tri = triFromSides(sides[0], sides[1], sides[2]);
    if (!tri) {
      const real = eIdx.map((e) => len(e));
      tri = triFromSides(real[0], real[1], real[2]);
      if (!tri) continue;
    }
    const type = types.get(key) ?? { name: `T${types.size + 1}`, count: 0 };
    type.count++;
    types.set(key, type);
    const region0: Path2 = tri.slice();
    const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    const F = emptyFeatures();
    for (let k = 0; k < 3; k++) {
      const e = eIdx[k];
      const g = topo.triNeighbor[f * 3 + k];
      if (g < 0) continue;
      // Canonical direction: from the lower vertex index, so both sides agree on s.
      const flip = vi[k] !== topo.edgeA[e];
      const P0 = flip ? tri[(k + 1) % 3] : tri[k], P1 = flip ? tri[k] : tri[(k + 1) % 3];
      const L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) || 1e-6;
      const u: V2 = [(P1[0] - P0[0]) / L, (P1[1] - P0[1]) / L];
      let out: V2 = [u[1], -u[0]];
      if ((cx - P0[0]) * out[0] + (cy - P0[1]) * out[1] > 0) out = [-out[0], -out[1]];
      const fold = Math.acos(Math.max(-1, Math.min(1, dot3(normals[f], normals[g]))));
      const pa = getV(m.positions, topo.edgeA[e]), pb = getV(m.positions, topo.edgeB[e]);
      const ctx: EdgeCtx = {
        A: P0,
        B: P1,
        len: L,
        toXY: (s, n) => [P0[0] + u[0] * s + out[0] * (n + P.gap / 2), P0[1] + u[1] * s + out[1] * (n + P.gap / 2)],
        male: f < g,
        foldAngle: fold,
        convex: dot3(cross3(normals[f], normals[g]), sub3(pb, pa)) > 0,
        num: seamNo[e],
        thickness: t,
      };
      seam(ctx, F);
      if (P.labelParts && P.style === 'panel') {
        const label = String(seamNo[e]);
        const h = Math.min(P.textHeight * 0.7, L * 0.2);
        if (h > 0.8 && textWidth(label, h) < L * 0.5) {
          let ang = Math.atan2(u[1], u[0]);
          if (ang > Math.PI / 2 || ang <= -Math.PI / 2) ang += Math.PI;
          const q = ctx.toXY(L / 2, -(h * 0.9 + holeLabel(ctx) + P.gap));
          F.engrave.push(...textPolylines(label, q[0], q[1], h, ang));
        }
      }
    }
    let region: Path2[] = offsetPolygons([trimCorners(region0, P.cornerTrim)], -P.gap / 2, 'miter');
    if (J.kind === 'junction') {
      // Cut each corner back so the hub's fork can grip it.
      const cuts = [0, 1, 2].filter((k) => relief[vi[k]] > 0).map((k) => circlePath(tri[k][0], tri[k][1], relief[vi[k]], 32));
      if (cuts.length) region = difference(region, cuts);
      // Flat hubs screw to the corner: a hole along the corner's bisector.
      for (let k = 0; k < 3; k++) {
        const dist = cornerHole.get(`${f}:${vi[k]}`);
        if (!dist) continue;
        const c = tri[k], a = tri[(k + 1) % 3], b = tri[(k + 2) % 3];
        const la = Math.hypot(a[0] - c[0], a[1] - c[1]) || 1, lb = Math.hypot(b[0] - c[0], b[1] - c[1]) || 1;
        const bx = (a[0] - c[0]) / la + (b[0] - c[0]) / lb, by = (a[1] - c[1]) / la + (b[1] - c[1]) / lb;
        const l = Math.hypot(bx, by) || 1;
        F.holes.push({ x: c[0] + (bx / l) * dist, y: c[1] + (by / l) * dist, r: J.junction.flatHole / 2 });
      }
    }
    if (F.add.length) region = union([...region, ...F.add]);
    if (F.sub.length) region = difference(region, F.sub);
    if (P.style === 'frame') {
      const inner = offsetPolygons([region0], -(P.gap / 2 + P.frameWidth), 'round');
      if (inner.length && regionArea(inner) > P.frameWidth * P.frameWidth) region = difference(region, inner);
      else if (f === 0) warnings.push('Some triangles are too small for the frame width, so they are left solid.');
    }
    if (!region.length) continue;
    const holes = F.holes.filter((h) => pointInRegion([h.x, h.y], region));
    if (P.labelParts) {
      const ip = interiorPoint(region, holes);
      const label = `${type.name}`;
      const h = Math.min(P.textHeight, ip.d * 0.6);
      if (h > 0.8) F.engrave.push(...textPolylines(label, ip.p[0], ip.p[1], h, 0));
    }
    // Place the ideal triangle on the face: centroids match, first edge along the face's first edge.
    const p0 = getV(m.positions, vi[0]), p1 = getV(m.positions, vi[1]), p2 = getV(m.positions, vi[2]);
    const X = norm3(sub3(p1, p0));
    const N = normals[f];
    const Y = cross3(N, X);
    const c3: V3 = [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3];
    const o: V3 = [0, 1, 2].map((i) => c3[i] - X[i] * cx - Y[i] * cy - N[i] * t) as V3;
    parts.push(
      normalizePart({
        id: partId(0, parts.length + 1),
        group: 0,
        groupName: 'Triangles',
        cut: region,
        holes,
        score: F.score,
        engrave: F.engrave,
        perforations: F.perforations,
        planar: { matrix: basisMatrix(X, Y, N, o) },
        meta: { type: type.name, sides: sides.map((s) => Math.round(s * 10) / 10).join(' / ') },
      }),
    );
  }
  input.onProgress?.(0.95, 'Panels');
  return {
    parts,
    assembly: { kind: 'planar', thickness: t, hubs: junctions.length ? new Float32Array(junctions.flatMap((h) => [...h.pos, h.core + J.junction.wall])) : undefined },
    overlays: {},
    stats: { faces: nt, types: types.size, lengthClasses: centres.length, worstError: Math.round(worst * 1000) / 10, meanError: Math.round(mean * 1000) / 10 },
    warnings,
    connectorData: {
      pinCount: J.kind === 'junction' ? junctions.length : parts.reduce((n, p) => n + p.holes.length, 0) / 2,
      gripLength: t * 2,
      junctions: junctions.length ? junctions : undefined,
      seamClips: clips.total ? clips.list() : undefined,
    },
  };
}
