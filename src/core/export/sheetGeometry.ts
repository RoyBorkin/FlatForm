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

export function sheetDrawings(nest: NestResult, parts: Map<string, Part2D>, sheet: SheetParams, kerf: number): SheetDrawing[] {
  return nest.sheets.map((s) => {
    const d: SheetDrawing = {
      index: s.index,
      group: s.group,
      width: s.width,
      height: s.height,
      cutInner: [],
      cutOuter: [],
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
      d.cutOuter.push(...g.outer);
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
