/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import type { JoineryKind, JoineryParams, MethodKind } from '../params';
import { SCREW_PRESETS } from '../presets';

/** Which joinery modes make sense for each method (shown in the UI). */
export const JOINERY_SUPPORT: Record<MethodKind, { kinds: JoineryKind[]; note: string }> = {
  lattice: {
    kinds: ['screws', 'printed', 'wire', 'none'],
    note: 'Layers are joined through a hole at every node: screws, printed pins, wire twists or plain holes.',
  },
  slices: {
    kinds: ['screws', 'printed', 'wire', 'none'],
    note: 'Slices stack on alignment rods. The holes go through every slice; wire or string can thread them too.',
  },
  waffle: {
    kinds: ['none', 'printed', 'screws'],
    note: 'Ribs lock together through half-slots. Printed clips or screw brackets can reinforce the crossings.',
  },
  folded: {
    kinds: ['latches', 'flaticulation', 'fingers', 'wire', 'none', 'screws', 'printed'],
    note: 'Folds stay attached; cut edges join with latches, finger joints, wire, glue tabs, screws or printed brackets. Flaticulation turns every fold into a cut-in-place joint that clutches at its exact angle.',
  },
  papercraft: {
    kinds: ['none', 'latches', 'wire'],
    note: 'Paper models join with glue flaps (None), paper tab-and-slot latches, or thread.',
  },
  minimal: {
    kinds: ['wire', 'latches', 'none', 'screws'],
    note: 'Few large pieces of a flexible material, laced or tied along their seams.',
  },
  flexhinge: {
    kinds: ['wire', 'fingers', 'latches', 'screws', 'printed', 'none'],
    note: 'Rigid sheet made to bend with living-hinge cuts. Seams join with wire, finger joints, latches or screws.',
  },
  layers: {
    kinds: ['screws', 'printed', 'wire', 'none'],
    note: 'Layers hang on rods, threaded rod or string. Printed spacers (Method step) hold the gaps between them.',
  },
  meshlines: {
    kinds: ['printed', 'wire', 'screws', 'none'],
    note: 'Bars meet at the mesh nodes: printed node hubs, wire through the end holes, or bolts.',
  },
  triangles: {
    kinds: ['wire', 'fingers', 'screws', 'printed', 'latches', 'none'],
    note: 'Every triangle is a separate panel joined edge to edge.',
  },
  classic: {
    kinds: ['none', 'printed'],
    note: 'Classic laser-cut models lock together through slots. Printed cross clips can reinforce crossings.',
  },
};

export function screwHole(j: JoineryParams): number {
  const p = SCREW_PRESETS.find((s) => s.id === j.screw.preset);
  if (!p || p.id === 'custom') return j.screw.diameter;
  return p[j.screw.fit];
}

/** Hole diameter used where parts are pinned or bolted together (mm). 0 = no hole. */
export function pinHoleDiameter(j: JoineryParams): number {
  switch (j.kind) {
    case 'screws':
      return screwHole(j);
    case 'printed': {
      const p = j.printed;
      if (p.connector === 'hollowScrew') return p.pinDiameter + 2 * p.clearance + 0.6; // thread crest clearance
      return p.pinDiameter + 2 * p.clearance;
    }
    case 'wire':
      return j.wire.holeDiameter;
    case 'none':
    case 'latches':
    case 'fingers':
    case 'flaticulation':
      return j.noneHoleDiameter;
  }
}
