/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import type { MeshData } from '../types';
import type { PrimitiveParams } from '../params';
import { surfaceNets, smin, type SDF } from './surfaceNets';
import { clipByPlane } from '../mesh/clip';
import { bbox, largestComponent, weld } from '../mesh/mesh';
import { rng } from '../math/rng';
import type { V3 } from '../math/vec';

const TAU = Math.PI * 2;

/** Parametric grid surface. u wraps when `wrapU`; v runs from 0 to 1 open. */
function parametric(
  fn: (u: number, v: number) => V3,
  nu: number,
  nv: number,
  wrapU: boolean,
  capStart = false,
  capEnd = false,
): MeshData {
  const pos: number[] = [];
  const idx: number[] = [];
  const cols = wrapU ? nu : nu + 1;
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i < cols; i++) {
      const p = fn(i / nu, j / nv);
      pos.push(p[0], p[1], p[2]);
    }
  const at = (i: number, j: number) => j * cols + (wrapU ? i % nu : i);
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      idx.push(a, b, c, a, c, d);
    }
  const cap = (j: number, flip: boolean) => {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < nu; i++) {
      const v = at(i, j);
      cx += pos[v * 3];
      cy += pos[v * 3 + 1];
      cz += pos[v * 3 + 2];
    }
    const c = pos.length / 3;
    pos.push(cx / nu, cy / nu, cz / nu);
    for (let i = 0; i < nu; i++) {
      const a = at(i, j), b = at(i + 1, j);
      if (flip) idx.push(c, b, a);
      else idx.push(c, a, b);
    }
  };
  if (wrapU && capStart) cap(0, true);
  if (wrapU && capEnd) cap(nv, false);
  return weld({ positions: new Float32Array(pos), indices: new Uint32Array(idx) }, 1e-6);
}

function lathe(radius: (theta: number, t: number) => number, height: number, p: PrimitiveParams): MeshData {
  const nu = Math.max(24, Math.round(p.resolution * 1.6));
  const nv = Math.max(12, Math.round(p.resolution));
  return parametric(
    (u, v) => {
      const th = u * TAU;
      const r = radius(th, v);
      return [r * Math.cos(th), r * Math.sin(th), v * height];
    },
    nu,
    nv,
    true,
    !p.openBottom,
    !p.openTop,
  );
}

function sdfPrimitive(p: PrimitiveParams): { f: SDF; min: V3; max: V3 } {
  const S = p.size / 2;
  const R = rng(p.seed);
  switch (p.kind) {
    case 'sphere': {
      const sq = 0.5 + p.a;
      const amp = p.b * 0.18 * S;
      const fr = 1.5 + p.c * 6;
      const ph = [R.range(0, TAU), R.range(0, TAU), R.range(0, TAU)];
      return {
        f: (x, y, z) => {
          const zz = z / sq;
          const d = Math.hypot(x, y, zz) - S;
          const n = Math.sin((x / S) * fr + ph[0]) * Math.sin((y / S) * fr + ph[1]) * Math.sin((z / S) * fr + ph[2]);
          return d * Math.min(1, sq) - amp * n;
        },
        min: [-S * 1.3, -S * 1.3, -S * sq * 1.3],
        max: [S * 1.3, S * 1.3, S * sq * 1.3],
      };
    }
    case 'torus': {
      const Rm = S * 0.68;
      const r = S * (0.12 + p.a * 0.25);
      const waves = Math.round(p.b * 8);
      const wh = p.c * S * 0.35;
      return {
        f: (x, y, z) => {
          const th = Math.atan2(y, x);
          const zc = waves ? Math.sin(th * waves) * wh : 0;
          const q = Math.hypot(x, y) - Rm;
          return Math.hypot(q, z - zc) - r;
        },
        min: [-S - r, -S - r, -r - wh - 5],
        max: [S + r, S + r, r + wh + 5],
      };
    }
    case 'roundedBox': {
      const bx = S, by = S * (0.3 + p.a * 0.9), bz = S * (0.3 + p.b * 0.9);
      const rr = Math.min(bx, by, bz) * (0.05 + p.c * 0.9);
      return {
        f: (x, y, z) => {
          const qx = Math.abs(x) - bx + rr, qy = Math.abs(y) - by + rr, qz = Math.abs(z - bz) - bz + rr;
          return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rr;
        },
        min: [-bx - 2, -by - 2, -2],
        max: [bx + 2, by + 2, bz * 2 + 2],
      };
    }
    case 'capsule': {
      const len = S * (0.6 + p.a * 1.6);
      const rad = S * 0.35;
      const waist = p.b * 0.6;
      const bend = p.c * 0.6;
      return {
        f: (x, y, z) => {
          const t = Math.max(-1, Math.min(1, z / len));
          const bx = bend * len * (1 - t * t);
          const r = rad * (1 - waist * (1 - t * t));
          const zc = Math.max(-len, Math.min(len, z));
          return Math.hypot(x - bx, y, z - zc) - r;
        },
        min: [-rad - 5, -rad - 5, -len - rad - 5],
        max: [rad + bend * len + 5, rad + 5, len + rad + 5],
      };
    }
    case 'blob': {
      const count = 3 + Math.round(p.a * 6);
      const spread = S * (0.25 + p.b * 0.6);
      const k = S * (0.1 + p.c * 0.6);
      const balls = Array.from({ length: count }, () => ({
        c: [R.range(-spread, spread), R.range(-spread, spread), R.range(-spread * 0.7, spread * 0.7)] as V3,
        r: S * R.range(0.28, 0.5),
      }));
      return {
        f: (x, y, z) => {
          let d = Infinity;
          for (const b of balls) {
            const di = Math.hypot(x - b.c[0], y - b.c[1], z - b.c[2]) - b.r;
            d = d === Infinity ? di : smin(d, di, k);
          }
          return d;
        },
        min: [-spread - S, -spread - S, -spread - S],
        max: [spread + S, spread + S, spread + S],
      };
    }
    case 'twistedTower': {
      const sides = 3 + Math.round(p.a * 5);
      const twist = p.b * TAU;
      const taper = p.c * 0.7;
      const H = p.size * 1.4;
      const r0 = S * 0.6;
      const corner = r0 * 0.12;
      return {
        f: (x, y, z) => {
          const t = Math.max(0, Math.min(1, z / H));
          const ang = Math.atan2(y, x) - twist * t;
          const rr = Math.hypot(x, y);
          const seg = TAU / sides;
          const a = ((ang % seg) + seg) % seg - seg / 2;
          const r = r0 * (1 - taper * t);
          const dEdge = rr * Math.cos(a) - r * Math.cos(Math.PI / sides);
          const side = dEdge + corner * 0;
          const cap = Math.max(-z, z - H);
          return Math.max(side, cap) - corner * 0.2;
        },
        min: [-r0 - 5, -r0 - 5, -5],
        max: [r0 + 5, r0 + 5, H + 5],
      };
    }
    case 'knot': {
      const tube = S * (0.08 + p.a * 0.18);
      const loops = 2 + Math.round(p.b * 3);
      const hz = 0.3 + p.c;
      const pts: V3[] = [];
      const N = 240;
      for (let i = 0; i < N; i++) {
        const t = (i / N) * TAU;
        // (2, q) torus knot; q must be odd to stay a single closed strand.
        const P = 2, Q = loops % 2 === 0 ? loops + 1 : loops;
        const rr = S * 0.42 * (2 + Math.cos(Q * t)) / 2.2;
        pts.push([rr * Math.cos(P * t), rr * Math.sin(P * t), S * 0.5 * hz * Math.sin(Q * t)]);
      }
      return {
        f: (x, y, z) => {
          let d = Infinity;
          for (let i = 0; i < N; i++) {
            const a = pts[i], b = pts[(i + 1) % N];
            const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
            const px = x - a[0], py = y - a[1], pz = z - a[2];
            const l2 = bx * bx + by * by + bz * bz;
            let t = (px * bx + py * by + pz * bz) / l2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dd = (px - bx * t) ** 2 + (py - by * t) ** 2 + (pz - bz * t) ** 2;
            if (dd < d) d = dd;
          }
          return Math.sqrt(d) - tube;
        },
        min: [-S - tube, -S - tube, -S * hz - tube - 5],
        max: [S + tube, S + tube, S * hz + tube + 5],
      };
    }
    default:
      return { f: (x, y, z) => Math.hypot(x, y, z) - S, min: [-S - 2, -S - 2, -S - 2], max: [S + 2, S + 2, S + 2] };
  }
}

export function primitiveToMesh(p: PrimitiveParams): MeshData {
  const S = p.size / 2;
  switch (p.kind) {
    case 'vase': {
      const H = p.size * 1.3;
      const belly = p.a * 0.6;
      const neck = p.b * 0.6;
      const ripples = Math.round(p.c * 14);
      return lathe(
        (th, t) =>
          S * 0.55 *
          (1 + belly * Math.sin(Math.PI * Math.min(1, t * 1.4)) - neck * Math.max(0, t - 0.65) * 2.2 + 0.25 * neck * Math.max(0, t - 0.9) * 8) *
          (1 + (ripples ? 0.06 * Math.sin(th * ripples + t * 4) : 0)),
        H,
        p,
      );
    }
    case 'lampshade': {
      const H = p.size * 0.9;
      const flare = 0.3 + p.a * 1.2;
      const pleats = 6 + Math.round(p.b * 24);
      const depth = p.c * 0.12;
      return lathe((th, t) => S * (0.5 + flare * 0.5 * (1 - t)) * (1 + depth * Math.abs(Math.sin((th * pleats) / 2))), H, {
        ...p,
        resolution: Math.max(p.resolution, pleats * 3),
      });
    }
    case 'saddle': {
      const n = Math.max(12, Math.round(p.resolution));
      const curv = (0.2 + p.a * 1.4) / S;
      const aspect = 0.5 + p.b;
      const wave = p.c * S * 0.15;
      return parametric(
        (u, v) => {
          const x = (u - 0.5) * 2 * S;
          const y = (v - 0.5) * 2 * S * aspect;
          return [x, y, (curv * (x * x - y * y)) / 2 + wave * Math.sin((x / S) * 5) * Math.cos((y / S) * 4)];
        },
        n,
        n,
        false,
      );
    }
    default: {
      const { f, min, max } = sdfPrimitive(p);
      let m = largestComponent(surfaceNets(f, min, max, p.resolution));
      const b = bbox(m);
      if (p.openTop) m = clipByPlane(m, [0, 0, 1], b.max[2] - b.size[2] * 0.08);
      if (p.openBottom) m = clipByPlane(m, [0, 0, -1], -(b.min[2] + b.size[2] * 0.08));
      return m;
    }
  }
}
