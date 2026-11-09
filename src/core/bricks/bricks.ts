/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * LEGO bricks: the shape is voxelised on the real LEGO grid (8 mm studs,
 * 9.6 mm bricks or 3.2 mm plates), optionally hollowed, and each layer is
 * filled with the largest standard bricks that fit. Brick direction
 * alternates between layers so joints overlap like a brick wall, and the
 * build is checked for loose groups that no stud holds.
 */
import type { BrickPlacement, MeshData, MethodResult } from '../types';
import type { BricksParams } from '../params';
import { bbox } from '../mesh/mesh';
import { slicePlane, type PlaneFrame } from '../mesh/slice';
import { sectionRegion } from '../slices/section';
import type { Path2 } from '../types';
import { LEGO_PARTS } from '../presets';
import { rng } from '../math/rng';
import { brickCells, cornerCells } from './catalog';

export const STUD = 8;
export const BRICK_H = 9.6;
export const PLATE_H = 3.2;

/** x-centres (as cell indices) inside an even-odd region along the row y = yc. */
function rowCells(region: Path2[], yc: number, x0: number, nx: number, out: Uint8Array, rowOffset: number) {
  const xs: number[] = [];
  for (const poly of region)
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], b = poly[i];
      if (a[1] > yc === b[1] > yc) continue;
      xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
  xs.sort((p, q) => p - q);
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const i0 = Math.max(0, Math.ceil((xs[k] - x0) / STUD - 0.5));
    const i1 = Math.min(nx - 1, Math.floor((xs[k + 1] - x0) / STUD - 0.5));
    for (let i = i0; i <= i1; i++) out[rowOffset + i] = 1;
  }
}

export function buildBricks(surface: MeshData, P: BricksParams, onProgress?: (f: number, s: string) => void): MethodResult {
  const warnings: string[] = [];
  const H = P.unit === 'plate' ? PLATE_H : BRICK_H;
  const b = bbox(surface);
  const nx = Math.max(1, Math.ceil(b.size[0] / STUD)), ny = Math.max(1, Math.ceil(b.size[1] / STUD)), nz = Math.max(1, Math.ceil(b.size[2] / H));
  const cells = nx * ny * nz;
  if (cells > 3_000_000) {
    return { parts: [], assembly: { kind: 'planar', thickness: H }, overlays: {}, stats: {}, warnings: [`At this size the build is ${nx} × ${ny} studs and ${nz} layers. Make the shape smaller in the Surface step.`] };
  }
  // Centre the grid on the shape.
  const x0 = b.center[0] - (nx * STUD) / 2, y0 = b.center[1] - (ny * STUD) / 2, z0 = b.min[2];
  const frame: PlaneFrame = { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
  const occ = new Uint8Array(cells);
  const idx = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) {
    const s = slicePlane(surface, frame, z0 + (k + 0.5) * H);
    const region = sectionRegion(s.closed, s.open, STUD, false);
    for (let j = 0; j < ny; j++) rowCells(region, y0 + (j + 0.5) * STUD, x0, nx, occ, idx(0, j, k));
    if (k % 8 === 0) onProgress?.((0.4 * k) / nz, 'Voxelising');
  }
  // Hollow: keep cells within `shell` studs of the outside (3D chamfer distance).
  if (P.hollow) {
    const dist = new Int32Array(cells).fill(1 << 20);
    const q: number[] = [];
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const c = idx(i, j, k);
          if (!occ[c]) continue;
          const edge = i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1 || !occ[c - 1] || !occ[c + 1] || !occ[c - nx] || !occ[c + nx] || !occ[c - nx * ny] || !occ[c + nx * ny];
          if (edge) {
            dist[c] = 1;
            q.push(c);
          }
        }
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      const k = Math.floor(c / (nx * ny)), j = Math.floor((c % (nx * ny)) / nx), i = c % nx;
      const nb = [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, j > 0 ? c - nx : -1, j < ny - 1 ? c + nx : -1, k > 0 ? c - nx * ny : -1, k < nz - 1 ? c + nx * ny : -1];
      for (const n of nb)
        if (n >= 0 && occ[n] && dist[n] > dist[c] + 1) {
          dist[n] = dist[c] + 1;
          q.push(n);
        }
    }
    const shell = Math.max(1, Math.round(P.shell));
    for (let c = 0; c < cells; c++) if (occ[c] && dist[c] > shell) occ[c] = 0;
  }
  onProgress?.(0.5, 'Placing bricks');

  // Footprints, largest first; each tried in the layer's preferred direction first.
  const unitOk = (sz: string) => P.unit === 'plate' || !!LEGO_PARTS[sz]?.brick;
  type Shape = { kind: 'rect'; a: number; b: number } | { kind: 'corner' };
  const shapes: Shape[] = (P.sizes.length ? P.sizes : ['1x1'])
    .filter(unitOk)
    .map((s) => s.split('x').map(Number) as [number, number])
    .map(([a, c]) => ({ kind: 'rect' as const, a, b: c }));
  if (!shapes.some((q) => q.kind === 'rect' && q.a === 1 && q.b === 1)) shapes.push({ kind: 'rect', a: 1, b: 1 }); // always able to fill a single stud
  if (P.corners) shapes.push({ kind: 'corner' });
  const area = (q: Shape) => (q.kind === 'corner' ? 3 : q.a * q.b);
  // Corners go before the straight 3-stud and smaller pieces, so they actually get used.
  shapes.sort((p, q) => area(q) - area(p) || (p.kind === 'corner' ? -1 : q.kind === 'corner' ? 1 : (q as { b: number }).b - (p as { b: number }).b));
  const R = rng(P.seed * 7919 + 13);
  const bricks: BrickPlacement[] = [];
  const owner = new Int32Array(cells).fill(-1);
  const colorOf = (k: number) => {
    const pal = P.palette.length ? P.palette : [P.color];
    if (P.colorMode === 'single') return P.color;
    if (P.colorMode === 'layers') return pal[k % pal.length];
    return pal[Math.min(pal.length - 1, Math.floor((k / nz) * pal.length))];
  };
  const free = (i: number, j: number, k: number) => i >= 0 && j >= 0 && i < nx && j < ny && occ[idx(i, j, k)] === 1 && owner[idx(i, j, k)] < 0;
  for (let k = 0; k < nz; k++) {
    const alongX = !P.stagger || k % 2 === 0;
    const order: [number, number][] = [];
    if (alongX) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) order.push([i, j]);
    else for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) order.push([i, j]);
    for (const [i, j] of order) {
      if (!free(i, j, k)) continue;
      // Every placement of every piece that covers this cell, best first.
      const fits: BrickPlacement[] = [];
      for (const sh of shapes) {
        if (sh.kind === 'corner') {
          for (let rot = 0; rot < 4; rot++) {
            const cs = cornerCells(rot);
            for (const [ci, cj] of cs) {
              const x = i - ci, y = j - cj;
              if (cs.every(([a, b]) => free(x + a, y + b, k))) {
                fits.push({ x, y, z: k, w: 2, d: 2, color: 0, shape: 'corner', rot });
                break;
              }
            }
            if (fits.length && fits[fits.length - 1].shape === 'corner') break;
          }
          continue;
        }
        const options: [number, number][] = alongX ? [[sh.b, sh.a], [sh.a, sh.b]] : [[sh.a, sh.b], [sh.b, sh.a]];
        for (const [w, d] of options) {
          if (i + w > nx || j + d > ny) continue;
          let ok = true;
          for (let dj = 0; dj < d && ok; dj++) for (let di = 0; di < w && ok; di++) ok = free(i + di, j + dj, k);
          if (ok) {
            fits.push({ x: i, y: j, z: k, w, d, color: 0 });
            break;
          }
        }
      }
      if (!fits.length) continue;
      // Variety: now and then skip the biggest piece that fits.
      let pick = 0;
      while (pick < fits.length - 1 && P.mix > 0 && R.next() < P.mix * 0.6) pick++;
      const br = { ...fits[pick], color: colorOf(k) };
      if (P.round > 0 && !br.shape && br.w === br.d && (br.w === 1 || br.w === 2) && R.next() < P.round) br.shape = 'round';
      const id = bricks.length;
      bricks.push(br);
      for (const [a, b] of brickCells(br)) owner[idx(a, b, k)] = id;
    }
    if (k % 6 === 0) onProgress?.(0.5 + (0.4 * k) / nz, 'Placing bricks');
  }
  if (!bricks.length) warnings.push('The shape is smaller than one stud. Make it bigger in the Surface step.');

  // Connectivity: bricks are held when they share at least one stud with a brick above or below.
  const parent = bricks.map((_, i) => i);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  for (let c = 0; c + nx * ny < cells; c++) {
    const a = owner[c], up = owner[c + nx * ny];
    if (a >= 0 && up >= 0) parent[find(a)] = find(up);
  }
  const size = new Map<number, number>();
  for (let i = 0; i < bricks.length; i++) size.set(find(i), (size.get(find(i)) ?? 0) + 1);
  const groups = [...size.values()].sort((p, q) => q - p);
  const loose = groups.slice(1).reduce((s, n) => s + n, 0);
  if (groups.length > 1) warnings.push(`${groups.length - 1} loose group${groups.length > 2 ? 's' : ''} (${loose} brick${loose > 1 ? 's' : ''}) are not held by any stud. Thicken the shell, turn off hollow, or glue them.`);
  const corners = bricks.filter((q) => q.shape === 'corner').length, rounds = bricks.filter((q) => q.shape === 'round').length;
  const studs = bricks.reduce((s, br) => s + brickCells(br).length, 0);
  return {
    parts: [],
    assembly: { kind: 'planar', thickness: H, bricks: { origin: [x0, y0, z0], unit: H } },
    overlays: {},
    stats: { bricks: bricks.length, layers: nz, studs, footprint: nx * ny, looseBricks: loose, corners, round: rounds },
    warnings,
    kit: { bricks, brickUnit: P.unit },
  };
}
