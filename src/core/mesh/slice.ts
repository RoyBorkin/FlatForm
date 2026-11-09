/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import type { MeshData, Path2 } from '../types';
import type { V3 } from '../math/vec';

export interface PlaneFrame {
  u: V3;
  v: V3;
  n: V3;
}

/** Plane frames whose v axis points up (z) when possible, so slots run vertically. */
export function axisFrame(axis: 'x' | 'y' | 'z'): PlaneFrame {
  switch (axis) {
    case 'x':
      return { u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] };
    case 'y':
      return { u: [-1, 0, 0], v: [0, 0, 1], n: [0, 1, 0] };
    default:
      return { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
  }
}

/**
 * Intersect a mesh with the plane dot(n, p) = d. Returns closed loops and
 * open chains (from open surfaces) in the plane's (u, v) coordinates.
 */
export function slicePlane(m: MeshData, f: PlaneFrame, d: number): { closed: Path2[]; open: Path2[] } {
  const p = m.positions;
  const nv = p.length / 3;
  const s = new Float64Array(nv);
  for (let i = 0; i < nv; i++) {
    let v = f.n[0] * p[i * 3] + f.n[1] * p[i * 3 + 1] + f.n[2] * p[i * 3 + 2] - d;
    if (Math.abs(v) < 1e-7) v = 1e-7; // nudge vertices sitting exactly on the plane
    s[i] = v;
  }
  const point = new Map<number, Path2[number]>();
  const key = (a: number, b: number) => (a < b ? a * nv + b : b * nv + a);
  const at = (a: number, b: number) => {
    const k = key(a, b);
    if (!point.has(k)) {
      const t = s[a] / (s[a] - s[b]);
      const x = p[a * 3] + (p[b * 3] - p[a * 3]) * t;
      const y = p[a * 3 + 1] + (p[b * 3 + 1] - p[a * 3 + 1]) * t;
      const z = p[a * 3 + 2] + (p[b * 3 + 2] - p[a * 3 + 2]) * t;
      point.set(k, [x * f.u[0] + y * f.u[1] + z * f.u[2], x * f.v[0] + y * f.v[1] + z * f.v[2]]);
    }
    return k;
  };
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    if (!links.has(a)) links.set(a, []);
    if (!links.has(b)) links.set(b, []);
    links.get(a)!.push(b);
    links.get(b)!.push(a);
  };
  const idx = m.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]];
    const ks: number[] = [];
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3];
      if (s[a] < 0 !== s[b] < 0) ks.push(at(a, b));
    }
    if (ks.length === 2) link(ks[0], ks[1]);
  }
  const used = new Set<number>();
  const closed: Path2[] = [];
  const open: Path2[] = [];
  const walk = (start: number) => {
    const chain = [start];
    used.add(start);
    let cur = start;
    for (;;) {
      const nx = (links.get(cur) ?? []).find((x) => !used.has(x));
      if (nx === undefined) break;
      used.add(nx);
      chain.push(nx);
      cur = nx;
    }
    return chain;
  };
  // Open chains start at endpoints (degree 1).
  for (const [k, l] of links) {
    if (used.has(k) || l.length !== 1) continue;
    const c = walk(k);
    if (c.length > 1) open.push(c.map((x) => point.get(x)!));
  }
  for (const k of links.keys()) {
    if (used.has(k)) continue;
    const c = walk(k);
    if (c.length > 2) closed.push(c.map((x) => point.get(x)!));
  }
  return { closed, open };
}

export function projectRange(m: MeshData, n: V3): [number, number] {
  let lo = Infinity, hi = -Infinity;
  const p = m.positions;
  for (let i = 0; i < p.length; i += 3) {
    const v = n[0] * p[i] + n[1] * p[i + 1] + n[2] * p[i + 2];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}
