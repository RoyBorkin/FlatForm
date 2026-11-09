/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import type { MeshData } from '../types';
import type { V3 } from '../math/vec';

export type SDF = (x: number, y: number, z: number) => number;

/**
 * Naive Surface Nets: one vertex per sign-changing cell, one quad per
 * sign-changing grid edge. Produces well-shaped, watertight, consistently
 * oriented meshes with far fewer slivers than marching cubes.
 */
export function surfaceNets(f: SDF, min: V3, max: V3, resolution: number): MeshData {
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const h = Math.max(size[0], size[1], size[2]) / Math.max(8, resolution);
  const nx = Math.ceil(size[0] / h) + 2;
  const ny = Math.ceil(size[1] / h) + 2;
  const nz = Math.ceil(size[2] / h) + 2;
  const ox = min[0] - h, oy = min[1] - h, oz = min[2] - h;
  // Sample values at grid points (nx+1)(ny+1)(nz+1).
  const sx = nx + 1, sy = ny + 1, sz = nz + 1;
  const val = new Float32Array(sx * sy * sz);
  const id = (i: number, j: number, k: number) => i + sx * (j + sy * k);
  for (let k = 0; k < sz; k++)
    for (let j = 0; j < sy; j++)
      for (let i = 0; i < sx; i++) {
        const v = f(ox + i * h, oy + j * h, oz + k * h);
        val[id(i, j, k)] = Math.abs(v) < 1e-9 ? 1e-9 : v;
      }
  // Vertex per cell.
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const cid = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const pos: number[] = [];
  const corners = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = val[id(i + corners[c][0], j + corners[c][1], k + corners[c][2])];
          cv[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let ax = 0, ay = 0, az = 0, n = 0;
        for (const [a, b] of edges) {
          const va = cv[a], vb = cv[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          ax += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
          ay += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
          az += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
          n++;
        }
        cellVert[cid(i, j, k)] = pos.length / 3;
        pos.push(ox + (i + ax / n) * h, oy + (j + ay / n) * h, oz + (k + az / n) * h);
      }
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < sz; k++)
    for (let j = 0; j < sy; j++)
      for (let i = 0; i < sx; i++) {
        const v0 = val[id(i, j, k)];
        // x edge
        if (i < nx && j > 0 && k > 0 && j < ny && k < nz) {
          const v1 = val[id(i + 1, j, k)];
          if (v0 < 0 !== v1 < 0)
            quad(cellVert[cid(i, j - 1, k - 1)], cellVert[cid(i, j, k - 1)], cellVert[cid(i, j, k)], cellVert[cid(i, j - 1, k)], !(v0 < 0));
        }
        // y edge: plane (z, x)
        if (j < ny && i > 0 && k > 0 && i < nx && k < nz) {
          const v1 = val[id(i, j + 1, k)];
          if (v0 < 0 !== v1 < 0)
            quad(cellVert[cid(i - 1, j, k - 1)], cellVert[cid(i - 1, j, k)], cellVert[cid(i, j, k)], cellVert[cid(i, j, k - 1)], !(v0 < 0));
        }
        // z edge: plane (x, y)
        if (k < nz && i > 0 && j > 0 && i < nx && j < ny) {
          const v1 = val[id(i, j, k + 1)];
          if (v0 < 0 !== v1 < 0)
            quad(cellVert[cid(i - 1, j - 1, k)], cellVert[cid(i, j - 1, k)], cellVert[cid(i, j, k)], cellVert[cid(i - 1, j, k)], !(v0 < 0));
        }
      }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

// ------------------------------------------------------------- SDF helpers

export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Distance to a tapered capsule from a (radius ra) to b (radius rb). */
export function sdTaperedCapsule(x: number, y: number, z: number, a: V3, b: V3, ra: number, rb: number): number {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const l2 = bax * bax + bay * bay + baz * baz || 1e-9;
  let t = (pax * bax + pay * bay + paz * baz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = pax - bax * t, dy = pay - bay * t, dz = paz - baz * t;
  return Math.hypot(dx, dy, dz) - (ra + (rb - ra) * t);
}
