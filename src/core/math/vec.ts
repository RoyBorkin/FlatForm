/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/**
 * Small allocation-light vector helpers. Geometry code runs inside a Web Worker
 * on tens of thousands of elements, so these work on plain tuples and flat
 * Float32/Float64 arrays rather than class instances.
 */

export type V2 = [number, number];
export type V3 = [number, number, number];

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const dist3 = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const lerp3 = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export function norm3(a: V3): V3 {
  const l = len3(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1];
}

export const add2 = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
export const sub2 = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
export const scale2 = (a: V2, s: number): V2 => [a[0] * s, a[1] * s];
export const dot2 = (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1];
export const cross2 = (a: V2, b: V2) => a[0] * b[1] - a[1] * b[0];
export const len2 = (a: V2) => Math.hypot(a[0], a[1]);
export const dist2 = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const rot2 = (a: V2, ang: number): V2 => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c];
};
export function norm2(a: V2): V2 {
  const l = len2(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l] : [1, 0];
}

/** Read vertex i of a flat xyz array. */
export const getV = (arr: ArrayLike<number>, i: number): V3 => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];

/** Any unit vector perpendicular to n. */
export function perpendicular(n: V3): V3 {
  const a: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return norm3(cross3(n, a));
}

/** Orthonormal tangent frame (t, b) for a normal n. */
export function tangentFrame(n: V3): { t: V3; b: V3 } {
  const t = perpendicular(n);
  return { t, b: cross3(n, t) };
}

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const TAU = Math.PI * 2;
export function wrapAngle(a: number) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}
export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

/** Column-major 4x4 matrix helpers (compatible with THREE.Matrix4.fromArray). */
export type M4 = number[];
export const identity4 = (): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** Matrix whose columns are the given basis vectors and origin. */
export const basisMatrix = (x: V3, y: V3, z: V3, o: V3): M4 => [
  x[0], x[1], x[2], 0,
  y[0], y[1], y[2], 0,
  z[0], z[1], z[2], 0,
  o[0], o[1], o[2], 1,
];
export function mulM4(a: M4, b: M4): M4 {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let rr = 0; rr < 4; rr++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + rr] * b[c * 4 + k];
      r[c * 4 + rr] = s;
    }
  return r;
}
export function applyM4(m: M4, p: V3): V3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}
