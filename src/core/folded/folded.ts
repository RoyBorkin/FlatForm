/**
 * Folded panels: a papercraft unfold. Triangles are unfolded about their
 * shared edges along a spanning tree; folds become score lines, cut edges
 * get numbered and joined with latches, glue tabs, or bolt holes.
 */
import type { MeshData, MethodResult, Part2D, Path2, Polyline2 } from '../types';
import type { FoldedParams, JoineryParams, MaterialParams, SheetParams } from '../params';
import { buildTopology, triNormal } from '../mesh/mesh';
import { remesh, edgeLengthForTriangles } from '../mesh/remesh';
import { DSU } from '../graph/trees';
import { difference, intersection, offsetPolygons, regionArea, union, bounds } from '../polygon/polygon';
import { textPolylines, textWidth } from '../text/hershey';
import { normalizePart, partId } from '../parts';
import { latchAt, latchPositions, glueTab } from '../joinery/latches';
import { pinHoleDiameter } from '../joinery/holes';
import { cross3, dot3, getV, sub3, type V2 } from '../math/vec';

type Tri2 = [V2, V2, V2];

function triOverlap(a: Tri2, b: Tri2): boolean {
  // Separating axis test on slightly shrunken triangles.
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
  // Coarse mesh at the requested panel count.
  const L = edgeLengthForTriangles(input.surface, P.targetFaces);
  const m = remesh(input.surface, { targetEdge: L, iterations: 4 });
  input.onProgress?.(0.25, 'Panels');
  const topo = buildTopology(m);
  const nt = m.indices.length / 3;
  const P3 = (v: number) => getV(m.positions, v);
  const normals = Array.from({ length: nt }, (_, i) => triNormal(m, i));

  // Spanning tree over the dual graph.
  const ne = topo.edgeA.length;
  const weight = new Float64Array(ne);
  for (let e = 0; e < ne; e++) {
    const t0 = topo.edgeT0[e], t1 = topo.edgeT1[e];
    if (t1 < 0) continue;
    const len = Math.hypot(...(sub3(P3(topo.edgeA[e]), P3(topo.edgeB[e])) as [number, number, number]));
    const dih = Math.acos(Math.max(-1, Math.min(1, dot3(normals[t0], normals[t1]))));
    weight[e] = P.strategy === 'flattest' ? dih : P.strategy === 'longest' ? -len : 0;
  }
  const treeEdge = new Uint8Array(ne);
  if (P.strategy === 'bfs') {
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
          if (g >= 0 && !seen[g]) {
            seen[g] = 1;
            treeEdge[e] = 1;
            q.push(g);
          }
        }
      }
    }
  } else {
    const order = Array.from({ length: ne }, (_, i) => i).filter((e) => topo.edgeT1[e] >= 0);
    order.sort((a, b) => weight[a] - weight[b]);
    const dsu = new DSU(nt);
    for (const e of order) if (dsu.union(topo.edgeT0[e], topo.edgeT1[e])) treeEdge[e] = 1;
  }

  // Greedy unfold along the tree with overlap / size limits.
  const island = new Int32Array(nt).fill(-1);
  const pos2 = new Map<string, V2>(); // `${face}:${vertex}` → 2D
  const tri2: Tri2[] = new Array(nt);
  const islands: number[][] = [];
  const W = sheet.width - 2 * sheet.margin, H = sheet.height - 2 * sheet.margin;
  const fits = (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const w = b.maxX - b.minX + 2 * P.tabWidth, h = b.maxY - b.minY + 2 * P.tabWidth;
    return (w <= W && h <= H) || (w <= H && h <= W);
  };
  for (let root = 0; root < nt; root++) {
    if (island[root] >= 0) continue;
    const id = islands.length;
    const faces: number[] = [];
    // Place root triangle.
    const [a, b, c] = [m.indices[root * 3], m.indices[root * 3 + 1], m.indices[root * 3 + 2]];
    const pa = P3(a), pb = P3(b), pc = P3(c);
    const lab = Math.hypot(...(sub3(pb, pa) as [number, number, number]));
    const ex = sub3(pb, pa).map((x) => x / lab) as [number, number, number];
    const nrm = normals[root];
    const ey = cross3(nrm, ex);
    const ac = sub3(pc, pa);
    const place = (f: number, verts: number[], pts: V2[]) => {
      verts.forEach((v, i) => pos2.set(`${f}:${v}`, pts[i]));
      const order = [m.indices[f * 3], m.indices[f * 3 + 1], m.indices[f * 3 + 2]];
      tri2[f] = order.map((v) => pos2.get(`${f}:${v}`)!) as Tri2;
      island[f] = id;
      faces.push(f);
    };
    place(root, [a, b, c], [[0, 0], [lab, 0], [dot3(ac, ex), dot3(ac, ey)]]);
    let bb = bounds([tri2[root]]);
    const grid = new Map<string, number[]>();
    const cell = L * 2;
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
        if (faces.length >= P.maxIslandFaces) continue;
        // Unfold g about edge (va, vb).
        const va = m.indices[f * 3 + k], vb = m.indices[f * 3 + ((k + 1) % 3)];
        const vc = [m.indices[g * 3], m.indices[g * 3 + 1], m.indices[g * 3 + 2]].find((v) => v !== va && v !== vb)!;
        const A = pos2.get(`${f}:${va}`)!, B = pos2.get(`${f}:${vb}`)!;
        const dab = Math.hypot(B[0] - A[0], B[1] - A[1]);
        const dac = Math.hypot(...(sub3(P3(vc), P3(va)) as [number, number, number]));
        const dbc = Math.hypot(...(sub3(P3(vc), P3(vb)) as [number, number, number]));
        const x = (dab * dab + dac * dac - dbc * dbc) / (2 * dab);
        const h = Math.sqrt(Math.max(0, dac * dac - x * x));
        const ux = (B[0] - A[0]) / dab, uy = (B[1] - A[1]) / dab;
        // f is CCW so its third vertex is left of A→B; g goes on the right.
        const C: V2 = [A[0] + ux * x + uy * h, A[1] + uy * x - ux * h];
        const cand: Tri2 = [A, B, C];
        const cb = bounds([cand]);
        let clash = false;
        for (let gx = Math.floor(cb.minX / cell); gx <= Math.floor(cb.maxX / cell) && !clash; gx++)
          for (let gy = Math.floor(cb.minY / cell); gy <= Math.floor(cb.maxY / cell) && !clash; gy++)
            for (const o of grid.get(`${gx},${gy}`) ?? []) if (o !== f && triOverlap(cand, tri2[o])) {
              clash = true;
              break;
            }
        const nb = { minX: Math.min(bb.minX, cb.minX), minY: Math.min(bb.minY, cb.minY), maxX: Math.max(bb.maxX, cb.maxX), maxY: Math.max(bb.maxY, cb.maxY) };
        if (clash && !P.autoSplit) warnings.push('Some panels overlap when unfolded. Turn on auto-split.');
        if ((clash && P.autoSplit) || !fits(nb)) continue;
        bb = nb;
        place(g, [va, vb, vc], [A, B, C]);
        addGrid(g);
        queue.push(g);
      }
    }
    islands.push(faces);
  }
  input.onProgress?.(0.55, 'Unfold');

  // Classify edges.
  const edgeNumber = new Int32Array(ne).fill(0);
  let nextNum = 0;
  for (let e = 0; e < ne; e++) {
    const t0 = topo.edgeT0[e], t1 = topo.edgeT1[e];
    if (t1 >= 0 && !(island[t0] === island[t1] && treeEdge[e])) edgeNumber[e] = ++nextNum;
  }
  // Fold edges inside an island that were not tree edges but are shared in 2D (adjacent placement) are also folds.
  const isFold = (e: number) => {
    const t0 = topo.edgeT0[e], t1 = topo.edgeT1[e];
    if (t1 < 0 || island[t0] !== island[t1]) return false;
    const a = topo.edgeA[e], b = topo.edgeB[e];
    const pa0 = pos2.get(`${t0}:${a}`), pa1 = pos2.get(`${t1}:${a}`), pb0 = pos2.get(`${t0}:${b}`), pb1 = pos2.get(`${t1}:${b}`);
    if (!pa0 || !pa1 || !pb0 || !pb1) return false;
    return Math.hypot(pa0[0] - pa1[0], pa0[1] - pa1[1]) < 1e-3 && Math.hypot(pb0[0] - pb1[0], pb0[1] - pb1[1]) < 1e-3;
  };
  for (let e = 0; e < ne; e++) if (isFold(e)) edgeNumber[e] = 0;

  const holeD = pinHoleDiameter(J);
  const textH = P.textHeight;
  const useLatches = J.kind === 'latches';
  const useHoles = (J.kind === 'screws' || J.kind === 'printed') && holeD > 0;
  const useTabs = J.kind === 'none' && P.tabs === 'glue';
  const latchSpec = { ...J.latch, thickness: t };
  const parts: Part2D[] = [];
  const connectors: number[] = [];
  const bracketAngles: number[] = [];
  let pinPairs = 0;

  islands.forEach((faces, id) => {
    const tris = faces.map((f) => tri2[f]);
    let region = union(offsetPolygons(tris.map((tr) => tr.slice()), 0.002, 'miter'));
    region = offsetPolygons(region, -0.002, 'miter');
    const add: Path2[] = [];
    const sub: Path2[] = [];
    const score: Polyline2[] = [];
    const perforations: Polyline2[] = [];
    const engrave: Polyline2[] = [];
    const holes: Part2D['holes'] = [];
    const faceSet = new Set(faces);
    for (const f of faces) {
      for (let k = 0; k < 3; k++) {
        const e = topo.triEdge[f * 3 + k];
        const g = topo.triNeighbor[f * 3 + k];
        const a = topo.edgeA[e], b = topo.edgeB[e]; // canonical order shared by both sides
        const A = pos2.get(`${f}:${a}`)!, B = pos2.get(`${f}:${b}`)!;
        const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
        const u: V2 = [(B[0] - A[0]) / len, (B[1] - A[1]) / len];
        // Outward normal: away from the face's third vertex.
        const tr = tri2[f];
        const cx = (tr[0][0] + tr[1][0] + tr[2][0]) / 3, cy = (tr[0][1] + tr[1][1] + tr[2][1]) / 3;
        let out: V2 = [u[1], -u[0]];
        if ((cx - A[0]) * out[0] + (cy - A[1]) * out[1] > 0) out = [-out[0], -out[1]];
        const toXY = (s: number, n: number): V2 => [A[0] + u[0] * s + out[0] * n, A[1] + u[1] * s + out[1] * n];
        const local = (p: Path2) => p.map(([s, n]) => toXY(s, n));
        if (g >= 0 && faceSet.has(g) && isFold(e)) {
          if (f < g) {
            // Fold line: mountain if the surface is convex across it.
            const conv = dot3(cross3(normals[f], normals[g]), sub3(P3(b), P3(a)));
            const fl: Polyline2 = { pts: [A, B], kind: conv > 0 ? 'mountain' : 'valley' };
            if (P.foldLine === 'perforate') {
              const step = P.perforation.dash + P.perforation.gap;
              for (let s = P.perforation.gap; s + P.perforation.dash < len; s += step) perforations.push({ pts: [toXY(s, 0), toXY(s + P.perforation.dash, 0)] });
            } else score.push(fl);
          }
          continue;
        }
        if (g < 0) continue; // open boundary: plain cut
        const num = edgeNumber[e];
        const male = f < g; // deterministic side choice
        if (P.numberEdges && num) {
          const label = String(num);
          const h = Math.min(textH, len * 0.25);
          if (h > 0.6 && textWidth(label, h) < len * 0.6) {
            let ang = Math.atan2(u[1], u[0]);
            if (ang > Math.PI / 2 || ang <= -Math.PI / 2) ang += Math.PI;
            const inset = h * 0.9 + (useHoles ? holeD * 2.2 : 0) + (useLatches && !male ? t * 2 + J.latch.clearance + 2 : 0);
            const q = toXY(len / 2, -inset);
            engrave.push(...textPolylines(label, q[0], q[1], h, ang));
          }
        }
        if (useTabs && male) {
          add.push(local(glueTab(len, Math.min(P.tabWidth, len * 0.35))));
          score.push({ pts: [A, B], kind: 'valley' });
        }
        if (useLatches) {
          for (const c of latchPositions(len, J.latch.width, J.latch.perEdge)) {
            // Female side mirrors s so both sides line up.
            const geo = latchAt(c, latchSpec);
            if (male) {
              add.push(...geo.add.map(local));
              if (geo.fold) score.push({ pts: [toXY(geo.fold[0][0], 0), toXY(geo.fold[1][0], 0)], kind: 'valley' });
            } else sub.push(...geo.sub.map(local));
          }
        }
        if (useHoles) {
          const off = Math.max(holeD * 1.6, 5);
          const n = Math.max(1, Math.min(3, Math.floor(len / 40)));
          for (let i = 0; i < n; i++) {
            const q = toXY(((i + 0.5) * len) / n, -off);
            holes.push({ x: q[0], y: q[1], r: holeD / 2 });
          }
          if (male) {
            const mid = [(P3(a)[0] + P3(b)[0]) / 2, (P3(a)[1] + P3(b)[1]) / 2, (P3(a)[2] + P3(b)[2]) / 2];
            const nn = normals[f];
            connectors.push(mid[0], mid[1], mid[2], nn[0], nn[1], nn[2]);
            // Inside angle between the panels (180° = flat).
            const dih = Math.acos(Math.max(-1, Math.min(1, dot3(normals[f], normals[g]))));
            const conv = dot3(cross3(normals[f], normals[g]), sub3(P3(b), P3(a))) > 0;
            const inside = conv ? 180 - (dih * 180) / Math.PI : 180 + (dih * 180) / Math.PI;
            for (let i = 0; i < n; i++) bracketAngles.push(Math.round(inside));
            pinPairs += n;
          }
        }
      }
    }
    let cut = region;
    if (add.length) {
      // Features must not overlap the rest of the part.
      const clean = add.filter((poly) => regionArea(intersection([poly], offsetPolygons(region, -0.05))) < 0.01 * Math.max(1, regionArea([poly])));
      if (clean.length < add.length) warnings.push(`Part ${partId(0, id + 1)}: ${add.length - clean.length} tab${add.length - clean.length > 1 ? 's' : ''} skipped because they would overlap the part.`);
      cut = union([...cut, ...clean]);
    }
    if (sub.length) cut = difference(cut, sub);
    parts.push(
      normalizePart({
        id: partId(0, id + 1),
        group: 0,
        groupName: 'Panels',
        cut,
        holes,
        score,
        engrave,
        perforations,
        meta: { faces: faces.length },
      }, false), // keep the unfold orientation: it is the one checked against the sheet
    );
  });
  input.onProgress?.(0.9, 'Joinery');
  const big = parts.filter((p) => {
    const w = p.bbox.maxX - p.bbox.minX, h = p.bbox.maxY - p.bbox.minY;
    return !((w <= W && h <= H) || (w <= H && h <= W));
  });
  if (big.length) warnings.push(`${big.length} part(s) are larger than the sheet. Lower "max faces per part" or use a bigger sheet.`);

  // 3D panels for preview.
  const posArr = new Float32Array(nt * 9);
  const nrmArr = new Float32Array(nt * 9);
  const isl = new Uint32Array(nt);
  for (let f = 0; f < nt; f++) {
    for (let k = 0; k < 3; k++) {
      const v = P3(m.indices[f * 3 + k]);
      posArr.set(v, f * 9 + k * 3);
      nrmArr.set(normals[f], f * 9 + k * 3);
    }
    isl[f] = island[f];
  }
  return {
    parts,
    assembly: { kind: 'panels', thickness: t, panels: { positions: posArr, normals: nrmArr, island: isl }, connectors: new Float32Array(connectors) },
    overlays: {},
    stats: { faces: nt, islands: islands.length, cutEdges: nextNum, folds: ne - nextNum },
    warnings,
    connectorData: { pinCount: pinPairs * 2, gripLength: t * 2, bracketAngles },
  };
}
