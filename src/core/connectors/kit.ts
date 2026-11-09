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

/** Junction hubs grouped into one file per distinct shape. */
export function junctionParts(W: ManifoldToplevel, list: Junction[], j: JoineryParams['junction']) {
  return groupJunctions(list, j.dedupe).map((g, i) => ({
    name: `junction-hub_${String(i + 1).padStart(3, '0')}_${g.hub.arms.length}arm${g.count > 1 ? `_x${g.count}` : `_${g.hub.id}`}`,
    count: g.count,
    ids: g.ids,
    mesh: junctionHub(W, g.hub, j),
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
        push(`junction-hub_${String(i).padStart(3, '0')}_${g.hub.arms.length}-arm${g.count > 1 ? `_x${g.count}` : `_${g.hub.id}`}`, g.count, junctionHub(W, g.hub, J.junction), g.ids);
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
