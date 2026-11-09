/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/** Joinery steps that apply to any method's finished parts. */
import type { JunctionArm, MethodResult, Path2 } from '../types';
import type { ProjectParams } from '../params';
import { LEGO_HOLE } from './holes';
import { makeJunction } from './junction';
import { difference, signedArea } from '../polygon/polygon';
import { normalizePart, partArea } from '../parts';
import { flatHub } from './flatHub';
import { textPolylines } from '../text/hershey';

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
  // Flat junction hubs can be cut from the sheet with the rest of the parts.
  const hubs = r.connectorData?.junctions;
  if (J.kind === 'junction' && J.junction.style === 'flat' && hubs?.length) {
    const group = r.parts.reduce((g, q) => Math.max(g, q.group + 1), 0);
    let maxTwist = 0;
    const flat = hubs.map((h) => {
      const fh = flatHub(h, J.junction);
      maxTwist = Math.max(maxTwist, fh.maxTwist);
      return { h, fh };
    });
    if (J.junction.flatOnSheet) {
      const extra = flat.map(({ h, fh }) => {
        const slots = fh.arms.flatMap((a) => a.slots);
        const cut = slots.length ? difference(fh.outline, slots) : fh.outline;
        const score = fh.arms.filter((a) => Math.abs(a.angle) >= 0.5).map((a) => ({ pts: a.bend, kind: a.angle > 0 ? ('valley' as const) : ('mountain' as const) }));
        const th = Math.min(4, fh.rb * 0.5);
        const engrave = th > 0.8 ? textPolylines(h.id, 0, 0, th, 0) : [];
        // Bend angles, engraved beside each bend line.
        for (const a of fh.arms) {
          if (Math.abs(a.angle) < 0.5) continue;
          const lbl = `${Math.round(Math.abs(a.angle))}`;
          const q = a.start + 2.2 * th;
          const ang = Math.atan2(a.dir[1], a.dir[0]);
          engrave.push(...textPolylines(lbl, a.dir[0] * q, a.dir[1] * q, th * 0.7, Math.abs(ang) > Math.PI / 2 ? ang + Math.PI : ang));
        }
        return normalizePart({
          id: `H${h.id}`,
          group,
          groupName: 'Hubs',
          cut,
          holes: fh.arms.flatMap((a) => a.holes),
          score,
          engrave,
          meta: { hub: h.id, arms: h.arms.length, bends: fh.arms.map((a) => `${a.angle >= 0 ? '+' : ''}${a.angle.toFixed(0)}°`).join(' ') },
        });
      });
      r = { ...r, parts: [...r.parts, ...extra] };
      if (p.material.minBendRadius === 0) r = { ...r, warnings: [...r.warnings, `${p.material.name} does not bend: flat hubs cut from it will crack. Use metal, polypropylene or card, or print them.`] };
    }
    if (maxTwist > 20) r = { ...r, warnings: [...r.warnings, `Some flat hub arms meet their member at up to ${Math.round(maxTwist)}° of twist; they need a little coaxing to sit flat.`] };
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
