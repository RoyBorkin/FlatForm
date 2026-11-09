/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Printable parts for the newer joinery and methods: junction hubs, crossing
 * clips, rod collars, cardboard channel connectors and LEGO-compatible
 * bricks. All in mm, modelled in print orientation and moved onto the bed.
 */
import type { ManifoldToplevel, Manifold as ManifoldT } from 'manifold-3d';
import type { JoineryParams } from '../params';
import type { Junction, JunctionArm } from '../types';
import { cross3, dot3, norm3, type V3 } from '../math/vec';
import { groupJunctions } from '../joinery/junction';
import { flatHub } from '../joinery/flatHub';

const SEG = 40;

/** Arm frame: x along the arm, z along its `up`. Column-major 4×4 for Manifold. */
function armMatrix(a: JunctionArm): number[] {
  const d = norm3(a.dir);
  const k = dot3(a.up, d);
  let up = norm3([a.up[0] - d[0] * k, a.up[1] - d[1] * k, a.up[2] - d[2] * k]);
  if (!Number.isFinite(up[0])) up = Math.abs(d[2]) < 0.9 ? norm3(cross3(d, [0, 0, 1])) : [1, 0, 0];
  const side = cross3(up, d);
  return [d[0], d[1], d[2], 0, side[0], side[1], side[2], 0, up[0], up[1], up[2], 0, 0, 0, 0, 1];
}

const onBed = (m: ManifoldT) => {
  const b = m.boundingBox();
  return m.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]]);
};

/** One junction hub: a core with a sleeve per member and that member's socket cut into it. */
export function junctionHub(W: ManifoldToplevel, h: Junction, j: JoineryParams['junction']): ManifoldT {
  const { Manifold } = W;
  const c = j.clearance, wall = j.wall;
  const L = h.core + j.socketDepth;
  const sleeves: ManifoldT[] = [];
  const sockets: ManifoldT[] = [];
  let maxR = 0;
  for (const a of h.arms) {
    const M = armMatrix(a) as Parameters<ManifoldT['transform']>[0];
    let sleeve: ManifoldT, socket: ManifoldT;
    if (a.shape === 'round') {
      const r = a.w / 2 + c;
      sleeve = Manifold.cylinder(L, r + wall, r + wall, SEG).rotate([0, 90, 0]);
      socket = Manifold.cylinder(j.socketDepth + 1, r, r, SEG).rotate([0, 90, 0]).translate([h.core, 0, 0]);
      maxR = Math.max(maxR, r + wall);
    } else if (a.shape === 'fork') {
      // Open on both sides: the panel corner slides in between the two jaws.
      const H = a.h + 2 * c + 2 * wall;
      sleeve = Manifold.cube([L, a.w, H]).translate([0, -a.w / 2, -H / 2]);
      socket = Manifold.cube([j.socketDepth + 1, a.w + 2, a.h + 2 * c]).translate([h.core, -a.w / 2 - 1, -(a.h + 2 * c) / 2]);
      maxR = Math.max(maxR, H / 2);
    } else {
      const sw = a.w + 2 * c, sh = a.h + 2 * c;
      sleeve = Manifold.cube([L, sw + 2 * wall, sh + 2 * wall]).translate([0, -(sw + 2 * wall) / 2, -(sh + 2 * wall) / 2]);
      socket = Manifold.cube([j.socketDepth + 1, sw, sh]).translate([h.core, -sw / 2, -sh / 2]);
      maxR = Math.max(maxR, Math.hypot(sw, sh) / 2 + wall);
    }
    sleeves.push(sleeve.transform(M));
    sockets.push(socket.transform(M));
  }
  const core = Manifold.sphere(Math.max(maxR, h.core * 0.75), SEG);
  return onBed(Manifold.union([core, ...sleeves]).subtract(Manifold.union(sockets)));
}

/**
 * Support-free junction hub, one piece. Every sleeve stands on its own fin:
 * the convex hull of the sleeve and its footprint on the bed, pulled in by
 * at most 45°, so nothing overhangs more than 45°. Round sockets are
 * diamonds with a vertical diagonal (45° roofs); square and slot sockets are
 * short bridges. Stick hubs print upside down when most arms point down, so
 * the sockets rise and their blind ends are floors. Panel hubs hold each
 * corner on a shelf (no roof over the panel), screwed or glued.
 */
export function printableHub(W: ManifoldToplevel, h: Junction, j: JoineryParams['junction']): ManifoldT {
  const { Manifold } = W;
  const c = j.clearance, wall = j.wall;
  const L = h.core + j.socketDepth;
  const forks = h.arms.some((a) => a.shape === 'fork');
  // Print with most arms rising (forks: always shelf side up).
  const flip = !forks && h.arms.reduce((s, a) => s + a.dir[2], 0) < 0;
  const F = (v: V3): V3 => (flip ? [v[0], -v[1], -v[2]] : v); // 180° about x
  type Box = { M: number[]; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  const boxes: Box[] = [];
  const sockets: ManifoldT[] = [];
  const holes: ManifoldT[] = [];
  let maxR = 0;
  for (const a0 of h.arms) {
    const a = { ...a0, dir: F(a0.dir), up: F(a0.up) };
    const d = norm3(a.dir);
    const depth = j.socketDepth + 1;
    if (a.shape === 'round') {
      // Diamond with its diagonal as close to vertical as the arm allows.
      const k = d[2];
      let vert = norm3([-d[0] * k, -d[1] * k, 1 - k * k]);
      if (!Number.isFinite(vert[0])) vert = norm3(a.up);
      const M = armMatrix({ ...a, up: vert }) as Parameters<ManifoldT['transform']>[0];
      const sq = a.w + 2 * c, r = (sq / 2) * Math.SQRT2;
      boxes.push({ M, x0: 0, x1: L, y0: -r - wall, y1: r + wall, z0: -r - wall, z1: r + wall });
      sockets.push(Manifold.cube([depth, sq, sq], true).rotate([45, 0, 0]).translate([h.core + depth / 2, 0, 0]).transform(M));
      maxR = Math.max(maxR, r + wall);
    } else if (a.shape === 'fork') {
      const M = armMatrix(a) as Parameters<ManifoldT['transform']>[0];
      const top = -(a.h / 2 + c);
      boxes.push({ M, x0: 0, x1: L, y0: -a.w / 2, y1: a.w / 2, z0: top - 2 * wall, z1: top });
      if (j.flatHole > 0) holes.push(Manifold.cylinder(40, j.flatHole / 2, j.flatHole / 2, SEG).translate([h.core + j.socketDepth / 2, 0, -20]).transform(M));
      maxR = Math.max(maxR, a.w / 2);
    } else {
      const M = armMatrix(a) as Parameters<ManifoldT['transform']>[0];
      const sw = a.w + 2 * c, sh = a.h + 2 * c;
      boxes.push({ M, x0: 0, x1: L, y0: -sw / 2 - wall, y1: sw / 2 + wall, z0: -sh / 2 - wall, z1: sh / 2 + wall });
      sockets.push(Manifold.cube([depth, sw, sh], true).translate([h.core + depth / 2, 0, 0]).transform(M));
      maxR = Math.max(maxR, Math.hypot(sw, sh) / 2 + wall);
    }
  }
  const tf = (b: Box, x: number, y: number, z: number): V3 => {
    const M = b.M;
    return [M[0] * x + M[4] * y + M[8] * z, M[1] * x + M[5] * y + M[9] * z, M[2] * x + M[6] * y + M[10] * z];
  };
  const corners = boxes.map((b) => {
    const pts: V3[] = [];
    for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) pts.push(tf(b, x, y, z));
    return pts;
  });
  const coreR = Math.max(maxR * 0.8, 3);
  let bed = -coreR;
  for (const pts of corners) for (const q of pts) bed = Math.min(bed, q[2]);
  const solids: ManifoldT[] = [];
  boxes.forEach((b, i) => {
    const pts = corners[i];
    // Axis of the sleeve in plan, for pulling the fin in at 45°.
    const o = tf(b, 0, 0, 0), e = tf(b, 1, 0, 0);
    let ax: [number, number] = [e[0] - o[0], e[1] - o[1]];
    const al = Math.hypot(ax[0], ax[1]);
    ax = al > 1e-6 ? [ax[0] / al, ax[1] / al] : [1, 0];
    const feet: V3[] = pts.map((q) => {
      const t = q[0] * ax[0] + q[1] * ax[1];
      const foot: [number, number] = [ax[0] * t, ax[1] * t];
      const lat: [number, number] = [q[0] - foot[0], q[1] - foot[1]];
      const ll = Math.hypot(lat[0], lat[1]);
      const keep = ll > 1e-6 ? Math.max(0, ll - (q[2] - bed)) / ll : 0;
      return [foot[0] + lat[0] * keep, foot[1] + lat[1] * keep, bed];
    });
    solids.push(Manifold.hull([...pts, ...feet]));
  });
  // Core: a column from the bed up to the lowest sleeve top near the centre (forks: under the panels).
  let coreTop = coreR;
  if (forks) coreTop = Math.min(...boxes.map((b) => tf(b, 0, 0, b.z1)[2]));
  solids.push(Manifold.cylinder(coreTop - bed, coreR, coreR, SEG).translate([0, 0, bed]));
  let body = Manifold.union(solids);
  if (sockets.length) body = body.subtract(Manifold.union(sockets));
  if (holes.length) body = body.subtract(Manifold.union(holes));
  return onBed(body);
}

/**
 * Flat, flexible junction hub: a thin star-shaped plate with a V-groove
 * across each arm at its bend line, on the inside of the bend, leaving a
 * thin hinge that bends to the arm's angle. Print in PETG or TPU.
 */
export function flatHubMesh(W: ManifoldToplevel, h: Junction, j: JoineryParams['junction']): ManifoldT {
  const { Manifold, CrossSection } = W;
  const fh = flatHub(h, j);
  const T = Math.max(0.6, j.flatThickness);
  const hinge = Math.max(0.2, Math.min(T - 0.2, j.flatHinge));
  let plate = new CrossSection(fh.outline, 'NonZero').extrude(T);
  const cuts: ManifoldT[] = [];
  for (const a of fh.arms) {
    for (const hole of a.holes) cuts.push(Manifold.cylinder(T + 2, hole.r, hole.r, SEG).translate([hole.x, hole.y, -1]));
    if (a.slots.length) cuts.push(new CrossSection(a.slots, 'NonZero').extrude(T + 2).translate([0, 0, -1]));
    const ang = (Math.abs(a.angle) * Math.PI) / 180;
    if (ang < 0.01) continue;
    const depth = T - hinge;
    const g = 2 * depth * Math.tan(Math.min(ang, 2.6) / 2) + 0.3;
    const [p, q] = a.bend;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) + 2;
    const tri: [number, number][] = a.angle > 0 ? [[-g / 2, T + 0.05], [0, hinge], [g / 2, T + 0.05]] : [[-g / 2, -0.05], [g / 2, -0.05], [0, depth]];
    const m = a.m;
    const M = [m[0], m[1], 0, 0, 0, 0, 1, 0, m[1], -m[0], 0, 0, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0, 1] as Parameters<ManifoldT['transform']>[0];
    cuts.push(new CrossSection([tri], 'NonZero').extrude(len, 0, 0, 1, true).transform(M));
  }
  if (cuts.length) plate = plate.subtract(Manifold.union(cuts));
  return onBed(plate);
}

/** The printable solid for one hub in the chosen style. */
export function hubSolid(W: ManifoldToplevel, h: Junction, j: JoineryParams['junction']): ManifoldT {
  return j.style === 'printable' ? printableHub(W, h, j) : j.style === 'flat' ? flatHubMesh(W, h, j) : junctionHub(W, h, j);
}

/** Junction hubs grouped into one file per distinct shape. */
export function junctionParts(W: ManifoldToplevel, list: Junction[], j: JoineryParams['junction']) {
  return groupJunctions(list, j.dedupe).map((g, i) => ({
    name: `junction-hub_${String(i + 1).padStart(3, '0')}_${g.hub.arms.length}arm${g.count > 1 ? `_x${g.count}` : `_${g.hub.id}`}`,
    count: g.count,
    ids: g.ids,
    mesh: hubSolid(W, g.hub, j),
  }));
}

/**
 * Crossing clip: a round cap with two slots crossing at the parts' angle,
 * pressed over the end of a slotted crossing.
 */
export function crossClip(W: ManifoldToplevel, angleDeg: number, t: number, c: JoineryParams['crossing']): ManifoldT {
  const { Manifold } = W;
  const slot = t + c.clearance;
  const R = c.size;
  const body = Manifold.cylinder(c.depth + c.wall, R, R, SEG);
  const a = Manifold.cube([R * 2 + 2, slot, c.depth + 1]).translate([-R - 1, -slot / 2, c.wall]);
  const b = a.rotate([0, 0, angleDeg]);
  return onBed(body.subtract(a).subtract(b));
}

/** Rod collar: a ring that grips the rod on each side of a layer. */
export function rodCollar(W: ManifoldToplevel, bore: number, c: JoineryParams['crossing']): ManifoldT {
  const { Manifold } = W;
  const r = bore / 2 - c.clearance * 0.25; // a light press fit on the rod
  const R = r + Math.max(c.wall * 2, bore * 0.6);
  const h = Math.max(4, c.depth * 0.6);
  return onBed(Manifold.cylinder(h, R, R, SEG).subtract(Manifold.cylinder(h + 2, r, r, SEG).translate([0, 0, -1])));
}

/**
 * Cardboard channel connector: two U-channels joined at the inside angle
 * between the sheets, extruded along the seam.
 */
export function cardboardClip(W: ManifoldToplevel, insideDeg: number, t: number, c: JoineryParams['cardboard']): ManifoldT {
  const { CrossSection } = W;
  const slot = Math.max(0.3, t + c.clearance);
  const outer = slot + 2 * c.wall;
  const ang = (Math.max(20, Math.min(180, insideDeg)) * Math.PI) / 180;
  const setback = Math.min(t * 6 + c.wall, (t / 2 + c.wall / 2) / Math.tan(ang / 2) + 0.3);
  const reach = setback + c.depth;
  const arm = (theta: number) => {
    const body = CrossSection.square([reach + c.wall, outer]).translate([0, -outer / 2]);
    const cut = CrossSection.square([c.depth + 1, slot]).translate([setback, -slot / 2]);
    return { body: body.rotate((theta * 180) / Math.PI), cut: cut.rotate((theta * 180) / Math.PI) };
  };
  const A = arm(0), B = arm(ang);
  const hub = CrossSection.circle(outer / 2 + c.wall * 0.5, SEG);
  const profile = CrossSection.union([A.body, B.body, hub]).subtract(CrossSection.union([A.cut, B.cut]));
  return onBed(profile.extrude(c.length));
}

/**
 * LEGO-compatible brick, on the standard grid: 8 mm studs (Ø4.8 × 1.8),
 * 9.6 mm bricks or 3.2 mm plates, 0.1 mm play per side, 1.2 mm walls,
 * Ø6.51 tubes under 2-wide bricks and Ø3.2 pins under 1-wide ones.
 */
export function legoBrick(W: ManifoldToplevel, w: number, d: number, plate: boolean): ManifoldT {
  const { Manifold } = W;
  const P = 8, play = 0.1;
  const H = plate ? 3.2 : 9.6;
  const X = w * P - 2 * play, Y = d * P - 2 * play;
  const wall = 1.2, top = 1.0;
  let body = Manifold.cube([X, Y, H]).subtract(Manifold.cube([X - 2 * wall, Y - 2 * wall, H - top]).translate([wall, wall, -0.01]));
  const parts: ManifoldT[] = [body];
  for (let i = 0; i < w; i++)
    for (let k = 0; k < d; k++) parts.push(Manifold.cylinder(1.8, 2.4, 2.4, SEG).translate([P / 2 + i * P - play, P / 2 + k * P - play, H]));
  // Underside: tubes between studs on 2-wide bricks, solid pins on 1-wide ones.
  const under = H - top;
  if (w >= 2 && d >= 2) {
    for (let i = 1; i < w; i++)
      for (let k = 1; k < d; k++)
        parts.push(Manifold.cylinder(under, 6.51 / 2, 6.51 / 2, SEG).subtract(Manifold.cylinder(under + 1, 2.4, 2.4, SEG).translate([0, 0, -0.5])).translate([i * P - play, k * P - play, 0]));
  } else if (Math.max(w, d) >= 2) {
    const n = Math.max(w, d);
    for (let i = 1; i < n; i++) parts.push(Manifold.cylinder(under, 1.6, 1.6, SEG).translate(w >= d ? [i * P - play, Y / 2, 0] : [X / 2, i * P - play, 0]));
  }
  body = Manifold.union(parts);
  return onBed(body);
}

export type { V3 };

export interface KitRequest {
  kind: 'junction' | 'crossing' | 'cardboard' | 'bricks';
  joinery: JoineryParams;
  thickness: number;
  data?: import('../types').MethodResult['connectorData'];
  bricks?: { w: number; d: number; plate: boolean; count: number }[];
}

export interface KitPart {
  name: string;
  count: number;
  mesh: import('../types').MeshData;
  ids?: string[];
}

function toMesh(m: ManifoldT): import('../types').MeshData {
  const mesh = m.getMesh();
  const np = mesh.numProp;
  const n = mesh.vertProperties.length / np;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = mesh.vertProperties[i * np];
    pos[i * 3 + 1] = mesh.vertProperties[i * np + 1];
    pos[i * 3 + 2] = mesh.vertProperties[i * np + 2];
  }
  return { positions: pos, indices: new Uint32Array(mesh.triVerts) };
}

/** Build the printable files for a kit request. `limit` caps the number of distinct files (for previews). */
export function buildKit(W: ManifoldToplevel, req: KitRequest, limit = Infinity): KitPart[] {
  const J = req.joinery;
  const out: KitPart[] = [];
  const push = (name: string, count: number, m: ManifoldT, ids?: string[]) => out.length < limit && out.push({ name, count, mesh: toMesh(m), ids });
  switch (req.kind) {
    case 'junction': {
      const list = req.data?.junctions ?? [];
      for (const g of groupJunctions(list, J.junction.dedupe)) {
        if (out.length >= limit) break;
        const i = out.length + 1;
        const style = J.junction.style === 'printable' ? '_nosupport' : J.junction.style === 'flat' ? '_flat' : '';
        push(`junction-hub${style}_${String(i).padStart(3, '0')}_${g.hub.arms.length}-arm${g.count > 1 ? `_x${g.count}` : `_${g.hub.id}`}`, g.count, hubSolid(W, g.hub, J.junction), g.ids);
      }
      break;
    }
    case 'crossing':
      for (const c of req.data?.crossClips ?? []) push(`crossing-clip_${c.angle}deg_t${req.thickness}`, c.count, crossClip(W, c.angle, req.thickness, J.crossing));
      if (req.data?.collars) push(`rod-collar_bore${req.data.collars.bore.toFixed(2)}`, req.data.collars.count, rodCollar(W, req.data.collars.bore, J.crossing));
      break;
    case 'cardboard':
      for (const c of req.data?.seamClips ?? []) push(`cardboard-connector_${c.angle}deg_t${req.thickness}`, c.count, cardboardClip(W, c.angle, req.thickness, J.cardboard));
      break;
    case 'bricks':
      for (const b of req.bricks ?? []) push(`brick_${Math.min(b.w, b.d)}x${Math.max(b.w, b.d)}${b.plate ? '_plate' : ''}`, b.count, legoBrick(W, Math.max(b.w, b.d), Math.min(b.w, b.d), b.plate));
      break;
  }
  return out;
}
