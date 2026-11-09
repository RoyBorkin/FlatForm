/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Turns nested parts into final drawing entities in sheet coordinates (mm,
 * origin bottom-left, y up). Every exporter draws from this one list, so
 * DXF, SVG, PDF and the on-screen sheets always agree.
 */
import type { Circle2, NestResult, Part2D, Path2, Placement, Polyline2 } from '../types';
import type { SheetParams } from '../params';
import { offsetPolygons, signedArea } from '../polygon/polygon';
import type { V2 } from '../math/vec';

export interface SheetDrawing {
  index: number;
  group: number;
  width: number;
  height: number;
  /** Inner cuts first (holes, cut-outs, perforations), then outer outlines: the order a laser should cut. */
  cutInner: Path2[];
  cutOuter: Path2[];
  /** Outer outlines broken by holding bridges (laser) or tabs (CNC): open polylines on the outer cut layer. */
  cutOuterOpen: Path2[];
  circles: Circle2[];
  perforations: Path2[];
  engrave: Path2[];
  score: { pts: Path2; kind: Polyline2['kind'] }[];
  labels: { id: string; x: number; y: number }[];
  utilisation: number;
}

export function placePoint(pl: Placement, p: V2): V2 {
  const c = Math.cos(pl.rot), s = Math.sin(pl.rot);
  return [p[0] * c - p[1] * s + pl.x, p[0] * s + p[1] * c + pl.y];
}

export function drawPart(part: Part2D, pl: Placement, kerf = 0) {
  const tr = (path: Path2) => path.map((p) => placePoint(pl, p));
  let outer = part.cut.filter((_, i) => i === 0);
  let inner = part.cut.slice(1);
  if (kerf > 0) {
    // Outline grows, cut-outs shrink, by half the kerf.
    outer = offsetPolygons(outer, kerf / 2, 'miter');
    // Treat each cut-out as its own CCW polygon and shrink it.
    inner = inner.map((h) => offsetPolygons([signedArea(h) < 0 ? h.slice().reverse() : h], -kerf / 2, 'miter')[0] ?? h);
  }
  const c = Math.cos(pl.rot), s = Math.sin(pl.rot);
  return {
    outer: outer.map(tr),
    inner: inner.map(tr),
    circles: part.holes.map((h) => ({ ...h, x: h.x * c - h.y * s + pl.x, y: h.x * s + h.y * c + pl.y, r: Math.max(0.05, h.r - kerf / 2) })),
    perforations: (part.perforations ?? []).map((l) => tr(l.pts)),
    engrave: part.engrave.map((l) => tr(l.pts)),
    score: part.score.map((l) => ({ pts: tr(l.pts), kind: l.kind })),
  };
}

/**
 * Break a closed outline into open runs, leaving `count` evenly spaced gaps of
 * `width` that hold the part in the sheet until it is snapped out.
 */
export function bridgeOutline(path: Path2, count: number, width: number): Path2[] {
  const n = path.length;
  if (count <= 0 || n < 3) return [path.concat([path[0]])];
  const cum = [0];
  for (let i = 1; i <= n; i++) {
    const a = path[i - 1], b = path[i % n];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[n];
  if (L < count * width * 4) return [path.concat([path[0]])];
  const at = (s: number): V2 => {
    let i = 1;
    while (i < n && cum[i] < s) i++;
    const a = path[i - 1], b = path[i % n];
    const f = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const runs: Path2[] = [];
  const step = L / count;
  for (let k = 0; k < count; k++) {
    const s0 = k * step + width / 2, s1 = (k + 1) * step - width / 2;
    const run: Path2 = [at(s0)];
    for (let i = 1; i < n; i++) if (cum[i] > s0 && cum[i] < s1) run.push(path[i]);
    // the closing vertex sits at cum[n] = L, already outside every run
    run.push(at(s1));
    runs.push(run);
  }
  return runs;
}

export function sheetDrawings(nest: NestResult, parts: Map<string, Part2D>, sheet: SheetParams, kerf: number, bridges?: { count: number; width: number }): SheetDrawing[] {
  return nest.sheets.map((s) => {
    const d: SheetDrawing = {
      index: s.index,
      group: s.group,
      width: s.width,
      height: s.height,
      cutInner: [],
      cutOuter: [],
      cutOuterOpen: [],
      circles: [],
      perforations: [],
      engrave: [],
      score: [],
      labels: [],
      utilisation: s.utilisation,
    };
    for (const pl of s.placements) {
      const part = parts.get(pl.partId);
      if (!part) continue;
      const g = drawPart(part, pl, sheet.kerfCompensation ? kerf : 0);
      if (bridges && bridges.count > 0) for (const o of g.outer) d.cutOuterOpen.push(...bridgeOutline(o, bridges.count, bridges.width));
      else d.cutOuter.push(...g.outer);
      d.cutInner.push(...g.inner);
      d.circles.push(...g.circles);
      d.perforations.push(...g.perforations);
      d.engrave.push(...g.engrave);
      d.score.push(...g.score);
      const cx = (part.bbox.minX + part.bbox.maxX) / 2, cy = (part.bbox.minY + part.bbox.maxY) / 2;
      const [lx, ly] = placePoint(pl, [cx, cy]);
      d.labels.push({ id: part.id, x: lx, y: ly });
    }
    return d;
  });
}

/** Lay out un-nested parts in rows (for the Flat view and flat-parts exports). */
export function flatLayout(parts: Part2D[], gap = 12, rowWidth = 0): { placements: Placement[]; width: number; height: number } {
  const totalArea = parts.reduce((s, p) => s + (p.bbox.maxX + gap) * (p.bbox.maxY + gap), 0);
  const W = rowWidth || Math.max(300, Math.sqrt(totalArea) * 1.6);
  const placements: Placement[] = [];
  let x = 0, y = 0, rowH = 0, maxW = 0;
  let lastGroup = parts[0]?.group ?? 0;
  for (const p of parts) {
    const w = p.bbox.maxX - p.bbox.minX, h = p.bbox.maxY - p.bbox.minY;
    if ((x > 0 && x + w > W) || p.group !== lastGroup) {
      x = 0;
      y -= rowH + gap * (p.group !== lastGroup ? 3 : 1);
      rowH = 0;
      lastGroup = p.group;
    }
    placements.push({ partId: p.id, sheet: 0, x: x - p.bbox.minX, y: y - h - p.bbox.minY, rot: 0 });
    x += w + gap;
    rowH = Math.max(rowH, h);
    maxW = Math.max(maxW, x);
  }
  // Shift so everything is in positive coordinates.
  const height = -(y - rowH);
  for (const pl of placements) pl.y += height;
  return { placements, width: maxW, height };
}
