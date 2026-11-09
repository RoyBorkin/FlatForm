/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/**
 * Edge features shared by every panel-based method (folded panels,
 * paper-craft, minimal joinery, flex hinges, triangles). Each function draws
 * into one side of an edge, in an edge-local frame: s runs along the edge
 * from its canonical start, n > 0 points out of this panel (into its
 * neighbour). Both sides of a seam use the same s, so features line up.
 */
import type { Circle2, Path2, Polyline2 } from '../types';
import type { JoineryParams } from '../params';
import type { V2 } from '../math/vec';
import { latchAt, latchPositions } from './latches';
import { drawGreaterThan, drawLessThan, greaterThanPattern, lessThanPattern } from './flaticulation';

export interface EdgeCtx {
  A: V2;
  B: V2;
  len: number;
  toXY: (s: number, n: number) => V2;
  /** True on exactly one side of every seam. */
  male: boolean;
  /** Fold angle between the two panels, radians (0 = flat). */
  foldAngle: number;
  convex: boolean;
  /** Seam number shared by both sides (0 = none). */
  num: number;
  thickness: number;
}

export interface Features {
  add: Path2[];
  sub: Path2[];
  score: Polyline2[];
  perforations: Polyline2[];
  engrave: Polyline2[];
  holes: Circle2[];
}

export const emptyFeatures = (): Features => ({ add: [], sub: [], score: [], perforations: [], engrave: [], holes: [] });

const local = (ctx: EdgeCtx, p: Path2): Path2 => p.map(([s, n]) => ctx.toXY(s, n));

// ------------------------------------------------------------------ seams

export function glueFlap(ctx: EdgeCtx, f: Features, width: number, shape: 'trapezoid' | 'rounded' | 'triangle', shoulderDeg = 45) {
  const w = Math.min(width, ctx.len * 0.45);
  const inset = Math.min(ctx.len * 0.45, w / Math.tan((Math.max(15, Math.min(80, shoulderDeg)) * Math.PI) / 180));
  let flap: Path2;
  if (shape === 'triangle') flap = [[0, 0], [ctx.len, 0], [ctx.len / 2, Math.min(w, ctx.len * 0.4)]];
  else if (shape === 'rounded') {
    // Rounded shoulders: quarter circles at both ends of a straight top.
    const r = Math.min(w, ctx.len / 2 - 0.05);
    flap = [[0, 0], [ctx.len, 0]];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      flap.push([ctx.len - r + r * Math.cos(a), r * Math.sin(a)]);
    }
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI / 2 + (i / 8) * (Math.PI / 2);
      flap.push([r + r * Math.cos(a), r * Math.sin(a)]);
    }
  } else flap = [[0, 0], [ctx.len, 0], [ctx.len - inset, w], [inset, w]];
  f.add.push(local(ctx, flap));
  f.score.push({ pts: [ctx.A, ctx.B], kind: 'valley' });
}

export function latches(ctx: EdgeCtx, f: Features, l: JoineryParams['latch']) {
  for (const c of latchPositions(ctx.len, l.width, l.perEdge)) {
    const geo = latchAt(c, { ...l, thickness: ctx.thickness });
    if (ctx.male) {
      f.add.push(...geo.add.map((p) => local(ctx, p)));
      if (geo.fold) f.score.push({ pts: [ctx.toXY(geo.fold[0][0], 0), ctx.toXY(geo.fold[1][0], 0)], kind: 'valley' });
    } else f.sub.push(...geo.sub.map((p) => local(ctx, p)));
  }
}

/** A row of round holes set back from the seam (screws, rivets, brackets). Returns the hole count. */
export function holeRow(ctx: EdgeCtx, f: Features, d: number): number {
  const off = Math.max(d * 1.6, 5);
  const n = Math.max(1, Math.min(3, Math.floor(ctx.len / 40)));
  for (let i = 0; i < n; i++) {
    const q = ctx.toXY(((i + 0.5) * ctx.len) / n, -off);
    f.holes.push({ x: q[0], y: q[1], r: d / 2 });
  }
  return n;
}

function slot(ctx: EdgeCtx, s: number, n: number, length: number, width: number): Path2 {
  const h = width / 2, l = length / 2;
  const pts: Path2 = [];
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    pts.push([s + l - h + Math.cos(a) * h, n + Math.sin(a) * h]);
  }
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 2 + (i / 8) * Math.PI;
    pts.push([s - l + h + Math.cos(a) * h, n + Math.sin(a) * h]);
  }
  return local(ctx, pts);
}

/** Wire, string, ribbon, rubber band or zip-tie lacing along a seam. */
export function wireStitches(ctx: EdgeCtx, f: Features, w: JoineryParams['wire']) {
  const pitch = Math.max(w.holeDiameter * 2.5, w.pitch);
  const usable = ctx.len - Math.max(pitch * 0.5, w.edgeOffset * 1.5);
  const count = Math.max(1, Math.floor(usable / pitch) + 1);
  const start = (ctx.len - (count - 1) * pitch) / 2;
  const shift = w.stitch === 'cross' && !ctx.male ? pitch / 2 : 0;
  for (let i = 0; i < count; i++) {
    const s = start + i * pitch + shift;
    if (s < w.edgeOffset * 0.6 || s > ctx.len - w.edgeOffset * 0.6) continue;
    if (w.stitch === 'notch') {
      // V-notches into the edge hold rubber bands or cord.
      const half = w.holeDiameter * 0.8, depth = w.holeDiameter * 1.4;
      f.sub.push(local(ctx, [[s - half, 0.4], [s, -depth], [s + half, 0.4]]));
      continue;
    }
    const n = w.stitch === 'whip' ? -Math.max(w.holeDiameter, w.edgeOffset * 0.6) : -w.edgeOffset;
    if (w.slotLength > w.holeDiameter) f.sub.push(slot(ctx, s, n, w.slotLength, w.holeDiameter));
    else {
      const q = ctx.toXY(s, n);
      f.holes.push({ x: q[0], y: q[1], r: w.holeDiameter / 2 });
    }
  }
}

function hash32(n: number) {
  let x = (n + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Which side owns each finger. Classic alternates; "unique" flips interior
 * fingers by a code derived from the seam number so only the right partner
 * fits (FoolProofJoint); "symmetric" mirrors the code so a piece also fits
 * turned end for end.
 */
export function fingerOwners(count: number, pattern: 'classic' | 'unique' | 'symmetric', seam: number): number[] {
  const owners = Array.from({ length: count }, (_, i) => i % 2);
  if (pattern === 'classic' || count < 5) return owners;
  const code = hash32(seam * 2654435761);
  const half = Math.floor(count / 2);
  for (let i = 1; i < count - 1; i++) {
    const k = pattern === 'symmetric' ? Math.min(i, count - 1 - i) : i;
    if ((code >>> (k % 31)) & 1 && k % 3 === 1) owners[i] ^= 1;
  }
  if (pattern === 'symmetric') for (let i = 0; i < half; i++) owners[count - 1 - i] = owners[i];
  // Both sides need at least one finger.
  if (!owners.includes(1)) owners[1] = 1;
  if (!owners.includes(0)) owners[0] = 0;
  return owners;
}

export function fingers(ctx: EdgeCtx, f: Features, p: JoineryParams['fingers']) {
  let count = Math.max(3, Math.round(ctx.len / Math.max(1, p.width)));
  if (count % 2 === 0) count++;
  const seg = ctx.len / count;
  const inside = Math.PI - ctx.foldAngle;
  const depth = p.depthMode === 'custom' ? p.depth : ctx.thickness / Math.max(0.35, Math.sin(inside));
  const owners = fingerOwners(count, p.pattern, ctx.num);
  const mine = ctx.male ? 0 : 1;
  for (let i = 0; i < count; i++) {
    if (owners[i] !== mine) continue;
    const s0 = i * seg + (i === 0 ? 0 : p.clearance), s1 = (i + 1) * seg - (i === count - 1 ? 0 : p.clearance);
    f.add.push(local(ctx, [[s0, -0.01], [s1, -0.01], [s1, depth], [s0, depth]]));
  }
}

// ------------------------------------------------------------------ folds

export function foldLine(ctx: EdgeCtx, f: Features, style: 'score' | 'perforate', perf?: { dash: number; gap: number }) {
  const kind = ctx.convex ? 'mountain' : 'valley';
  if (style === 'perforate' && perf) {
    const step = perf.dash + perf.gap;
    for (let s = perf.gap; s + perf.dash < ctx.len; s += step) f.perforations.push({ pts: [ctx.toXY(s, 0), ctx.toXY(s + perf.dash, 0)] });
  } else f.score.push({ pts: [ctx.A, ctx.B], kind });
}

/** Living-hinge slits along a straight band (used by Flaticulation detent hinges). */
export function hingeBand(ctx: EdgeCtx, f: Features, halfWidth: number, cut: number, bridge: number, spacing: number) {
  const rows = Math.max(2, Math.floor((2 * halfWidth) / spacing));
  for (let r = 0; r <= rows; r++) {
    const n = -halfWidth + (r * 2 * halfWidth) / rows;
    const offset = r % 2 ? (cut + bridge) / 2 : 0;
    for (let s = bridge - offset; s < ctx.len - bridge; s += cut + bridge) {
      const a = Math.max(bridge, s), b = Math.min(ctx.len - bridge, s + cut);
      if (b - a > bridge) f.perforations.push({ pts: [ctx.toXY(a, n), ctx.toXY(b, n)] });
    }
  }
}

/**
 * Turn a fold into a Flaticulation joint: the shared edge is cut (with tiny
 * breakaway bridges), and T-patterns along it clutch the two pieces at the
 * fold angle.
 */
export function flaticulationFold(ctx: EdgeCtx, f: Features, p: JoineryParams['flaticulation']) {
  const input = {
    T: ctx.thickness,
    theta: ctx.foldAngle,
    K: p.kerfOffset,
    alpha: (p.kerfAngle * Math.PI) / 180,
    mountain: ctx.convex,
    stiffness: p.stiffness,
  };
  const less = lessThanPattern(input);
  const more = greaterThanPattern(input);
  const pitch = p.headWidth + 2.5 * ctx.thickness;
  const n = Math.max(1, Math.floor((ctx.len * Math.max(0.1, Math.min(0.95, p.occupancy))) / pitch));
  const span = n * pitch;
  const start = (ctx.len - span) / 2 + pitch / 2;
  const keep: [number, number][] = [];
  const cuts: Path2[] = [];
  for (let i = 0; i < n; i++) {
    const c = start + i * pitch;
    const useLess = p.joint === 'articulated' ? i % 2 === 0 : false;
    const g = useLess ? drawLessThan(c, less, p.neckWidth, p.headWidth, ctx.thickness) : drawGreaterThan(c, more, p.neckWidth, p.headWidth, ctx.thickness);
    cuts.push(...g.cuts);
    keep.push(...g.keep);
  }
  if (p.joint === 'detent') hingeBand(ctx, f, Math.max(3, ctx.thickness * 2), 10, 2, Math.max(1, ctx.thickness * 0.6));
  // The shared edge itself is cut, except across the necks and at small breakaway bridges.
  const gaps: [number, number][] = [...keep];
  if (p.breakTab > 0) for (let s = 12; s < ctx.len - 6; s += 24) gaps.push([s - p.breakTab / 2, s + p.breakTab / 2]);
  gaps.sort((a, b) => a[0] - b[0]);
  let cur = 0;
  for (const [a, b] of gaps) {
    if (a > cur + 0.2) cuts.push([[cur, 0], [a, 0]]);
    cur = Math.max(cur, b);
  }
  if (cur < ctx.len - 0.2) cuts.push([[cur, 0], [ctx.len, 0]]);
  for (const c of cuts) f.perforations.push({ pts: local(ctx, c) });
  return { less, more, patterns: n };
}
