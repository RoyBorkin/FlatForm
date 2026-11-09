/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Flat junction hubs: a thin star-shaped plate in the hub's tangent plane,
 * with one arm per member. Each arm bends along a marked line so that it
 * lies against its member:
 *
 *  - panels (forks) and flat bars: the arm folds about the line where the
 *    plate's plane meets the member's face plane, by the angle between the
 *    two planes, so it lands flat on the face (screw, rivet or glue);
 *  - sticks: the arm folds straight up or down by the stick's elevation, and
 *    the stick is tied to it through two slots.
 *
 * Printed thin in PETG or TPU (with a V-groove at each bend that closes at
 * the bend angle), or cut from bendable sheet with the bends scored.
 */
import type { Circle2, Junction, JunctionArm, Path2 } from '../types';
import type { JoineryParams } from '../params';
import { cross3, dot3, norm3, type V2, type V3 } from '../math/vec';
import { offsetPolygons, union } from '../polygon/polygon';

type J = JoineryParams['junction'];

export interface FlatArm {
  /** Arm direction in the flat plate. */
  dir: V2;
  /** Bend line: points p with dot(p, m) = d, running along ax. */
  m: V2;
  ax: V2;
  d: number;
  /** Bend angle, degrees. Positive bends the arm up (toward the hub normal). */
  angle: number;
  /** Distance from the centre to the bend line along the arm, and the arm's total length. */
  start: number;
  length: number;
  width: number;
  /** End points of the bend line across the arm. */
  bend: [V2, V2];
  holes: Circle2[];
  slots: Path2[];
  /** Screw hole distance from the node along the member (panels only). */
  holeDist?: number;
  /** Angle the arm still has to twist to sit flat on its member (degrees; 0 for panels). */
  twist: number;
  shape: JunctionArm['shape'];
}

export interface FlatHub {
  outline: Path2[];
  arms: FlatArm[];
  /** Radius of the central plate: panel corners are cut back to clear it. */
  rb: number;
  maxTwist: number;
}

const Z: V3 = [0, 0, 1];

/** Rotate v about unit axis k by angle a (Rodrigues). */
function rotate(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = cross3(k, v);
  const kd = dot3(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}

/** The face of the member that the arm lies against (unit normal, any sign). */
function faceNormal(a: JunctionArm, d: V3): V3 | null {
  if (a.shape === 'fork' || a.shape === 'slot') {
    // The thin dimension's axis is the face normal: up for panels and flat bars, the side for bars on edge.
    const up = norm3([a.up[0] - d[0] * dot3(a.up, d), a.up[1] - d[1] * dot3(a.up, d), a.up[2] - d[2] * dot3(a.up, d)]);
    if (!Number.isFinite(up[0])) return null;
    return a.h <= a.w ? up : norm3(cross3(up, d));
  }
  return null;
}

const rectAlong = (dir: V2, a: number, b: number, w: number): Path2 => {
  const n: V2 = [-dir[1], dir[0]];
  return [
    [dir[0] * a + n[0] * (w / 2), dir[1] * a + n[1] * (w / 2)],
    [dir[0] * a - n[0] * (w / 2), dir[1] * a - n[1] * (w / 2)],
    [dir[0] * b - n[0] * (w / 2), dir[1] * b - n[1] * (w / 2)],
    [dir[0] * b + n[0] * (w / 2), dir[1] * b + n[1] * (w / 2)],
  ];
};

/** Lay out the flat version of a junction hub (mm, hub frame, z = normal). */
export function flatHub(h: Junction, j: J): FlatHub {
  const tie = { w: 1.8, l: 4.5 };
  const pre = h.arms.map((a) => {
    const d = norm3(a.dir);
    let n = faceNormal(a, d);
    let twist = 0;
    if (!n) {
      // Sticks: the smallest fold, straight up or down.
      const k = dot3(Z, d);
      n = norm3([-d[0] * k, -d[1] * k, 1 - d[2] * k]);
      if (!Number.isFinite(n[0])) n = [1, 0, 0];
    }
    if (dot3(n, Z) < 0) n = [-n[0], -n[1], -n[2]];
    let ax = cross3(Z, n);
    const s = Math.hypot(ax[0], ax[1], ax[2]);
    let psi = Math.atan2(s, dot3(Z, n));
    let flat: V3;
    if (s < 1e-4) {
      ax = norm3(cross3(Z, d[2] > 0.999 ? [1, 0, 0] : d));
      psi = 0;
      flat = d;
    } else {
      ax = [ax[0] / s, ax[1] / s, ax[2] / s];
      flat = rotate(d, ax, -psi);
    }
    let dir = [flat[0], flat[1]] as V2;
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    dir = [dir[0] / dl, dir[1] / dl];
    let m: V2 = [-ax[1], ax[0]];
    if (m[0] * dir[0] + m[1] * dir[1] < 0) m = [-m[0], -m[1]];
    let ax2: V2 = [ax[0], ax[1]];
    // A bend line almost along the arm cannot work: fall back to a square bend and twist the rest.
    if (m[0] * dir[0] + m[1] * dir[1] < 0.4) {
      const e = Math.hypot(d[0], d[1]) || 1;
      dir = [d[0] / e, d[1] / e];
      m = dir;
      ax2 = [-dir[1], dir[0]];
      const want = Math.asin(Math.max(-1, Math.min(1, d[2])));
      twist = Math.abs((Math.acos(Math.max(-1, Math.min(1, Math.abs(dot3(n, norm3([-d[0] * d[2], -d[1] * d[2], 1 - d[2] * d[2]])))))) * 180) / Math.PI);
      psi = Math.abs(want);
    }
    // Arm width: room for a screw hole (panels) or for the member and two tie slots.
    const width =
      a.shape === 'fork' ? Math.max(10, j.flatHole * 3) : a.shape === 'slot' ? Math.max(a.w, a.h) + 2 * (tie.w + 2.4) : a.w + 2 * (tie.w + 2.4);
    const up = d[2] >= 0;
    return { a, d, dir, m, ax: ax2, psi, width, twist, up };
  });
  // Central plate radius: far enough out that neighbouring arms never overlap at their bend lines.
  let rb = Math.max(4, j.flatHole * 1.5);
  for (let i = 0; i < pre.length; i++)
    for (let k = i + 1; k < pre.length; k++) {
      const c = pre[i].dir[0] * pre[k].dir[0] + pre[i].dir[1] * pre[k].dir[1];
      const ang = Math.acos(Math.max(-1, Math.min(1, c)));
      const need = (Math.max(pre[i].width, pre[k].width) / 2 + 0.8) / Math.sin(Math.max(ang, 0.15) / 2);
      rb = Math.max(rb, Math.min(need, 30));
    }
  const arms: FlatArm[] = [];
  const outline: Path2[] = [];
  for (const p of pre) {
    const cosA = p.m[0] * p.dir[0] + p.m[1] * p.dir[1];
    const start = rb / Math.max(0.4, cosA);
    // Sticks and bars stop short of the node (by the hub core): the arm reaches past their ends.
    const reach = p.a.shape === 'fork' ? j.flatTab : j.flatTab + Math.max(0, h.core - start);
    const length = start + reach;
    const n: V2 = [-p.dir[1], p.dir[0]];
    // Bend line across the arm: dot(q, m) = rb.
    const half = p.width / 2;
    const at = (side: number): V2 => {
      // Point on the arm edge (offset side·half along n) where it crosses the bend line.
      const e: V2 = [n[0] * side * half, n[1] * side * half];
      const t = (rb - (e[0] * p.m[0] + e[1] * p.m[1])) / cosA;
      return [e[0] + p.dir[0] * t, e[1] + p.dir[1] * t];
    };
    const holes: Circle2[] = [];
    const slots: Path2[] = [];
    const mid = start + reach * 0.55;
    let holeDist: number | undefined;
    if (p.a.shape === 'fork') {
      if (j.flatHole > 0) {
        holes.push({ x: p.dir[0] * mid, y: p.dir[1] * mid, r: j.flatHole / 2 });
        // Along the panel the hole sits this far from the node: the bend point's reach along the member plus the rest of the arm.
        holeDist = start * (p.dir[0] * p.d[0] + p.dir[1] * p.d[1]) + (mid - start);
      }
    } else {
      // Two tie slots either side of the member.
      const off = (p.a.shape === 'slot' ? Math.max(p.a.w, p.a.h) : p.a.w) / 2 + 1.2 + tie.w / 2;
      for (const sgn of [-1, 1]) {
        const c: V2 = [p.dir[0] * mid + n[0] * off * sgn, p.dir[1] * mid + n[1] * off * sgn];
        slots.push(rectAlong(p.dir, 0, tie.l, tie.w).map(([x, y]) => [x + c[0] - p.dir[0] * tie.l / 2, y + c[1] - p.dir[1] * tie.l / 2] as V2));
      }
    }
    outline.push(rectAlong(p.dir, 0, length, p.width));
    arms.push({
      dir: p.dir,
      m: p.m,
      ax: p.ax,
      d: rb,
      angle: ((p.up ? 1 : -1) * p.psi * 180) / Math.PI,
      start,
      length,
      width: p.width,
      bend: [at(-1), at(1)],
      holes,
      slots,
      holeDist,
      twist: p.twist,
      shape: p.a.shape,
    });
  }
  const disc: Path2 = [];
  for (let i = 0; i < 40; i++) disc.push([Math.cos((i / 40) * Math.PI * 2) * rb * 0.9, Math.sin((i / 40) * Math.PI * 2) * rb * 0.9]);
  // Round the outside corners a little: kinder to fingers and to printers.
  const body = offsetPolygons(offsetPolygons(union([...outline, disc]), -1.5), 1.5);
  return { outline: body, arms, rb, maxTwist: Math.max(0, ...arms.map((a) => a.twist)) };
}
