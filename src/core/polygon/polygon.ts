/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import ClipperLib, { type PolyNode } from 'clipper-lib';
import type { Path2 } from '../types';
import type { V2 } from '../math/vec';

/** Clipper works in integers; 1 unit = 1 µm. */
const SCALE = 1000;
const ARC_TOL = 0.04 * SCALE; // 40 µm chord error on arcs: far below any kerf

const toC = (p: Path2) => p.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
const fromC = (p: { X: number; Y: number }[]): Path2 => p.map((q) => [q.X / SCALE, q.Y / SCALE]);

export type Join = 'round' | 'miter' | 'square';
export type End = 'round' | 'square' | 'butt';
const J = (j: Join) => (j === 'round' ? ClipperLib.JoinType.jtRound : j === 'miter' ? ClipperLib.JoinType.jtMiter : ClipperLib.JoinType.jtSquare);
const E = (e: End) => (e === 'round' ? ClipperLib.EndType.etOpenRound : e === 'square' ? ClipperLib.EndType.etOpenSquare : ClipperLib.EndType.etOpenButt);

/** Stroke open polylines into closed outlines (half-width = delta). */
export function strokePaths(paths: Path2[], delta: number, join: Join = 'round', end: End = 'round'): Path2[] {
  const co = new ClipperLib.ClipperOffset(3, ARC_TOL);
  for (const p of paths) if (p.length >= 2) co.AddPath(toC(p), J(join), E(end));
  const out: { X: number; Y: number }[][] = [];
  co.Execute(out, delta * SCALE);
  return out.map(fromC);
}

/** Grow (delta>0) or shrink (delta<0) closed polygons. */
export function offsetPolygons(polys: Path2[], delta: number, join: Join = 'round'): Path2[] {
  if (Math.abs(delta) < 1e-9) return polys;
  const co = new ClipperLib.ClipperOffset(3, ARC_TOL);
  co.AddPaths(polys.map(toC), J(join), ClipperLib.EndType.etClosedPolygon);
  const out: { X: number; Y: number }[][] = [];
  co.Execute(out, delta * SCALE);
  return out.map(fromC);
}

function boolean(subject: Path2[], clip: Path2[], type: number, fill: number = ClipperLib.PolyFillType.pftNonZero): Path2[] {
  const c = new ClipperLib.Clipper();
  c.AddPaths(subject.map(toC), ClipperLib.PolyType.ptSubject, true);
  if (clip.length) c.AddPaths(clip.map(toC), ClipperLib.PolyType.ptClip, true);
  const out: { X: number; Y: number }[][] = [];
  c.Execute(type, out, fill, fill);
  return out.map(fromC);
}

export const union = (polys: Path2[], fill: 'nonzero' | 'evenodd' = 'nonzero') =>
  boolean(polys, [], ClipperLib.ClipType.ctUnion, fill === 'evenodd' ? ClipperLib.PolyFillType.pftEvenOdd : ClipperLib.PolyFillType.pftNonZero);
export const difference = (a: Path2[], b: Path2[]) => boolean(a, b, ClipperLib.ClipType.ctDifference);
export const intersection = (a: Path2[], b: Path2[]) => boolean(a, b, ClipperLib.ClipType.ctIntersection);

/** Union then order: outer contours (CCW) first by area, holes after. */
export function normaliseRegion(polys: Path2[]): Path2[] {
  const u = union(polys);
  return u.sort((p, q) => Math.abs(signedArea(q)) - Math.abs(signedArea(p)));
}

/** Split a region into connected pieces: each piece = [outer, ...holes]. */
export function splitIslands(polys: Path2[], fill: 'nonzero' | 'evenodd' = 'nonzero'): Path2[][] {
  const c = new ClipperLib.Clipper();
  c.AddPaths(polys.map(toC), ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  const f = fill === 'evenodd' ? ClipperLib.PolyFillType.pftEvenOdd : ClipperLib.PolyFillType.pftNonZero;
  c.Execute(ClipperLib.ClipType.ctUnion, tree, f, f);
  const out: Path2[][] = [];
  const visit = (node: PolyNode) => {
    // node is an outer contour
    const piece: Path2[] = [fromC(node.Contour())];
    for (const h of node.Childs()) {
      piece.push(fromC(h.Contour()));
      for (const inner of h.Childs()) visit(inner);
    }
    out.push(piece);
  };
  for (const n of tree.Childs()) visit(n);
  return out;
}

export function signedArea(p: Path2): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]);
  return a / 2;
}

/** Net area of outer contours minus holes, computed with even-odd regions. */
export function regionArea(polys: Path2[]): number {
  let a = 0;
  for (const p of polys) a += signedArea(p);
  return Math.abs(a);
}

export function pathLength(p: Path2, closed = true): number {
  let l = 0;
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  if (closed && p.length > 2) l += Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]);
  return l;
}

export function bounds(paths: Path2[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths)
    for (const [x, y] of p) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export function pointInPolygon(pt: V2, poly: Path2): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside a region given as even-odd contours. */
export function pointInRegion(pt: V2, polys: Path2[]): boolean {
  let n = 0;
  for (const p of polys) if (pointInPolygon(pt, p)) n++;
  return n % 2 === 1;
}

export function circlePath(cx: number, cy: number, r: number, segs = 0): Path2 {
  const n = segs || Math.max(16, Math.min(96, Math.ceil(r * 8)));
  const out: Path2 = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Distance from point to segment. */
export function distToSegment(p: V2, a: V2, b: V2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

/** Minimum distance from a point to the boundary of a region. */
export function distToRegionBoundary(p: V2, polys: Path2[]): number {
  let d = Infinity;
  for (const poly of polys)
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSegment(p, poly[j], poly[i]));
  return d;
}

/** Rotate + translate paths. */
export function transformPaths(paths: Path2[], rot: number, dx: number, dy: number): Path2[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  return paths.map((p) => p.map(([x, y]) => [x * c - y * s + dx, x * s + y * c + dy] as V2));
}

/** Minimum-area bounding rectangle angle via rotating calipers on the convex hull. */
export function convexHull(points: V2[]): V2[] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: V2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: V2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function minAreaRectAngle(points: V2[]): number {
  const hull = convexHull(points);
  let best = 0, bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ang = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(ang), s = Math.sin(ang);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of hull) {
      const rx = x * c - y * s, ry = x * s + y * c;
      minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
      minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area < bestArea) {
      bestArea = area;
      // Prefer landscape orientation.
      best = maxX - minX >= maxY - minY ? ang : ang + Math.PI / 2;
    }
  }
  return best;
}

/** Keep the parts of open polylines that lie inside a region. */
export function clipOpenPaths(lines: Path2[], region: Path2[]): Path2[] {
  if (!lines.length || !region.length) return [];
  const c = new ClipperLib.Clipper();
  c.AddPaths(lines.map(toC), ClipperLib.PolyType.ptSubject, false);
  c.AddPaths(region.map(toC), ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctIntersection, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftEvenOdd);
  return (ClipperLib.Clipper as unknown as { OpenPathsFromPolyTree(t: unknown): { X: number; Y: number }[][] })
    .OpenPathsFromPolyTree(tree)
    .map(fromC);
}

/**
 * A point well inside a region (approximate pole of inaccessibility by
 * coarse-to-fine grid search). Returns the point and its clearance.
 */
export function interiorPoint(region: Path2[], avoid: { x: number; y: number; r: number }[] = []): { p: V2; d: number } {
  const b = bounds(region);
  const score = (p: V2) => {
    if (!pointInRegion(p, region)) return -1;
    let d = distToRegionBoundary(p, region);
    for (const h of avoid) d = Math.min(d, Math.hypot(p[0] - h.x, p[1] - h.y) - h.r);
    return d;
  };
  let best: V2 = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  let bestD = score(best);
  let step = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 12;
  let cx = best[0], cy = best[1];
  let span = 6;
  for (let level = 0; level < 5; level++) {
    for (let i = -span; i <= span; i++)
      for (let j = -span; j <= span; j++) {
        const p: V2 = [cx + i * step, cy + j * step];
        const d = score(p);
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
    cx = best[0];
    cy = best[1];
    step /= 3;
    span = 4;
  }
  return { p: best, d: bestD };
}
