import type { SurfaceGraph } from './graph';
import type { TreeAlgorithm } from '../params';
import { rng } from '../math/rng';
import { MinHeap } from './cluster';
import { norm3, sub3, type V3 } from '../math/vec';

/** Union-find with path halving. */
export class DSU {
  p: Int32Array;
  constructor(n: number) {
    this.p = new Int32Array(n);
    for (let i = 0; i < n; i++) this.p[i] = i;
  }
  find(x: number): number {
    while (this.p[x] !== x) {
      this.p[x] = this.p[this.p[x]];
      x = this.p[x];
    }
    return x;
  }
  union(a: number, b: number): boolean {
    a = this.find(a);
    b = this.find(b);
    if (a === b) return false;
    this.p[a] = b;
    return true;
  }
}

export interface TreeOptions {
  algorithm: TreeAlgorithm;
  seed: number;
  bias: number;
  biasAxis: 'x' | 'y' | 'z';
}

/**
 * Grow a spanning tree (a "maze") inside each cluster. Returns the set of
 * graph edge indices that belong to some cluster's tree. Edges crossing
 * cluster borders are never used, so every cluster becomes one part.
 */
export function clusterTrees(g: SurfaceGraph, label: Int32Array, opt: TreeOptions): number[] {
  const R = rng(opt.seed * 7919 + 17);
  const axis: V3 = opt.biasAxis === 'x' ? [1, 0, 0] : opt.biasAxis === 'y' ? [0, 1, 0] : [0, 0, 1];
  const w = new Float64Array(g.edges.length);
  const inside = new Uint8Array(g.edges.length);
  for (let e = 0; e < g.edges.length; e++) {
    const ed = g.edges[e];
    if (label[ed.a] !== label[ed.b]) continue;
    inside[e] = 1;
    const d = norm3(sub3(g.nodePos[ed.b], g.nodePos[ed.a]));
    const align = Math.abs(d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2]);
    w[e] = R.next() * (1 - opt.bias) + opt.bias * (1 - align);
  }
  const n = g.nodePos.length;
  const tree: number[] = [];
  switch (opt.algorithm) {
    case 'kruskal': {
      const order: number[] = [];
      for (let e = 0; e < g.edges.length; e++) if (inside[e]) order.push(e);
      order.sort((a, b) => w[a] - w[b]);
      const dsu = new DSU(n);
      for (const e of order) if (dsu.union(g.edges[e].a, g.edges[e].b)) tree.push(e);
      break;
    }
    case 'prim':
    case 'radial': {
      // Prim grows from one random start per cluster; radial = shortest-path tree from cluster centre.
      const seen = new Uint8Array(n);
      const dist = new Float64Array(n).fill(Infinity);
      const starts = clusterStarts(g, label, opt.algorithm === 'radial', R);
      for (const s of starts) {
        if (seen[s]) continue;
        const h = new MinHeap();
        dist[s] = 0;
        seen[s] = 1;
        const pushEdges = (u: number) => {
          for (const { e, to } of g.adj[u]) {
            if (!inside[e] || seen[to]) continue;
            const key = opt.algorithm === 'radial' ? dist[u] + edgeLen(g, e) * (1 + 0.6 * w[e]) : w[e];
            h.push(key, e * 2 + (g.edges[e].a === u ? 0 : 1));
          }
        };
        pushEdges(s);
        for (;;) {
          const top = h.pop();
          if (!top) break;
          const [key, code] = top;
          const e = code >> 1;
          const from = code & 1 ? g.edges[e].b : g.edges[e].a;
          const to = code & 1 ? g.edges[e].a : g.edges[e].b;
          if (seen[to]) continue;
          seen[to] = 1;
          dist[to] = opt.algorithm === 'radial' ? key : dist[from] + 1;
          tree.push(e);
          pushEdges(to);
        }
      }
      break;
    }
    case 'backtracker': {
      const seen = new Uint8Array(n);
      for (let s = 0; s < n; s++) {
        if (seen[s]) continue;
        seen[s] = 1;
        const stack = [s];
        while (stack.length) {
          const u = stack[stack.length - 1];
          const opts = g.adj[u].filter(({ e, to }) => inside[e] && !seen[to]);
          if (!opts.length) {
            stack.pop();
            continue;
          }
          // Biased random choice: lower weight more likely.
          opts.sort((a, b) => w[a.e] - w[b.e]);
          const pick = opts[Math.min(opts.length - 1, Math.floor(Math.pow(R.next(), 1.5) * opts.length))];
          seen[pick.to] = 1;
          tree.push(pick.e);
          stack.push(pick.to);
        }
      }
      break;
    }
    case 'wilson': {
      // Loop-erased random walks: uniform spanning tree per cluster.
      const inTree = new Uint8Array(n);
      const next = new Int32Array(n).fill(-1);
      const nextEdge = new Int32Array(n).fill(-1);
      const rootOf = new Map<number, number>();
      for (let v = 0; v < n; v++) if (!rootOf.has(label[v])) {
        rootOf.set(label[v], v);
        inTree[v] = 1;
      }
      const order = R.shuffle(Array.from({ length: n }, (_, i) => i));
      for (const start of order) {
        let u = start;
        let guard = 0;
        while (!inTree[u] && guard++ < 200000) {
          const opts = g.adj[u].filter(({ e }) => inside[e]);
          if (!opts.length) break;
          const pick = opts[R.int(opts.length)];
          next[u] = pick.to;
          nextEdge[u] = pick.e;
          u = pick.to;
        }
        u = start;
        while (!inTree[u] && next[u] >= 0) {
          inTree[u] = 1;
          tree.push(nextEdge[u]);
          u = next[u];
        }
        inTree[start] = 1;
      }
      break;
    }
  }
  return tree;
}

function edgeLen(g: SurfaceGraph, e: number) {
  const p = g.edges[e].pts;
  let l = 0;
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]);
  return l;
}

/** One start node per cluster: random, or the node nearest the cluster centroid. */
function clusterStarts(g: SurfaceGraph, label: Int32Array, centre: boolean, R: ReturnType<typeof rng>): number[] {
  const groups = new Map<number, number[]>();
  label.forEach((c, i) => {
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(i);
  });
  const out: number[] = [];
  for (const members of groups.values()) {
    if (!centre) {
      out.push(members[R.int(members.length)]);
      continue;
    }
    const c = [0, 0, 0];
    for (const i of members) for (let k = 0; k < 3; k++) c[k] += g.nodePos[i][k] / members.length;
    let best = members[0], bd = Infinity;
    for (const i of members) {
      const p = g.nodePos[i];
      const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    out.push(best);
  }
  return out;
}
