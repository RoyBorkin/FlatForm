/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Nesting. Two strategies:
 *  - fast: MaxRects (best short side fit) on minimum-area bounding boxes.
 *  - tight: raster bottom-left fill. Each part is rasterised conservatively
 *    (dilated by spacing + half a cell diagonal), so the real outlines can
 *    never collide even though the search runs on a bitmap. Branching parts
 *    interlock with each other, which boxes never allow.
 */
import type { NestResult, Part2D, Path2, Placement, SheetLayout } from '../types';
import type { NestParams, SheetParams } from '../params';
import { bounds, transformPaths } from '../polygon/polygon';

export interface NestInput {
  parts: Part2D[];
  sheet: SheetParams;
  nest: NestParams;
  onProgress?: (f: number) => void;
}

export function nestParts(input: NestInput): NestResult {
  const { parts, sheet, nest } = input;
  const groups = new Map<number, Part2D[]>();
  for (const p of parts) {
    const g = nest.groupByLayer ? p.group : 0;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(p);
  }
  const sheets: SheetLayout[] = [];
  const unplaced: string[] = [];
  let done = 0;
  for (const [group, list] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const r = nest.mode === 'fast' ? nestRects(list, sheet, nest) : nestRaster(list, sheet, nest, (k) => input.onProgress?.((done + k) / parts.length));
    done += list.length;
    const offset = sheets.length;
    for (const s of r.sheets) sheets.push({ ...s, index: offset + s.index, group, placements: s.placements.map((p) => ({ ...p, sheet: offset + s.index })) });
    unplaced.push(...r.unplaced);
  }
  return { sheets, unplaced };
}

// ----------------------------------------------------------------- MaxRects

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function nestRects(parts: Part2D[], S: SheetParams, N: NestParams): NestResult {
  const W = S.width - 2 * S.margin, H = S.height - 2 * S.margin;
  const items = parts
    .map((p) => ({ p, w: p.bbox.maxX - p.bbox.minX + S.spacing, h: p.bbox.maxY - p.bbox.minY + S.spacing }))
    .sort((a, b) => b.w * b.h - a.w * a.h);
  const bins: { free: Rect[]; placements: Placement[]; area: number }[] = [];
  const unplaced: string[] = [];
  const allowRot = N.rotations > 1;
  for (const it of items) {
    let placed = false;
    for (let bi = 0; bi <= bins.length && !placed; bi++) {
      if (bi === bins.length) {
        if (!(it.w <= W + S.spacing && it.h <= H + S.spacing) && !(allowRot && it.h <= W + S.spacing && it.w <= H + S.spacing)) break;
        bins.push({ free: [{ x: 0, y: 0, w: W + S.spacing, h: H + S.spacing }], placements: [], area: 0 });
      }
      const bin = bins[bi];
      let best: { r: Rect; rot: boolean; score: number } | null = null;
      for (const fr of bin.free) {
        for (const rot of allowRot ? [false, true] : [false]) {
          const w = rot ? it.h : it.w, h = rot ? it.w : it.h;
          if (w <= fr.w && h <= fr.h) {
            const score = Math.min(fr.w - w, fr.h - h);
            if (!best || score < best.score) best = { r: { x: fr.x, y: fr.y, w, h }, rot, score };
          }
        }
      }
      if (!best) continue;
      const { r, rot } = best;
      // Split free rects.
      const next: Rect[] = [];
      for (const fr of bin.free) {
        if (r.x >= fr.x + fr.w || r.x + r.w <= fr.x || r.y >= fr.y + fr.h || r.y + r.h <= fr.y) {
          next.push(fr);
          continue;
        }
        if (r.x > fr.x) next.push({ x: fr.x, y: fr.y, w: r.x - fr.x, h: fr.h });
        if (r.x + r.w < fr.x + fr.w) next.push({ x: r.x + r.w, y: fr.y, w: fr.x + fr.w - r.x - r.w, h: fr.h });
        if (r.y > fr.y) next.push({ x: fr.x, y: fr.y, w: fr.w, h: r.y - fr.y });
        if (r.y + r.h < fr.y + fr.h) next.push({ x: fr.x, y: r.y + r.h, w: fr.w, h: fr.y + fr.h - r.y - r.h });
      }
      bin.free = next.filter((a, i) => !next.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w * a.h < b.w * b.h)));
      bin.placements.push(
        rot
          ? { partId: it.p.id, sheet: bi, x: S.margin + r.x + (it.p.bbox.maxY - it.p.bbox.minY) + it.p.bbox.minY, y: S.margin + r.y - it.p.bbox.minX, rot: Math.PI / 2 }
          : { partId: it.p.id, sheet: bi, x: S.margin + r.x - it.p.bbox.minX, y: S.margin + r.y - it.p.bbox.minY, rot: 0 },
      );
      bin.area += it.p.area;
      placed = true;
    }
    if (!placed) unplaced.push(it.p.id);
  }
  return {
    sheets: bins.map((b, i) => ({ index: i, group: 0, width: S.width, height: S.height, placements: b.placements, utilisation: b.area / (W * H) })),
    unplaced,
  };
}

// ----------------------------------------------------------------- raster

interface Mask {
  rot: number;
  w: number; // cells
  h: number;
  words: number;
  rows: Uint32Array[]; // test footprint (grown by the spacing), h rows of `words` words
  stamp: Uint32Array[]; // footprint written to the sheet
  ox: number; // rotated-dilated bbox min (mm)
  oy: number;
  cells: number;
}

function scanFill(paths: Path2[], x0: number, y0: number, cell: number, w: number, h: number): Uint8Array {
  const grid = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const y = y0 + (j + 0.5) * cell;
    const xs: number[] = [];
    for (const p of paths)
      for (let i = 0, k = p.length - 1; i < p.length; k = i++) {
        const [xa, ya] = p[k], [xb, yb] = p[i];
        if (ya > y !== yb > y) xs.push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
      }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - x0) / cell - 0.5));
      const i1 = Math.min(w - 1, Math.floor((xs[q + 1] - x0) / cell - 0.5));
      for (let i = i0; i <= i1; i++) grid[j * w + i] = 1;
    }
  }
  return grid;
}

/** Square (Chebyshev) dilation of a binary grid by k cells, separable. */
function dilate(g0: Uint8Array, w: number, h: number, k: number): Uint8Array {
  if (k <= 0) return g0;
  const g1 = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    let last = -1e9;
    for (let i = 0; i < w; i++) {
      if (g0[j * w + i]) last = i;
      if (i - last <= k) g1[j * w + i] = 1;
    }
    last = 1e9;
    for (let i = w - 1; i >= 0; i--) {
      if (g0[j * w + i]) last = i;
      if (last - i <= k) g1[j * w + i] = 1;
    }
  }
  const g = new Uint8Array(w * h);
  for (let i = 0; i < w; i++) {
    let last = -1e9;
    for (let j = 0; j < h; j++) {
      if (g1[j * w + i]) last = j;
      if (j - last <= k) g[j * w + i] = 1;
    }
    last = 1e9;
    for (let j = h - 1; j >= 0; j--) {
      if (g1[j * w + i]) last = j;
      if (last - j <= k) g[j * w + i] = 1;
    }
  }
  return g;
}

function toRows(g: Uint8Array, w: number, h: number): Uint32Array[] {
  const words = (w + 31) >>> 5;
  const rows: Uint32Array[] = [];
  for (let j = 0; j < h; j++) {
    const r = new Uint32Array(words);
    for (let i = 0; i < w; i++) if (g[j * w + i]) r[i >>> 5] |= 1 << (i & 31);
    rows.push(r);
  }
  return rows;
}

/**
 * Two masks per orientation: the exact-but-conservative footprint (every cell
 * the outline touches) is what gets stamped on the sheet, and the same
 * footprint grown by the part spacing is what gets tested against it.
 */
function buildMask(outline: Path2[], rot: number, spacing: number, cell: number): Mask {
  const rotated = transformPaths(outline, rot, 0, 0);
  const k = Math.ceil(spacing / cell);
  const b = bounds(rotated);
  const x0 = b.minX - (k + 1) * cell, y0 = b.minY - (k + 1) * cell;
  const w = Math.max(1, Math.ceil((b.maxX - b.minX) / cell) + 2 * k + 3);
  const h = Math.max(1, Math.ceil((b.maxY - b.minY) / cell) + 2 * k + 3);
  const core = scanFill(rotated, x0, y0, cell, w, h);
  // Supercover the outline edges so the footprint never misses a sliver.
  for (const p of rotated)
    for (let i = 0; i < p.length; i++) {
      const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (cell * 0.45)));
      for (let s = 0; s <= steps; s++) {
        const x = ax + ((bx - ax) * s) / steps, y = ay + ((by - ay) * s) / steps;
        const ci = Math.floor((x - x0) / cell), cj = Math.floor((y - y0) / cell);
        if (ci >= 0 && cj >= 0 && ci < w && cj < h) core[cj * w + ci] = 1;
      }
    }
  const test = dilate(core, w, h, k);
  let cells = 0;
  for (let i = 0; i < core.length; i++) cells += core[i];
  return { rot, w, h, words: (w + 31) >>> 5, rows: toRows(test, w, h), stamp: toRows(core, w, h), ox: x0, oy: y0, cells };
}

class SheetGrid {
  rows: Uint32Array[];
  words: number;
  /** Lowest row index that still has any free cell (skips full rows). */
  constructor(public w: number, public h: number) {
    this.words = ((w + 31) >>> 5) + 1;
    this.rows = Array.from({ length: h }, () => new Uint32Array(this.words));
    this.freeCells = w * h;
    // Mark cells beyond the width as occupied.
    for (const r of this.rows)
      for (let i = w; i < this.words * 32; i++) r[i >>> 5] |= 1 << (i & 31);
  }
  fits(m: Mask, x: number, y: number): boolean {
    if (x + m.w > this.w || y + m.h > this.h) return false;
    const wi = x >>> 5, off = x & 31;
    for (let j = 0; j < m.h; j++) {
      const sr = this.rows[y + j], pr = m.rows[j];
      for (let k = 0; k < m.words; k++) {
        const bits = pr[k];
        if (!bits) continue;
        if (sr[wi + k] & (bits << off)) return false;
        if (off && sr[wi + k + 1] & (bits >>> (32 - off))) return false;
      }
    }
    return true;
  }
  place(m: Mask, x: number, y: number) {
    const wi = x >>> 5, off = x & 31;
    for (let j = 0; j < m.h; j++) {
      const sr = this.rows[y + j], pr = m.stamp[j];
      for (let k = 0; k < m.words; k++) {
        const bits = pr[k];
        if (!bits) continue;
        sr[wi + k] |= bits << off;
        if (off) sr[wi + k + 1] |= bits >>> (32 - off);
      }
    }
    this.freeCells -= m.cells;
  }
  /** Bottom-left first fit whose top edge stays below `maxTop` (exclusive). */
  find(m: Mask, maxTop = Infinity): [number, number] | null {
    const yEnd = Math.min(this.h - m.h, maxTop - m.h);
    for (let y = this.firstFreeRow(); y <= yEnd; y++) {
      for (let x = 0; x + m.w <= this.w; x++) if (this.fits(m, x, y)) return [x, y];
    }
    return null;
  }
  private freeRow = 0;
  /** Rows below this are completely full. */
  firstFreeRow(): number {
    const full = 0xffffffff | 0;
    while (this.freeRow < this.h && this.rows[this.freeRow].every((w) => (w | 0) === full)) this.freeRow++;
    return this.freeRow;
  }
  freeCells = 0;
  failures = 0;
}

function nestRaster(parts: Part2D[], S: SheetParams, N: NestParams, progress: (k: number) => void): NestResult {
  const cell = Math.max(0.5, N.resolution);
  const W = S.width - 2 * S.margin, H = S.height - 2 * S.margin;
  const gw = Math.floor(W / cell), gh = Math.floor(H / cell);
  const order = parts.slice().sort((a, b) => {
    const da = Math.max(a.bbox.maxX - a.bbox.minX, a.bbox.maxY - a.bbox.minY);
    const db = Math.max(b.bbox.maxX - b.bbox.minX, b.bbox.maxY - b.bbox.minY);
    return db * Math.sqrt(b.area) - da * Math.sqrt(a.area);
  });
  const rots = Array.from({ length: N.rotations }, (_, i) => (i * Math.PI * 2) / N.rotations);
  const sheets: { grid: SheetGrid; placements: Placement[]; area: number }[] = [];
  const unplaced: string[] = [];
  order.forEach((p, idx) => {
    // The full region: small parts can nest inside the holes of big ones.
    const outline = p.cut;
    const masks = rots.map((r) => buildMask(outline, r, S.spacing, cell)).filter((m) => m.w <= gw && m.h <= gh);
    if (!masks.length) {
      unplaced.push(p.id);
      return;
    }
    let placed = false;
    for (let si = 0; si <= sheets.length && !placed; si++) {
      if (si === sheets.length) sheets.push({ grid: new SheetGrid(gw, gh), placements: [], area: 0 });
      const sh = sheets[si];
      // Sheets that keep rejecting parts are closed; skip ones without room.
      if (sh.grid.failures > 40 || sh.grid.freeCells < masks[0].cells) continue;
      let best: { m: Mask; x: number; y: number } | null = null;
      for (const m of masks) {
        // Only accept positions whose top edge beats the best so far.
        const pos = sh.grid.find(m, best ? best.y + best.m.h : Infinity);
        if (!pos) continue;
        if (!best || pos[1] + m.h < best.y + best.m.h || (pos[1] + m.h === best.y + best.m.h && pos[0] < best.x)) best = { m, x: pos[0], y: pos[1] };
      }
      if (!best) {
        sh.grid.failures++;
        continue;
      }
      sh.grid.failures = 0;
      sh.grid.place(best.m, best.x, best.y);
      sh.placements.push({
        partId: p.id,
        sheet: si,
        rot: best.m.rot,
        x: S.margin + best.x * cell - best.m.ox,
        y: S.margin + best.y * cell - best.m.oy,
      });
      sh.area += p.area;
      placed = true;
    }
    if (!placed) unplaced.push(p.id);
    progress(idx + 1);
  });
  return {
    sheets: sheets.map((s, i) => ({ index: i, group: 0, width: S.width, height: S.height, placements: s.placements, utilisation: s.area / (W * H) })),
    unplaced,
  };
}
