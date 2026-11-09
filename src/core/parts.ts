/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import type { Part2D, Path2 } from './types';
import { bounds, minAreaRectAngle, regionArea, signedArea } from './polygon/polygon';
import { mulM4, type M4, type V2 } from './math/vec';

/**
 * Rotate a part to its minimum-area orientation and move its bounding box to
 * the origin. Holes, engraving, score lines and the 3D placement matrix are
 * transformed with it so everything stays registered.
 */
export function normalizePart(part: Omit<Part2D, 'area' | 'bbox'>, rotate = true): Part2D {
  const pts: V2[] = part.cut.flat();
  const ang = rotate && pts.length > 2 ? minAreaRectAngle(pts) : 0;
  const c = Math.cos(ang), s = Math.sin(ang);
  const R = (p: V2): V2 => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  // Outer outline first: exporters and nesting rely on cut[0] being the outline.
  let cut = part.cut
    .slice()
    .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))
    .map((p) => p.map(R));
  const b = bounds(cut);
  const T = (p: V2): V2 => [p[0] - b.minX, p[1] - b.minY];
  cut = cut.map((p) => p.map(T));
  const map = (p: V2) => T(R(p));
  const holes = part.holes.map((h) => {
    const q = map([h.x, h.y]);
    return { ...h, x: q[0], y: q[1] };
  });
  const score = part.score.map((l) => ({ ...l, pts: l.pts.map(map) }));
  const engrave = part.engrave.map((l) => ({ ...l, pts: l.pts.map(map) }));
  const perforations = part.perforations?.map((l) => ({ ...l, pts: l.pts.map(map) }));
  let planar = part.planar;
  if (planar) {
    // new = T∘R(old)  →  old = R⁻¹(new + min)
    const inv: M4 = [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const tr: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, b.minX, b.minY, 0, 1];
    planar = { matrix: mulM4(planar.matrix, mulM4(inv, tr)) };
  }
  const nb = bounds(cut);
  return { ...part, cut, holes, score, engrave, perforations, planar, area: partArea(cut, holes), bbox: nb };
}

export function partArea(cut: Path2[], holes: { r: number }[]): number {
  let a = regionArea(cut);
  for (const h of holes) a -= Math.PI * h.r * h.r;
  return Math.max(0, a);
}

export function cutLength(p: Part2D): number {
  let l = 0;
  for (const c of p.cut) {
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      l += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  }
  for (const h of p.holes) l += 2 * Math.PI * h.r;
  return l;
}

export const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const partId = (group: number, n: number) => `${GROUP_LETTERS[group % 26]}${String(n).padStart(3, '0')}`;
