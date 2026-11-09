/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/** Stacked slices: contour sections stacked along one axis, aligned on dowels. */
import type { MeshData, MethodResult, Part2D, Path2, Polyline2 } from '../types';
import type { JoineryParams, MaterialParams, SlicesParams } from '../params';
import { axisFrame, projectRange, slicePlane } from '../mesh/slice';
import { sectionRegion, planeMatrix } from './section';
import { clipOpenPaths, difference, interiorPoint, intersection, offsetPolygons, pointInRegion, splitIslands, union } from '../polygon/polygon';
import { textPolylines, textWidth } from '../text/hershey';
import { normalizePart, partId } from '../parts';
import { pinHoleDiameter } from '../joinery/holes';
import { stackTabs } from '../joinery/bendTabs';
import type { V2 } from '../math/vec';

export function buildSlices(
  surface: MeshData,
  P: SlicesParams,
  joinery: JoineryParams,
  material: MaterialParams,
  onProgress?: (f: number, s: string) => void,
): MethodResult {
  const warnings: string[] = [];
  const t = material.thickness;
  const f = axisFrame(P.axis);
  const [lo, hi] = projectRange(surface, f.n);
  const pitch = P.spacingMode === 'thickness' ? t : Math.max(t, P.spacing);
  const count = Math.floor((hi - lo) / pitch);
  if (count < 1) return { parts: [], assembly: { kind: 'planar', thickness: t }, overlays: {}, stats: {}, warnings: ['The shape is thinner than one slice.'] };
  if (count > 600) warnings.push(`${count} slices is a lot of cutting. Increase the spacing for a lighter build.`);
  const first = lo + (hi - lo - (count - 1) * pitch) / 2;
  const sections: { d: number; region: Path2[] }[] = [];
  for (let i = 0; i < count; i++) {
    const d = first + i * pitch;
    const s = slicePlane(surface, f, d);
    sections.push({ d, region: sectionRegion(s.closed, s.open, P.wall, P.hollow) });
    if (i % 10 === 0) onProgress?.((0.6 * i) / count, 'Slicing');
  }

  // Bend tabs: each slice hooks into its neighbour; no dowels needed.
  const scores: Polyline2[][] = sections.map(() => []);
  let tabs = 0;
  if (joinery.kind === 'bendtabs') {
    const res = stackTabs(
      sections.map((x) => x.region),
      t,
      pitch - t,
      joinery.bendtabs,
    );
    res.features.forEach((F, k) => {
      if (F.add.length) sections[k].region = union([...sections[k].region, ...F.add]);
      if (F.sub.length) sections[k].region = difference(sections[k].region, F.sub);
      scores[k].push(...F.score);
    });
    tabs = res.count;
    if (pitch - t > t * 8) warnings.push('The gap between slices is wide for bend tabs; they work best on touching or nearly touching slices.');
    if (!tabs) warnings.push('No slice pair had room for a bend tab. Use dowels instead, or narrower tabs.');
  }

  // Alignment dowels: points inside every slice.
  const holeD = joinery.kind === 'bendtabs' ? 0 : pinHoleDiameter(joinery);
  const holes: { x: number; y: number }[] = [];
  if (P.alignmentHoles > 0 && holeD > 0) {
    let common: Path2[] | null = null;
    for (const s of sections) {
      if (!s.region.length) continue;
      common = common ? intersection(common, s.region) : s.region;
      if (!common.length) break;
    }
    const safe = common ? offsetPolygons(common, -(holeD / 2 + Math.max(2, holeD))) : [];
    if (!safe.length) warnings.push('No area is shared by every slice, so there is nowhere to put alignment dowels. Make the walls thicker or turn hollow off.');
    else {
      const ip = interiorPoint(safe);
      if (ip.d >= 0) holes.push({ x: ip.p[0], y: ip.p[1] });
      // Spread the rest with farthest-point sampling over a candidate grid.
      if (holes.length && P.alignmentHoles > 1) {
        const cands: V2[] = [];
        const b = safe.flat();
        const xs = b.map((p) => p[0]), ys = b.map((p) => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        for (let i = 0; i <= 24; i++)
          for (let j = 0; j <= 24; j++) {
            const p: V2 = [minX + ((maxX - minX) * i) / 24, minY + ((maxY - minY) * j) / 24];
            if (pointInRegion(p, safe)) cands.push(p);
          }
        const chosen: V2[] = [[holes[0].x, holes[0].y]];
        while (chosen.length < P.alignmentHoles && cands.length) {
          let best = cands[0], bd = -1;
          for (const c of cands) {
            const d = Math.min(...chosen.map((q) => Math.hypot(c[0] - q[0], c[1] - q[1])));
            if (d > bd) {
              bd = d;
              best = c;
            }
          }
          if (bd < holeD * 3) break;
          chosen.push(best);
        }
        holes.splice(0, holes.length, ...chosen.map(([x, y]) => ({ x, y })));
      }
    }
  }

  const parts: Part2D[] = [];
  let n = 0;
  sections.forEach((s, i) => {
    if (!s.region.length) return;
    const next = sections[i + 1]?.region ?? [];
    const islands = splitIslands(s.region);
    islands.forEach((island, k) => {
      n++;
      const id = partId(0, n);
      const engrave: Polyline2[] = [];
      const myHoles = holes
        .filter((h) => pointInRegion([h.x, h.y], island))
        .map((h, j) => ({ x: h.x, y: h.y, r: holeD / 2, label: `D${j + 1}` }));
      if (P.registration && next.length) {
        for (const line of clipOpenPaths(next.map((p) => [...p, p[0]]), island)) engrave.push({ pts: line, kind: 'registration' });
      }
      if (P.labelParts) {
        const label = islands.length > 1 ? `${i + 1}${String.fromCharCode(97 + k)}` : String(i + 1);
        const ip = interiorPoint(island, myHoles);
        const h = Math.min(P.textHeight, ip.d * 0.7);
        if (h > 0.8 && textWidth(label, h) < ip.d * 1.8) engrave.push(...textPolylines(label, ip.p[0], ip.p[1], h, 0));
      }
      parts.push(
        normalizePart({
          id,
          group: 0,
          groupName: 'Slices',
          cut: island,
          holes: myHoles,
          score: scores[i].filter((l) => pointInRegion(l.pts[0], offsetPolygons(island, 0.5))),
          engrave,
          planar: { matrix: planeMatrix(f, s.d - t / 2) },
          meta: { slice: i + 1, position: Math.round(s.d * 10) / 10 },
        }),
      );
    });
    if (i % 10 === 0) onProgress?.(0.6 + (0.4 * i) / sections.length, 'Building slices');
  });
  return {
    parts,
    assembly: { kind: 'planar', thickness: t },
    overlays: {},
    stats: { slices: sections.length, pitch, dowels: holes.length, tabs },
    warnings,
    connectorData: {
      pinCount: holes.length,
      gripLength: (sections.length - 1) * pitch + t,
      collars: joinery.kind === 'crossing' && holes.length ? { bore: holeD, count: parts.reduce((n, q) => n + q.holes.length, 0) * 2 } : undefined,
    },
  };
}
