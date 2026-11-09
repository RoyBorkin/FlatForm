/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Junction hubs: one printed connector per point where members meet, with a
 * socket for each member at its real angle. Used by sticks, mesh lines, the
 * lattice and, as corner hubs, by every panel method.
 */
import type { Junction, JunctionArm } from '../types';
import type { JoineryParams } from '../params';
import { cross3, dot3, norm3, tangentFrame, type V3 } from '../math/vec';
import type { Unfolded } from '../unfold/unfold';
import { getV, sub3 } from '../math/vec';

type J = JoineryParams['junction'];

/** Half the widest extent of a socket (mm). */
export const socketRadius = (a: Pick<JunctionArm, 'shape' | 'w' | 'h'>, j: J) =>
  a.shape === 'round' ? a.w / 2 + j.clearance : a.shape === 'fork' ? a.h / 2 + j.clearance : Math.hypot(a.w, a.h) / 2 + j.clearance;

/**
 * Distance from the hub centre to the bottom of the sockets, far enough out
 * that neighbouring sockets (plus a wall) never cut into each other.
 */
export function junctionCore(arms: JunctionArm[], j: J): number {
  let r = 0;
  for (let i = 0; i < arms.length; i++) r = Math.max(r, socketRadius(arms[i], j) + j.wall);
  let need = r;
  for (let i = 0; i < arms.length; i++)
    for (let k = i + 1; k < arms.length; k++) {
      const a = Math.acos(Math.max(-1, Math.min(1, dot3(arms[i].dir, arms[k].dir))));
      const ri = socketRadius(arms[i], j) + j.wall / 2, rk = socketRadius(arms[k], j) + j.wall / 2;
      // Sockets of radius ri, rk along directions a apart clear each other beyond this distance.
      const s = Math.sin(Math.max(a, 0.12) / 2);
      need = Math.max(need, Math.max(ri, rk) / s);
    }
  return Math.min(need, r * 6) + j.core;
}

/** Express world-space arms in the hub frame (z = normal) and size the core. */
export function makeJunction(id: string, pos: V3, normal: V3, arms: JunctionArm[], j: J): Junction {
  const n = norm3(normal);
  const { t, b } = tangentFrame(n);
  const toLocal = (v: V3): V3 => [dot3(v, t), dot3(v, b), dot3(v, n)];
  const local = arms.map((a) => ({ ...a, dir: norm3(toLocal(a.dir)), up: norm3(toLocal(a.up)) }));
  return { id, pos, core: junctionCore(local, j), arms: local };
}

/**
 * Group junctions that would print as the same part: same members and the
 * same angles between them (to 1°), including handedness.
 */
export function junctionSignature(h: Junction): string {
  const arms = h.arms.map((a) => `${a.shape}:${a.w.toFixed(1)}:${a.h.toFixed(1)}`).sort();
  const n = h.arms.length;
  const angles: number[] = [];
  const sums = h.arms.map(() => 0);
  for (let i = 0; i < n; i++)
    for (let k = i + 1; k < n; k++) {
      const a = Math.round((Math.acos(Math.max(-1, Math.min(1, dot3(h.arms[i].dir, h.arms[k].dir)))) * 180) / Math.PI);
      angles.push(a);
      sums[i] += a;
      sums[k] += a;
    }
  angles.sort((x, y) => x - y);
  // Handedness of the three arms with the smallest angle sums (ties make dedupe more cautious, never wrong-handed).
  let chir = 0;
  if (n >= 3) {
    const idx = sums.map((s, i) => [s, i]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).slice(0, 3).map((x) => x[1]);
    const det = dot3(h.arms[idx[0]].dir, cross3(h.arms[idx[1]].dir, h.arms[idx[2]].dir));
    chir = Math.abs(det) < 0.05 ? 0 : Math.sign(det);
  }
  return `${arms.join(',')}|${angles.join(',')}|${chir}|${h.core.toFixed(1)}`;
}

/**
 * Corner hubs for panel methods: a junction at every mesh vertex where two or
 * more separate parts meet. Each part that touches the vertex gets a fork
 * that grips its corner; the corner is cut back by the hub's core radius.
 */
export function panelJunctions(U: Unfolded, j: J, thickness: number, include: (v: number) => boolean = () => true): { junctions: Junction[]; relief: Map<number, number> } {
  const m = U.m;
  const nt = m.indices.length / 3;
  const byVertex = new Map<number, number[]>();
  for (let f = 0; f < nt; f++)
    for (let k = 0; k < 3; k++) {
      const v = m.indices[f * 3 + k];
      if (!byVertex.has(v)) byVertex.set(v, []);
      byVertex.get(v)!.push(f);
    }
  const junctions: Junction[] = [];
  const relief = new Map<number, number>();
  const forkW = Math.max(8, j.socketDepth * 0.8);
  for (const [v, faces] of byVertex) {
    if (!include(v)) continue;
    const byIsland = new Map<number, number[]>();
    for (const f of faces) {
      const i = U.island[f];
      if (!byIsland.has(i)) byIsland.set(i, []);
      byIsland.get(i)!.push(f);
    }
    if (byIsland.size < 2) continue;
    const p = getV(m.positions, v);
    const arms: JunctionArm[] = [];
    let nrm: V3 = [0, 0, 0];
    for (const fs of byIsland.values()) {
      let d: V3 = [0, 0, 0], up: V3 = [0, 0, 0];
      for (const f of fs) {
        const ids = [0, 1, 2].map((k) => m.indices[f * 3 + k]);
        const k = ids.indexOf(v);
        const a = norm3(sub3(getV(m.positions, ids[(k + 1) % 3]), p));
        const b = norm3(sub3(getV(m.positions, ids[(k + 2) % 3]), p));
        d = [d[0] + a[0] + b[0], d[1] + a[1] + b[1], d[2] + a[2] + b[2]];
        const n = U.normals[f];
        up = [up[0] + n[0], up[1] + n[1], up[2] + n[2]];
      }
      up = norm3(up);
      // Keep the arm in the plate: remove any component along its normal.
      const k = dot3(d, up);
      d = norm3([d[0] - up[0] * k, d[1] - up[1] * k, d[2] - up[2] * k]);
      arms.push({ dir: d, up, shape: 'fork', w: forkW, h: thickness });
      nrm = [nrm[0] + up[0], nrm[1] + up[1], nrm[2] + up[2]];
    }
    const h = makeJunction(`J${junctions.length + 1}`, p, nrm, arms, j);
    junctions.push(h);
    relief.set(v, h.core + j.clearance);
  }
  return { junctions, relief };
}

/** Group by signature: one printable file per distinct hub. */
export function groupJunctions(list: Junction[], dedupe: boolean): { hub: Junction; count: number; ids: string[] }[] {
  if (!dedupe) return list.map((hub) => ({ hub, count: 1, ids: [hub.id] }));
  const map = new Map<string, { hub: Junction; count: number; ids: string[] }>();
  for (const h of list) {
    const key = junctionSignature(h);
    const g = map.get(key);
    if (g) {
      g.count++;
      g.ids.push(h.id);
    } else map.set(key, { hub: h, count: 1, ids: [h.id] });
  }
  return [...map.values()];
}
