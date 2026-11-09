/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import type { MeshData } from '../types';
import { compact } from './mesh';
import type { V3 } from '../math/vec';

/**
 * Cut a mesh with a plane, keeping the side where dot(n, p) - d <= 0.
 * Crossing triangles are split so the opening has a clean, straight rim.
 * If `region` is given (a sphere, or a per-vertex mask), only triangles
 * touching it are cut, which lets us open one tube end without slicing
 * through the rest of the shape.
 */
export function clipByPlane(m: MeshData, n: V3, d: number, region?: { c: V3; r: number } | Uint8Array): MeshData {
  const p = m.positions;
  const nv = p.length / 3;
  const s = new Float64Array(nv);
  const inRegion = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    s[i] = n[0] * x + n[1] * y + n[2] * z - d;
    if (!region) inRegion[i] = 1;
    else if (region instanceof Uint8Array) inRegion[i] = region[i];
    else {
      const dx = x - region.c[0], dy = y - region.c[1], dz = z - region.c[2];
      inRegion[i] = dx * dx + dy * dy + dz * dz <= region.r * region.r ? 1 : 0;
    }
  }
  const pos: number[] = Array.from(p);
  const idx: number[] = [];
  const cache = new Map<number, number>();
  const cut = (a: number, b: number) => {
    const key = a < b ? a * nv + b : b * nv + a;
    let v = cache.get(key);
    if (v !== undefined) return v;
    const t = s[a] / (s[a] - s[b]);
    v = pos.length / 3;
    pos.push(
      p[a * 3] + (p[b * 3] - p[a * 3]) * t,
      p[a * 3 + 1] + (p[b * 3 + 1] - p[a * 3 + 1]) * t,
      p[a * 3 + 2] + (p[b * 3 + 2] - p[a * 3 + 2]) * t,
    );
    cache.set(key, v);
    return v;
  };
  const ind = m.indices;
  for (let t = 0; t < ind.length; t += 3) {
    const v = [ind[t], ind[t + 1], ind[t + 2]];
    const active = inRegion[v[0]] || inRegion[v[1]] || inRegion[v[2]];
    if (!active) {
      idx.push(v[0], v[1], v[2]);
      continue;
    }
    const keep = v.map((i) => s[i] <= 0);
    const k = keep.filter(Boolean).length;
    if (k === 3) idx.push(v[0], v[1], v[2]);
    else if (k === 0) continue;
    else {
      // Rotate so the odd vertex is first.
      let r = 0;
      if (k === 1) r = keep.indexOf(true);
      else r = keep.indexOf(false);
      const a = v[r], b = v[(r + 1) % 3], c = v[(r + 2) % 3];
      const ab = cut(a, b), ac = cut(a, c);
      if (k === 1) idx.push(a, ab, ac);
      else idx.push(ab, b, c, ab, c, ac);
    }
  }
  return compact({ positions: new Float32Array(pos), indices: new Uint32Array(idx) });
}
