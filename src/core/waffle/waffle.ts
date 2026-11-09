/** Interlocking waffle: two crossing families of ribs joined by half-slots. */
import type { MeshData, MethodResult, Part2D, Path2, Polyline2 } from '../types';
import type { MaterialParams, WaffleParams } from '../params';
import { projectRange, slicePlane, type PlaneFrame } from '../mesh/slice';
import { sectionRegion, planeMatrix } from './../slices/section';
import { difference, intersection, interiorPoint, splitIslands, union, offsetPolygons } from '../polygon/polygon';
import { textPolylines, textWidth } from '../text/hershey';
import { normalizePart, partId, GROUP_LETTERS } from '../parts';
import { cross3, dot3, type V2, type V3 } from '../math/vec';

const AX: Record<string, V3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

function familyFrame(n: V3, L: V3): PlaneFrame {
  return { u: cross3(L, n), v: L, n };
}

/** Even-odd intervals along the vertical line u = c through a region. */
function lineIntervals(region: Path2[], c: number): [number, number][] {
  const ys: number[] = [];
  for (const poly of region)
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [x1, y1] = poly[j];
      const [x2, y2] = poly[i];
      if (x1 > c !== x2 > c) ys.push(y1 + ((c - x1) * (y2 - y1)) / (x2 - x1));
    }
  ys.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ys.length; i += 2) out.push([ys[i], ys[i + 1]]);
  return out;
}

function intersectIntervals(a: [number, number][], b: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a0, a1] of a)
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
      if (hi > lo) out.push([lo, hi]);
    }
  return out;
}

/** Slot polygon centred on u = c from v = from (mouth) to v = to, with a lead-in flare at the mouth. */
function slotPoly(c: number, width: number, from: number, to: number, leadIn: number): Path2 {
  const h = width / 2;
  const dir = Math.sign(to - from) || 1;
  const mouth = from - dir * 2; // overshoot past the edge
  const flareEnd = from + dir * Math.max(leadIn * 2, 0.01);
  const pts: V2[] = [
    [c - h - leadIn, mouth],
    [c - h - leadIn, from],
    [c - h, flareEnd],
    [c - h, to],
    [c + h, to],
    [c + h, flareEnd],
    [c + h + leadIn, from],
    [c + h + leadIn, mouth],
  ];
  return dir > 0 ? pts : pts.reverse();
}

export function buildWaffle(surface: MeshData, P: WaffleParams, material: MaterialParams, onProgress?: (f: number, s: string) => void): MethodResult {
  const warnings: string[] = [];
  const t = material.thickness;
  const [ka, kb, kl] = P.plane === 'xy' ? ['x', 'y', 'z'] : P.plane === 'xz' ? ['x', 'z', 'y'] : ['y', 'z', 'x'];
  const L = AX[kl];
  const fams = [
    { n: AX[ka], count: P.countA },
    { n: AX[kb], count: P.countB },
  ].map(({ n, count }, gi) => {
    const f = familyFrame(n, L);
    const [lo, hi] = projectRange(surface, n);
    const span = hi - lo;
    const a = lo + span * P.inset, b = hi - span * P.inset;
    const ribs = Array.from({ length: Math.max(1, count) }, (_, i) => {
      const d = a + ((i + 0.5) * (b - a)) / Math.max(1, count);
      const s = slicePlane(surface, f, d);
      const solid = sectionRegion(s.closed, s.open, P.frame, false);
      return { d, solid, region: solid as Path2[], slots: [] as Path2[], marks: [] as Polyline2[] };
    });
    return { f, ribs, group: gi };
  });
  onProgress?.(0.3, 'Ribs');
  const width = t + P.slotClearance;
  const [A, B] = fams;
  let joints = 0;
  // Hollow ribs keep a stile of material along every crossing.
  const stileFor = (fam: typeof A, other: typeof B) =>
    fam.ribs.map((rib) =>
      other.ribs.map((orib) => {
        const p0: V3 = [fam.f.n[0] * rib.d + other.f.n[0] * orib.d, fam.f.n[1] * rib.d + other.f.n[1] * orib.d, fam.f.n[2] * rib.d + other.f.n[2] * orib.d];
        return dot3(fam.f.u, p0);
      }),
    );
  const cA = stileFor(A, B), cB = stileFor(B, A);
  if (P.hollow) {
    for (const [fam, cs] of [[A, cA], [B, cB]] as const) {
      fam.ribs.forEach((rib, i) => {
        if (!rib.solid.length) return;
        const inner = offsetPolygons(rib.solid, -P.frame);
        const stiles: Path2[] = cs[i].map((c) => [
          [c - width / 2 - P.frame, -1e5], [c + width / 2 + P.frame, -1e5], [c + width / 2 + P.frame, 1e5], [c - width / 2 - P.frame, 1e5],
        ]);
        rib.region = union([...difference(rib.solid, inner), ...intersection(stiles, rib.solid)]);
      });
    }
  }
  A.ribs.forEach((ra, i) => {
    B.ribs.forEach((rb, j) => {
      const ca = cA[i][j], cb = cB[j][i];
      const ia = lineIntervals(ra.solid, ca);
      const ib = lineIntervals(rb.solid, cb);
      for (const [v0, v1] of intersectIntervals(ia, ib)) {
        if (v1 - v0 < 2 * t) continue;
        const mid = (v0 + v1) / 2;
        ra.slots.push(slotPoly(ca, width, v0, mid, P.slotLeadIn));
        rb.slots.push(slotPoly(cb, width, v1, mid, P.slotLeadIn));
        if (P.labelParts) {
          const h = Math.min(P.textHeight * 0.7, width * 2);
          ra.marks.push(...textPolylines(`${GROUP_LETTERS[1]}${j + 1}`, ca, mid + h * 1.4, h, 0));
          rb.marks.push(...textPolylines(`${GROUP_LETTERS[0]}${i + 1}`, cb, mid - h * 1.4, h, 0));
        }
        joints++;
      }
    });
  });
  onProgress?.(0.6, 'Slots');
  const parts: Part2D[] = [];
  const splitRibs: string[] = [];
  for (const fam of fams) {
    let n = 0;
    fam.ribs.forEach((rib, i) => {
      if (!rib.region.length) return;
      const cut = rib.slots.length ? difference(rib.region, rib.slots) : rib.region;
      const islands = splitIslands(cut);
      if (islands.length > 1) splitRibs.push(`${GROUP_LETTERS[fam.group]}${i + 1}`);
      islands.forEach((island) => {
        n++;
        const id = partId(fam.group, n);
        const engrave: Polyline2[] = [];
        if (P.labelParts) {
          const label = `${GROUP_LETTERS[fam.group]}${i + 1}`;
          const ip = interiorPoint(island);
          const h = Math.min(P.textHeight, ip.d * 0.7);
          if (h > 0.8 && textWidth(label, h) < ip.d * 1.8) engrave.push(...textPolylines(label, ip.p[0], ip.p[1], h, 0));
          // Mating labels that land on this island.
          for (const m of rib.marks) if (m.pts.length) engrave.push(m);
        }
        parts.push(
          normalizePart({
            id,
            group: fam.group,
            groupName: `Ribs ${GROUP_LETTERS[fam.group]}`,
            cut: island,
            holes: [],
            score: [],
            engrave: engrave.filter((e) => e.pts.every((p) => insideAny(p, island))),
            planar: { matrix: planeMatrix(fam.f, rib.d - t / 2) },
            meta: { rib: `${GROUP_LETTERS[fam.group]}${i + 1}`, slots: rib.slots.length },
          }),
        );
      });
    });
  }
  if (splitRibs.length)
    warnings.push(`${splitRibs.length} rib${splitRibs.length > 1 ? 's cross' : ' crosses'} separate parts of the shape, so ${splitRibs.length > 1 ? 'they are' : 'it is'} cut into several pieces (${splitRibs.slice(0, 6).join(', ')}${splitRibs.length > 6 ? '…' : ''}). Each piece is still held by its slots.`);
  if (joints === 0) warnings.push('No rib crossings found. Add more ribs or reduce the inset.');
  return { parts, assembly: { kind: 'planar', thickness: t }, overlays: {}, stats: { ribsA: A.ribs.length, ribsB: B.ribs.length, joints }, warnings, connectorData: { pinCount: 0, gripLength: t, crossings: joints } };
}

function insideAny(p: V2, region: Path2[]): boolean {
  let n = 0;
  for (const poly of region) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) n++;
  }
  return n % 2 === 1;
}
