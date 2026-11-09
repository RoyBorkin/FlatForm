/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/** Turn finished section regions into labelled, positioned parts. */
import type { Circle2, Part2D, Path2, Polyline2 } from '../types';
import { interiorPoint, pointInRegion, splitIslands } from '../polygon/polygon';
import { textPolylines, textWidth } from '../text/hershey';
import { normalizePart, partId } from '../parts';
import { planeMatrix } from '../slices/section';
import type { PlaneFrame } from '../mesh/slice';

export interface SectionPartInput {
  frame: PlaneFrame;
  d: number;
  thickness: number;
  region: Path2[];
  group: number;
  groupName: string;
  label: string;
  holes?: Circle2[];
  engrave?: Polyline2[];
  labelParts: boolean;
  textHeight: number;
  meta?: Record<string, string | number>;
}

/** Running part numbers per group, shared by every section of one build. */
export type IdCounter = Map<number, number>;

export function sectionParts(s: SectionPartInput, counter: IdCounter): Part2D[] {
  const islands = splitIslands(s.region);
  const out: Part2D[] = [];
  islands.forEach((island, k) => {
    const n = (counter.get(s.group) ?? 0) + 1;
    counter.set(s.group, n);
    const holes = (s.holes ?? []).filter((h) => pointInRegion([h.x, h.y], island));
    const engrave = (s.engrave ?? []).filter((l) => l.pts.length && pointInRegion(l.pts[0], island));
    const label = islands.length > 1 ? `${s.label}${String.fromCharCode(97 + k)}` : s.label;
    if (s.labelParts) {
      const ip = interiorPoint(island, holes);
      const h = Math.min(s.textHeight, ip.d * 0.7);
      if (h > 0.8 && textWidth(label, h) < ip.d * 1.8) engrave.push(...textPolylines(label, ip.p[0], ip.p[1], h, 0));
    }
    out.push(
      normalizePart({
        id: partId(s.group, n),
        group: s.group,
        groupName: s.groupName,
        cut: island,
        holes,
        score: [],
        engrave,
        planar: { matrix: planeMatrix(s.frame, s.d - s.thickness / 2) },
        meta: { label, ...s.meta },
      }),
    );
  });
  return out;
}
