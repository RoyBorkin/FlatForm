/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/** Joinery steps that apply to any method's finished parts. */
import type { JunctionArm, MethodResult, Path2 } from '../types';
import type { ProjectParams } from '../params';
import { LEGO_HOLE } from './holes';
import { makeJunction } from './junction';
import { difference, signedArea } from '../polygon/polygon';
import { partArea } from '../parts';

/** LEGO Technic cross-axle hole (4.8 mm across, 1.8 mm arms), centred on (x, y). */
export function axleHole(x: number, y: number, fit: number): Path2 {
  const a = (LEGO_HOLE + fit) / 2, b = (1.8 + fit) / 2;
  const pts: [number, number][] = [
    [b, b], [a, b], [a, -b], [b, -b], [b, -a], [-b, -a], [-b, -b], [-a, -b], [-a, b], [-b, b], [-b, a], [b, a],
  ];
  return pts.map(([px, py]) => [x + px, y + py]);
}

export function applyJoinery(r: MethodResult, p: ProjectParams): MethodResult {
  const J = p.joinery;
  // Lattice node hubs become junction hubs with a strip channel per arm.
  if (J.kind === 'junction' && r.connectorData?.hubs?.length && !r.connectorData.junctions) {
    const stack = p.material.thickness * Math.max(1, p.lattice.layers.filter((l) => l.enabled).length);
    const w = r.connectorData.hubChannel?.width ?? p.lattice.stripWidth;
    const h = r.connectorData.hubChannel?.height ?? stack;
    const junctions = r.connectorData.hubs.map((hub) => {
      const arms: JunctionArm[] = hub.dirs.map((dir) => ({ dir, up: [0, 0, 1], shape: 'slot', w, h }));
      // Directions are already in the node's frame (z = normal).
      return makeJunction(`N${hub.node}`, [0, 0, 0], [0, 0, 1], arms, J.junction);
    });
    r = { ...r, connectorData: { ...r.connectorData, junctions, pinCount: junctions.length } };
  }
  // LEGO axles lock in cross-shaped holes.
  if (J.kind === 'lego' && J.lego.element === 'axle') {
    const target = (LEGO_HOLE + J.lego.fit) / 2;
    const parts = r.parts.map((part) => {
      const axles = part.holes.filter((h) => Math.abs(h.r - target) < 0.05);
      if (!axles.length) return part;
      const cut = difference(part.cut, axles.map((h) => axleHole(h.x, h.y, J.lego.fit))).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
      return { ...part, cut, holes: part.holes.filter((h) => !axles.includes(h)), area: partArea(cut, []) };
    });
    r = { ...r, parts };
  }
  return r;
}
