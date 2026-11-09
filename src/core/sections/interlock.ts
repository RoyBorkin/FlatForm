/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Interlocking planar sections in any orientation. Each crossing of two
 * section planes gets a pair of half-slots that start at the boundary of
 * each piece, so the two can slide together along their intersection line.
 */
import type { MeshData, Path2, Polyline2 } from '../types';
import { slicePlane, type PlaneFrame } from '../mesh/slice';
import { sectionRegion } from '../slices/section';
import { cross3, dot3, norm3, type V2, type V3 } from '../math/vec';
import { difference, intersection, offsetPolygons, union } from '../polygon/polygon';
import { textPolylines } from '../text/hershey';

export interface Section {
  frame: PlaneFrame;
  d: number;
  family: number;
  label: string;
  solid: Path2[];
  slots: Path2[];
  marks: Polyline2[];
  /** Lines (2D origin + direction) where other sections cross; used for hollow stiles. */
  lines: { o: V2; dir: V2 }[];
}

export function makeSection(m: MeshData, frame: PlaneFrame, d: number, family: number, label: string, band: number, clip?: Path2[]): Section {
  const s = slicePlane(m, frame, d);
  let solid = sectionRegion(s.closed, s.open, band, false);
  if (clip) solid = intersection(solid, clip);
  return { frame, d, family, label, solid, slots: [], marks: [], lines: [] };
}

/** Parameter intervals where the line o + t·dir lies inside an even-odd region. */
function lineIntervals(region: Path2[], o: V2, dir: V2): [number, number][] {
  const ts: number[] = [];
  const nx = -dir[1], ny = dir[0];
  for (const poly of region)
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], b = poly[i];
      const da = (a[0] - o[0]) * nx + (a[1] - o[1]) * ny;
      const db = (b[0] - o[0]) * nx + (b[1] - o[1]) * ny;
      if (da > 0 === db > 0) continue;
      const f = da / (da - db);
      const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
      ts.push((x - o[0]) * dir[0] + (y - o[1]) * dir[1]);
    }
  ts.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ts.length; i += 2) out.push([ts[i], ts[i + 1]]);
  return out;
}

function slotAlong(o: V2, dir: V2, from: number, to: number, width: number, leadIn: number): Path2 {
  const n: V2 = [-dir[1], dir[0]];
  const sgn = Math.sign(to - from) || 1;
  const h = width / 2;
  const P = (t: number, w: number): V2 => [o[0] + dir[0] * t + n[0] * w, o[1] + dir[1] * t + n[1] * w];
  const mouth = from - sgn * 2;
  const flare = from + sgn * Math.max(leadIn * 2, 0.01);
  const pts: Path2 = [P(mouth, -h - leadIn), P(from, -h - leadIn), P(flare, -h), P(to, -h), P(to, h), P(flare, h), P(from, h + leadIn), P(mouth, h + leadIn)];
  return sgn > 0 ? pts : pts.reverse();
}

const to2 = (f: PlaneFrame, p: V3): V2 => [dot3(f.u, p), dot3(f.v, p)];

/**
 * Cut matching half-slots where sections A and B cross. Every crossing of
 * one pair opens the same way, so the two pieces slide together in a single
 * move. `prefer` forces A's slots to open toward +L (1) or −L (−1), where
 * L = nA × nB; otherwise the shorter total cut wins. Returns joints made.
 */
export function interlock(A: Section, B: Section, width: number, leadIn: number, textH: number, prefer: 0 | 1 | -1 = 0): number {
  if (!A.solid.length || !B.solid.length) return 0;
  const L = cross3(A.frame.n, B.frame.n);
  if (Math.hypot(L[0], L[1], L[2]) < 1e-6) return 0;
  const Ln = norm3(L);
  const nA = A.frame.n, nB = B.frame.n;
  const c1 = cross3(nB, Ln), c2 = cross3(Ln, nA);
  const den = dot3(nA, cross3(nB, Ln));
  const p0: V3 = [(A.d * c1[0] + B.d * c2[0]) / den, (A.d * c1[1] + B.d * c2[1]) / den, (A.d * c1[2] + B.d * c2[2]) / den];
  const oA = to2(A.frame, p0), dA = to2(A.frame, Ln);
  const oB = to2(B.frame, p0), dB = to2(B.frame, Ln);
  const IA = lineIntervals(A.solid, oA, dA);
  const IB = lineIntervals(B.solid, oB, dB);
  const hits: { a: [number, number]; b: [number, number]; t0: number; t1: number }[] = [];
  for (const a of IA)
    for (const b of IB) {
      const t0 = Math.max(a[0], b[0]), t1 = Math.min(a[1], b[1]);
      if (t1 - t0 >= width * 2) hits.push({ a, b, t0, t1 });
    }
  if (!hits.length) return 0;
  // dir = 1: A opens toward +L (from a1), B toward −L (from b0).
  let dir = prefer;
  if (!dir) {
    let up = 0, down = 0;
    for (const h of hits) {
      const tm = (h.t0 + h.t1) / 2;
      up += h.a[1] - tm + (tm - h.b[0]);
      down += tm - h.a[0] + (h.b[1] - tm);
    }
    dir = up <= down ? 1 : -1;
  }
  const h = textH > 0 ? Math.min(textH * 0.7, width * 2.2) : 0;
  const readable = (dir2: V2) => {
    let ang = Math.atan2(dir2[1], dir2[0]);
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang < -Math.PI / 2) ang += Math.PI;
    return ang;
  };
  for (const hit of hits) {
    const tm = (hit.t0 + hit.t1) / 2;
    const aFrom = dir > 0 ? hit.a[1] : hit.a[0];
    const bFrom = dir > 0 ? hit.b[0] : hit.b[1];
    A.slots.push(slotAlong(oA, dA, aFrom, tm, width, leadIn));
    B.slots.push(slotAlong(oB, dB, bFrom, tm, width, leadIn));
    A.lines.push({ o: oA, dir: dA });
    B.lines.push({ o: oB, dir: dB });
    if (h > 0.8) {
      // Partner's name just past the bottom of each slot, in solid material.
      const room = (other: number) => Math.abs(other - tm);
      const ta = tm - Math.sign(aFrom - tm) * h * 1.4;
      const tb = tm - Math.sign(bFrom - tm) * h * 1.4;
      if (room(dir > 0 ? hit.a[0] : hit.a[1]) > h * 2.2)
        A.marks.push(...textPolylines(B.label, oA[0] + dA[0] * ta, oA[1] + dA[1] * ta, h, readable([-dA[1], dA[0]])));
      if (room(dir > 0 ? hit.b[1] : hit.b[0]) > h * 2.2)
        B.marks.push(...textPolylines(A.label, oB[0] + dB[0] * tb, oB[1] + dB[1] * tb, h, readable([-dB[1], dB[0]])));
    }
  }
  return hits.length;
}

/** Final region of a section: optional hollow frame with a post along every crossing, minus its slots. */
export function finishSection(s: Section, hollow: boolean, frame: number, slotWidth: number): Path2[] {
  let region = s.solid;
  if (hollow && region.length) {
    const inner = offsetPolygons(region, -frame);
    const stiles: Path2[] = s.lines.map(({ o, dir }) => {
      const n: V2 = [-dir[1], dir[0]];
      const w = slotWidth / 2 + frame;
      const P = (t: number, k: number): V2 => [o[0] + dir[0] * t + n[0] * k, o[1] + dir[1] * t + n[1] * k];
      return [P(-1e5, -w), P(1e5, -w), P(1e5, w), P(-1e5, w)];
    });
    region = union([...difference(region, inner), ...intersection(stiles, region)]);
  }
  return s.slots.length ? difference(region, s.slots) : region;
}
