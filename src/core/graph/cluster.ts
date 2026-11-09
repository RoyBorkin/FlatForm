/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import type { SurfaceGraph } from './graph';
import { edgeLength } from './graph';
import { rng } from '../math/rng';

/** Binary min-heap keyed by number. */
export class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k, v = this.v;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] | undefined {
    const k = this.k, v = this.v;
    if (!k.length) return undefined;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Multi-source Dijkstra region growing. Returns cluster id per node. */
function grow(g: SurfaceGraph, seeds: number[], lens: Float64Array): Int32Array {
  const n = g.nodePos.length;
  const label = new Int32Array(n).fill(-1);
  const dist = new Float64Array(n).fill(Infinity);
  const h = new MinHeap();
  seeds.forEach((s, i) => {
    dist[s] = 0;
    label[s] = i;
    h.push(0, s);
  });
  for (;;) {
    const top = h.pop();
    if (!top) break;
    const [d, u] = top;
    if (d > dist[u]) continue;
    for (const { e, to } of g.adj[u]) {
      const nd = d + lens[e];
      if (nd < dist[to]) {
        dist[to] = nd;
        label[to] = label[u];
        h.push(nd, to);
      }
    }
  }
  return label;
}

/**
 * Partition the graph into k connected clusters of roughly equal size
 * (geodesic k-means: farthest-point seeds, then Lloyd iterations).
 * Disconnected leftovers are adopted by a neighbouring cluster.
 */
export function clusterGraph(g: SurfaceGraph, k: number, seed: number, iterations = 6): Int32Array {
  const n = g.nodePos.length;
  if (n === 0) return new Int32Array(0);
  k = Math.max(1, Math.min(k, n));
  const R = rng(seed);
  const lens = new Float64Array(g.edges.length);
  for (let e = 0; e < g.edges.length; e++) lens[e] = edgeLength(g, e) * (1 + 0.15 * R.next());
  // Farthest point seeding.
  const seeds = [R.int(n)];
  while (seeds.length < k) {
    const dist = new Float64Array(n).fill(Infinity);
    const h = new MinHeap();
    for (const s of seeds) {
      dist[s] = 0;
      h.push(0, s);
    }
    for (;;) {
      const top = h.pop();
      if (!top) break;
      const [d, u] = top;
      if (d > dist[u]) continue;
      for (const { e, to } of g.adj[u]) {
        const nd = d + lens[e];
        if (nd < dist[to]) {
          dist[to] = nd;
          h.push(nd, to);
        }
      }
    }
    let best = -1, bd = -1;
    for (let i = 0; i < n; i++) if (dist[i] > bd && dist[i] !== Infinity) {
      bd = dist[i];
      best = i;
    }
    if (best < 0 || bd === 0) {
      // Disconnected graph: pick any unreached node.
      const un = dist.findIndex((d) => d === Infinity);
      if (un < 0) break;
      seeds.push(un);
    } else seeds.push(best);
    if (seeds.length > 64 && seeds.length < k) {
      // Speed: add the remaining seeds randomly among the farthest half.
      const order = Array.from(dist.keys()).sort((a, b) => dist[b] - dist[a]);
      const pool = order.slice(0, Math.max(k * 3, 1));
      R.shuffle(pool);
      for (const p of pool) {
        if (seeds.length >= k) break;
        if (!seeds.includes(p)) seeds.push(p);
      }
    }
  }
  let label = grow(g, seeds, lens);
  for (let it = 0; it < iterations; it++) {
    // Move each seed to the member closest to the cluster centroid.
    const sum = Array.from({ length: seeds.length }, () => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const c = label[i];
      if (c < 0) continue;
      const p = g.nodePos[i];
      sum[c][0] += p[0];
      sum[c][1] += p[1];
      sum[c][2] += p[2];
      sum[c][3]++;
    }
    const best = new Float64Array(seeds.length).fill(Infinity);
    const next = seeds.slice();
    for (let i = 0; i < n; i++) {
      const c = label[i];
      if (c < 0 || !sum[c][3]) continue;
      const p = g.nodePos[i];
      const d = (p[0] - sum[c][0] / sum[c][3]) ** 2 + (p[1] - sum[c][1] / sum[c][3]) ** 2 + (p[2] - sum[c][2] / sum[c][3]) ** 2;
      if (d < best[c]) {
        best[c] = d;
        next[c] = i;
      }
    }
    seeds.splice(0, seeds.length, ...next);
    label = grow(g, seeds, lens);
  }
  // Unreached nodes (separate components without seeds) get their own clusters.
  let extra = seeds.length;
  for (let i = 0; i < n; i++) {
    if (label[i] >= 0) continue;
    const stack = [i];
    label[i] = extra;
    while (stack.length) {
      const u = stack.pop()!;
      for (const { to } of g.adj[u]) if (label[to] < 0) {
        label[to] = extra;
        stack.push(to);
      }
    }
    extra++;
  }
  return label;
}
