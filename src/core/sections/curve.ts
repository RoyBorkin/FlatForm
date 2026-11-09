/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/** Guide curves and plane frames shared by layers and classic models. */
import type { CurveParams } from '../params';
import type { MeshData } from '../types';
import { bbox } from '../mesh/mesh';
import { cross3, dot3, norm3, sub3, type V3 } from '../math/vec';
import type { PlaneFrame } from '../mesh/slice';

/** Orthonormal frame for a plane with normal n; v leans toward `up`. u × v = n. */
export function frameFromNormal(n: V3, up: V3 = [0, 0, 1]): PlaneFrame {
  const nn = norm3(n);
  let ref = up;
  if (Math.abs(dot3(nn, norm3(up))) > 0.95) ref = Math.abs(nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const d = dot3(ref, nn);
  const v = norm3([ref[0] - nn[0] * d, ref[1] - nn[1] * d, ref[2] - nn[2] * d]);
  const u = cross3(v, nn);
  return { u, v, n: nn };
}

export const planeNormalOf = (plane: CurveParams['plane']): V3 => (plane === 'xz' ? [0, 1, 0] : plane === 'yz' ? [1, 0, 0] : [0, 0, 1]);

/** Map a normalised curve point into the shape's bounding box. */
export function curvePoint3(m: MeshData, c: CurveParams, p: [number, number]): V3 {
  const b = bbox(m);
  const [u, v] = p;
  if (c.plane === 'xz') return [b.min[0] + u * b.size[0], b.center[1], b.min[2] + v * b.size[2]];
  if (c.plane === 'yz') return [b.center[0], b.min[1] + u * b.size[1], b.min[2] + v * b.size[2]];
  return [b.min[0] + u * b.size[0], b.min[1] + v * b.size[1], b.center[2]];
}

function catmull(p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 {
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])];
}

export interface CurveSample {
  p: V3;
  t: V3; // unit tangent
  s: number; // arc length from the start
}

/** Dense polyline of the guide curve (Catmull-Rom through the control points). */
export function curvePolyline(m: MeshData, c: CurveParams, steps = 240): V3[] {
  const pts = c.points.map((p) => curvePoint3(m, c, p));
  if (pts.length < 2) return pts;
  const ext = [sub3(pts[0], sub3(pts[1], pts[0])), ...pts, sub3(pts[pts.length - 1], sub3(pts[pts.length - 2], pts[pts.length - 1]))];
  const out: V3[] = [];
  const segs = pts.length - 1;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * segs;
    const k = Math.min(segs - 1, Math.floor(x));
    out.push(catmull(ext[k], ext[k + 1], ext[k + 2], ext[k + 3], x - k));
  }
  return out;
}

/** Samples at equal arc-length spacing (or `count` samples) between fractions a..b of the length. */
export function sampleCurve(m: MeshData, c: CurveParams, opts: { spacing?: number; count?: number; from?: number; to?: number }): { samples: CurveSample[]; length: number } {
  const poly = curvePolyline(m, c);
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(...(sub3(poly[i], poly[i - 1]) as [number, number, number])));
  const length = cum[cum.length - 1];
  const a = (opts.from ?? 0) * length, b = (opts.to ?? 1) * length;
  const targets: number[] = [];
  if (opts.count) for (let i = 0; i < opts.count; i++) targets.push(a + ((i + 0.5) * (b - a)) / opts.count);
  else if (opts.spacing) {
    const n = Math.max(1, Math.floor((b - a) / opts.spacing));
    const start = a + (b - a - (n - 1) * opts.spacing) / 2;
    for (let i = 0; i < n; i++) targets.push(start + i * opts.spacing);
  }
  const samples: CurveSample[] = [];
  let j = 1;
  for (const s of targets) {
    while (j < cum.length - 1 && cum[j] < s) j++;
    const s0 = cum[j - 1], s1 = cum[j];
    const f = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    const p0 = poly[j - 1], p1 = poly[j];
    const p: V3 = [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, p0[2] + (p1[2] - p0[2]) * f];
    samples.push({ p, t: norm3(sub3(p1, p0)), s });
  }
  return { samples, length };
}

/** Polyline as line-segment pairs for the 3D overlay. */
export function guideSegments(pts: V3[]): Float32Array {
  const out: number[] = [];
  for (let i = 1; i < pts.length; i++) out.push(...pts[i - 1], ...pts[i]);
  return new Float32Array(out);
}
