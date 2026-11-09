/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Branching lattice — the reference workflow:
 *   surface → graph pattern → clusters → spanning-tree "maze" per cluster
 *   → strips with real width → second layer with a different tree,
 *   pinned through every node → unroll every strip flat with numbered holes.
 */
import type { MeshData, MethodResult, Part2D, Path2, Polyline2, Strip3D } from '../types';
import type { LatticeParams, JoineryParams, MaterialParams, SheetParams } from '../params';
import { buildSurfaceGraph, type SurfaceGraph } from '../graph/graph';
import { clusterGraph } from '../graph/cluster';
import { clusterTrees } from '../graph/trees';
import { strokePaths, union, bounds, minAreaRectAngle } from '../polygon/polygon';
import { textPolylines, textWidth } from '../text/hershey';
import { normalizePart, partId, GROUP_LETTERS } from '../parts';
import { pinHoleDiameter } from '../joinery/holes';
import { dot3, norm3, sub3, tangentFrame, type V2, type V3 } from '../math/vec';

export interface LatticeInput {
  surface: MeshData;
  params: LatticeParams;
  joinery: JoineryParams;
  material: MaterialParams;
  sheet: SheetParams;
  onProgress?: (f: number, stage: string) => void;
}

interface Laid {
  nodes: number[];
  nodeXY: Map<number, V2>;
  /** 2D polylines per tree edge. */
  lines: { e: number; pts: V2[] }[];
}

const angleOf = (d: V3, n: V3): number => {
  const { t, b } = tangentFrame(n);
  return Math.atan2(dot3(d, b), dot3(d, t));
};

/** Signed turning angle at a polyline point, measured in its tangent plane. */
function turnAngle(prev: V3, p: V3, next: V3, n: V3): number {
  const d1 = sub3(p, prev), d2 = sub3(next, p);
  const a1 = angleOf(d1, n), a2 = angleOf(d2, n);
  let d = a2 - a1;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Edge polyline oriented starting at node `from`. */
function orientedPts(g: SurfaceGraph, e: number, from: number): { pts: V3[]; normals: V3[] } {
  const ed = g.edges[e];
  if (ed.a === from) return { pts: ed.pts, normals: ed.normals };
  return { pts: ed.pts.slice().reverse(), normals: ed.normals.slice().reverse() };
}

/**
 * Unroll a tree: lengths and in-surface angles are preserved exactly; the
 * strip bends out of plane to follow the surface (which a thin strip does).
 */
function layoutTree(g: SurfaceGraph, root: number, treeAdj: Map<number, { e: number; to: number }[]>): Laid {
  const nodeXY = new Map<number, V2>();
  const rot = new Map<number, number>();
  const lines: Laid['lines'] = [];
  const nodes: number[] = [root];
  nodeXY.set(root, [0, 0]);
  rot.set(root, 0);
  const queue = [root];
  const seen = new Set([root]);
  while (queue.length) {
    const u = queue.shift()!;
    const Pu = nodeXY.get(u)!;
    const Ru = rot.get(u)!;
    for (const { e, to } of treeAdj.get(u) ?? []) {
      if (seen.has(to)) continue;
      seen.add(to);
      const { pts, normals } = orientedPts(g, e, u);
      let theta = angleOf(sub3(pts[1], pts[0]), normals[0]) + Ru;
      let pos: V2 = [Pu[0], Pu[1]];
      const out: V2[] = [pos];
      for (let i = 1; i < pts.length; i++) {
        if (i > 1) theta += turnAngle(pts[i - 2], pts[i - 1], pts[i], normals[i - 1]);
        const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
        pos = [pos[0] + L * Math.cos(theta), pos[1] + L * Math.sin(theta)];
        out.push(pos);
      }
      const k = pts.length - 1;
      const back = angleOf(sub3(pts[k - 1], pts[k]), normals[k]);
      rot.set(to, theta + Math.PI - back);
      nodeXY.set(to, pos);
      lines.push({ e, pts: out });
      nodes.push(to);
      queue.push(to);
    }
  }
  return { nodes, nodeXY, lines };
}

/** Do non-adjacent strip segments come closer than `clear`? (spatial hash) */
function selfOverlaps(lines: Laid['lines'], g: SurfaceGraph, clear: number): boolean {
  type Seg = { a: V2; b: V2; e: number };
  const segs: Seg[] = [];
  for (const l of lines) for (let i = 1; i < l.pts.length; i++) segs.push({ a: l.pts[i - 1], b: l.pts[i], e: l.e });
  if (segs.length < 3) return false;
  const cell = Math.max(clear * 2, 1);
  const grid = new Map<string, number[]>();
  segs.forEach((s, i) => {
    const x0 = Math.floor((Math.min(s.a[0], s.b[0]) - clear) / cell), x1 = Math.floor((Math.max(s.a[0], s.b[0]) + clear) / cell);
    const y0 = Math.floor((Math.min(s.a[1], s.b[1]) - clear) / cell), y1 = Math.floor((Math.max(s.a[1], s.b[1]) + clear) / cell);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = `${x},${y}`;
        let arr = grid.get(k);
        if (!arr) grid.set(k, (arr = []));
        arr.push(i);
      }
  });
  const share = (e1: number, e2: number) => {
    if (e1 === e2) return true;
    const A = g.edges[e1], B = g.edges[e2];
    return A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b;
  };
  const checked = new Set<number>();
  for (const arr of grid.values()) {
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++) {
        const s = segs[arr[i]], t = segs[arr[j]];
        if (share(s.e, t.e)) continue;
        const key = arr[i] * 1e6 + arr[j];
        if (checked.has(key)) continue;
        checked.add(key);
        if (segSegDist(s.a, s.b, t.a, t.b) < clear) return true;
      }
  }
  return false;
}

function segSegDist(p1: V2, p2: V2, q1: V2, q2: V2): number {
  const d = (p: V2, a: V2, b: V2) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
  };
  const o = (a: V2, b: V2, c: V2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (o(p1, p2, q1) * o(p1, p2, q2) < 0 && o(q1, q2, p1) * o(q1, q2, p2) < 0) return 0;
  return Math.min(d(p1, q1, q2), d(p2, q1, q2), d(q1, p1, p2), d(q2, p1, p2));
}

function fitsSheet(laid: Laid, halfW: number, sheet: SheetParams): boolean {
  const pts: V2[] = [];
  for (const l of laid.lines) pts.push(...l.pts);
  if (pts.length < 2) return true;
  const ang = minAreaRectAngle(pts);
  const c = Math.cos(ang), s = Math.sin(ang);
  const b = bounds([pts.map(([x, y]) => [x * c - y * s, x * s + y * c] as V2)]);
  const w = b.maxX - b.minX + 2 * halfW, h = b.maxY - b.minY + 2 * halfW;
  const W = sheet.width - 2 * sheet.margin, H = sheet.height - 2 * sheet.margin;
  return (w <= W && h <= H) || (w <= H && h <= W);
}

/** Split a tree component at the edge that best balances its two halves. */
function splitComponent(nodes: number[], treeAdj: Map<number, { e: number; to: number }[]>): [number[], number[]] | null {
  if (nodes.length < 4) return null;
  const set = new Set(nodes);
  const root = nodes[0];
  const parent = new Map<number, number>();
  const order: number[] = [];
  const stack = [root];
  parent.set(root, -1);
  while (stack.length) {
    const u = stack.pop()!;
    order.push(u);
    for (const { to } of treeAdj.get(u) ?? []) if (set.has(to) && !parent.has(to)) {
      parent.set(to, u);
      stack.push(to);
    }
  }
  const size = new Map<number, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i];
    let s = 1;
    for (const { to } of treeAdj.get(u) ?? []) if (parent.get(to) === u) s += size.get(to)!;
    size.set(u, s);
  }
  let best = -1, bestScore = Infinity;
  for (const u of order) {
    if (u === root) continue;
    const s = size.get(u)!;
    const score = Math.max(s, order.length - s);
    if (score < bestScore) {
      bestScore = score;
      best = u;
    }
  }
  if (best < 0) return null;
  const sub = new Set<number>();
  const st = [best];
  sub.add(best);
  while (st.length) {
    const u = st.pop()!;
    for (const { to } of treeAdj.get(u) ?? []) if (parent.get(to) === u && !sub.has(to)) {
      sub.add(to);
      st.push(to);
    }
  }
  const a = order.filter((n) => !sub.has(n));
  const b = order.filter((n) => sub.has(n));
  return [a, b];
}

export function buildLattice(input: LatticeInput): MethodResult {
  const { surface, params: P, joinery, material, sheet } = input;
  const warnings: string[] = [];
  const g = buildSurfaceGraph(surface, P.pattern);
  input.onProgress?.(0.1, 'Pattern');
  const holeD = pinHoleDiameter(joinery);
  const w = P.stripWidth;
  const halfW = w / 2;
  if (holeD > 0 && holeD > w - 1.2) warnings.push(`Holes (${holeD.toFixed(1)} mm) leave less than 0.6 mm of material on each side of a ${w} mm strip. Widen the strips or use smaller screws.`);
  if (material.minBendRadius === 0) warnings.push(`${material.name} does not bend. Lattice strips follow a curved surface, so choose a thin bendable sheet.`);
  const t = material.thickness;
  const layers = P.layers.map((l, i) => ({ ...l, index: i })).filter((l) => l.enabled);
  if (!layers.length) {
    return { parts: [], assembly: { kind: 'lattice', thickness: t, strips: [] }, overlays: {}, stats: {}, warnings: ['Enable at least one layer.'] };
  }

  // --- trees per layer
  const layerTrees = layers.map((layer, li) => {
    const label = clusterGraph(g, layer.clusters, layer.seed);
    const tree = clusterTrees(g, label, { algorithm: layer.algorithm, seed: layer.seed, bias: layer.bias, biasAxis: layer.biasAxis });
    input.onProgress?.(0.15 + (0.3 * (li + 1)) / layers.length, `Maze ${GROUP_LETTERS[layer.index]}`);
    return { layer, label, tree };
  });

  // --- pins
  const deg = layerTrees.map(({ tree }) => {
    const d = new Int32Array(g.nodePos.length);
    for (const e of tree) {
      d[g.edges[e].a]++;
      d[g.edges[e].b]++;
    }
    return d;
  });
  const pinned = new Uint8Array(g.nodePos.length);
  for (let v = 0; v < pinned.length; v++) {
    if (P.pins === 'all') pinned[v] = 1;
    else {
      const junction = deg.some((d) => d[v] >= 3 || d[v] === 1);
      pinned[v] = junction || (P.pins === 'alternate' && v % 2 === 0) ? 1 : 0;
    }
  }
  const pinNumber = new Int32Array(g.nodePos.length).fill(0);
  let pinCount = 0;
  for (let v = 0; v < pinned.length; v++) if (pinned[v]) pinNumber[v] = ++pinCount;

  // --- parts
  const parts: Part2D[] = [];
  const strips: Strip3D[] = [];
  const treeLines: { group: number; lines: Float32Array }[] = [];
  const dir = P.stackDirection === 'outward' ? 1 : -1;
  const textH = Math.min(P.textHeight, w * 0.6);
  let splitCount = 0;

  layerTrees.forEach(({ layer, label, tree }, li) => {
    const group = layer.index;
    const treeAdj = new Map<number, { e: number; to: number }[]>();
    for (const e of tree) {
      const { a, b } = g.edges[e];
      if (!treeAdj.has(a)) treeAdj.set(a, []);
      if (!treeAdj.has(b)) treeAdj.set(b, []);
      treeAdj.get(a)!.push({ e, to: b });
      treeAdj.get(b)!.push({ e, to: a });
    }
    // Components = clusters (trees are built per cluster).
    const comps = new Map<number, number[]>();
    label.forEach((c, v) => {
      if (!comps.has(c)) comps.set(c, []);
      comps.get(c)!.push(v);
    });
    const tl: number[] = [];
    for (const e of tree) {
      const p = g.edges[e].pts;
      for (let i = 1; i < p.length; i++) tl.push(...p[i - 1], ...p[i]);
    }
    treeLines.push({ group, lines: new Float32Array(tl) });

    const queue: number[][] = [...comps.values()].filter((c) => c.length > 1);
    let n = 0;
    const layerOffset = dir * (li + 0.5) * t;
    while (queue.length) {
      const comp = queue.shift()!;
      // Re-root the component at its most central node for a compact layout.
      const root = comp[0];
      const sub = new Map<number, { e: number; to: number }[]>();
      const cs = new Set(comp);
      for (const v of comp) sub.set(v, (treeAdj.get(v) ?? []).filter((x) => cs.has(x.to)));
      const laid = layoutTree(g, root, sub);
      const needsSplit =
        P.autoSplit && comp.length >= 4 && (selfOverlaps(laid.lines, g, w + 0.6) || !fitsSheet(laid, halfW, sheet));
      if (needsSplit) {
        const halves = splitComponent(comp, sub);
        if (halves) {
          queue.unshift(halves[0], halves[1]);
          splitCount++;
          continue;
        }
      }
      n++;
      const id = partId(group, n);
      const outline = union(strokePaths(laid.lines.map((l) => l.pts), halfW, P.joinStyle === 'miter' ? 'miter' : 'round', P.endStyle));
      const holes = [] as Part2D['holes'];
      const engrave: Polyline2[] = [];
      for (const v of laid.nodes) {
        if (!pinned[v] || holeD <= 0) continue;
        const [x, y] = laid.nodeXY.get(v)!;
        holes.push({ x, y, r: holeD / 2, label: String(pinNumber[v]) });
        if (P.numberHoles) {
          // Put the number along the longest strip arm leaving this node.
          let best: { d: V2; len: number } | null = null;
          for (const l of laid.lines) {
            const ge = g.edges[l.e];
            if (ge.a !== v && ge.b !== v) continue;
            const atStart = Math.hypot(l.pts[0][0] - x, l.pts[0][1] - y) < 1e-6;
            const p0 = atStart ? l.pts[0] : l.pts[l.pts.length - 1];
            const p1 = atStart ? l.pts[1] : l.pts[l.pts.length - 2];
            const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
            if (!best || len > best.len) best = { d: [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len], len };
          }
          if (best) {
            const label = String(pinNumber[v]);
            const tw = textWidth(label, textH);
            const off = holeD / 2 + 0.8 + tw / 2;
            let ang = Math.atan2(best.d[1], best.d[0]);
            if (ang > Math.PI / 2 || ang <= -Math.PI / 2) ang += Math.PI;
            engrave.push(...textPolylines(label, x + best.d[0] * off, y + best.d[1] * off, textH, ang));
          }
        }
      }
      if (P.labelParts) {
        // Part ID on the longest straight run that is clear of holes.
        let best: { a: V2; b: V2; len: number } | null = null;
        for (const l of laid.lines)
          for (let i = 1; i < l.pts.length; i++) {
            const a = l.pts[i - 1], b = l.pts[i];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (!best || len > best.len) best = { a, b, len };
          }
        if (best) {
          const tw = textWidth(id, textH);
          if (tw < best.len - holeD * 2 - 4) {
            let ang = Math.atan2(best.b[1] - best.a[1], best.b[0] - best.a[0]);
            if (ang > Math.PI / 2 || ang <= -Math.PI / 2) ang += Math.PI;
            engrave.push(...textPolylines(id, (best.a[0] + best.b[0]) / 2, (best.a[1] + best.b[1]) / 2, textH, ang).map((p) => ({ ...p, kind: 'text' as const })));
          }
        }
      }
      const cut: Path2[] = outline;
      parts.push(
        normalizePart({
          id,
          group,
          groupName: `Layer ${GROUP_LETTERS[group]}`,
          cut,
          holes,
          score: [],
          engrave,
          meta: { nodes: laid.nodes.length, strips: laid.lines.length },
        }),
      );
      // 3D strip for preview
      const segs: number[] = [];
      for (const l of laid.lines) {
        const { pts, normals } = { pts: g.edges[l.e].pts, normals: g.edges[l.e].normals };
        for (let i = 1; i < pts.length; i++) {
          const nn = norm3([normals[i - 1][0] + normals[i][0], normals[i - 1][1] + normals[i][1], normals[i - 1][2] + normals[i][2]]);
          const o0 = normals[i - 1], o1 = normals[i];
          segs.push(
            pts[i - 1][0] + o0[0] * layerOffset, pts[i - 1][1] + o0[1] * layerOffset, pts[i - 1][2] + o0[2] * layerOffset,
            pts[i][0] + o1[0] * layerOffset, pts[i][1] + o1[1] * layerOffset, pts[i][2] + o1[2] * layerOffset,
            nn[0], nn[1], nn[2],
          );
        }
      }
      const nodes3: number[] = [];
      for (const v of laid.nodes) {
        const p = g.nodePos[v], nn = g.nodeNormal[v];
        nodes3.push(p[0] + nn[0] * layerOffset, p[1] + nn[1] * layerOffset, p[2] + nn[2] * layerOffset, nn[0], nn[1], nn[2]);
      }
      strips.push({ group, partIndex: parts.length - 1, segments: new Float32Array(segs), nodes: new Float32Array(nodes3) });
    }
    input.onProgress?.(0.5 + (0.45 * (li + 1)) / layers.length, `Unroll ${GROUP_LETTERS[group]}`);
  });

  // Pins: centred in the layer stack, axis = surface normal.
  const pinData: number[] = [];
  const stack = layers.length * t;
  for (let v = 0; v < g.nodePos.length; v++) {
    if (!pinned[v]) continue;
    const p = g.nodePos[v], nn = g.nodeNormal[v];
    const c = (dir * stack) / 2;
    pinData.push(p[0] + nn[0] * c, p[1] + nn[1] * c, p[2] + nn[2] * c, nn[0], nn[1], nn[2]);
  }
  if (splitCount) warnings.push(`${splitCount} part${splitCount > 1 ? 's were' : ' was'} split because ${splitCount > 1 ? 'they' : 'it'} overlapped when unrolled or did not fit the sheet.`);

  // Cluster colouring for the surface preview (per mesh face, hex pattern = node per face).
  const clusters = layerTrees.map(({ label, layer }) => {
    const fc = new Int32Array(surface.indices.length / 3).fill(-1);
    g.nodeFace.forEach((f, v) => {
      if (f >= 0 && fc[f] < 0) fc[f] = label[v];
    });
    return { faceCluster: fc, group: layer.index };
  });

  // Node hubs: arm directions in each pinned node's tangent frame.
  const treeSets = layerTrees.map((l) => new Set(l.tree));
  const hubs: { node: number; dirs: V3[] }[] = [];
  for (let v = 0; v < g.nodePos.length; v++) {
    if (!pinned[v]) continue;
    const nn = g.nodeNormal[v];
    const { t: tx, b: by } = tangentFrame(nn);
    const dirs: V3[] = [];
    for (const set of treeSets)
      for (const { e } of g.adj[v]) {
        if (!set.has(e)) continue;
        const { pts } = orientedPts(g, e, v);
        const d = norm3(sub3(pts[1], pts[0]));
        const local: V3 = [dot3(d, tx), dot3(d, by), dot3(d, nn)];
        if (!dirs.some((q) => dot3(q, local) > 0.985)) dirs.push(local);
      }
    hubs.push({ node: pinNumber[v], dirs });
  }

  // Graph overlay
  const gl: number[] = [];
  for (const e of g.edges) for (let i = 1; i < e.pts.length; i++) gl.push(...e.pts[i - 1], ...e.pts[i]);

  return {
    parts,
    assembly: {
      kind: 'lattice',
      strips,
      stripWidth: w,
      thickness: t,
      pins: { data: new Float32Array(pinData), length: stack + 2 * t, radius: Math.max(0.4, holeD / 2 - 0.05) },
    },
    overlays: { clusters, graphLines: new Float32Array(gl), treeLines },
    stats: {
      nodes: g.nodePos.length,
      graphEdges: g.edges.length,
      mazeLines: layerTrees.reduce((s, l) => s + l.tree.length, 0),
      pins: pinCount,
      layers: layers.length,
      splits: splitCount,
    },
    warnings,
    connectorData: { pinCount, gripLength: stack, hubs },
  };
}
