/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import type { JoineryKind, JoineryParams, MethodKind } from '../params';
import { SCREW_PRESETS } from '../presets';

/** Which joinery modes make sense for each method (shown in the UI). */
export const JOINERY_SUPPORT: Record<MethodKind, { kinds: JoineryKind[]; note: string }> = {
  lattice: {
    kinds: ['screws', 'printed', 'junction', 'lego', 'wire', 'none'],
    note: 'Layers are joined at every node: screws, printed pins, a printed junction hub per node, LEGO Technic pins, wire twists or plain holes.',
  },
  slices: {
    kinds: ['screws', 'printed', 'crossing', 'bendtabs', 'lego', 'wire', 'none'],
    note: 'Slices stack on rods. Printed collars clip each slice to its rod; bend tabs hold touching slices without rods.',
  },
  waffle: {
    kinds: ['none', 'crossing', 'printed', 'screws'],
    note: 'Ribs lock together through half-slots. Crossing clips, shaped for each angle, can reinforce them.',
  },
  folded: {
    kinds: ['latches', 'flaticulation', 'fingers', 'cardboard', 'bendtabs', 'junction', 'wire', 'none', 'screws', 'printed', 'lego'],
    note: 'Folds stay attached; cut edges join with latches, finger joints, cardboard connectors, bend tabs, wire, glue tabs, screws or brackets. Junction hubs grip the corners.',
  },
  papercraft: {
    kinds: ['none', 'latches', 'bendtabs', 'junction', 'wire'],
    note: 'Paper models join with glue flaps (None), tab-and-slot latches, bend tabs, corner hubs or thread.',
  },
  minimal: {
    kinds: ['wire', 'latches', 'none', 'screws'],
    note: 'Few large pieces of a flexible material, laced or tied along their seams.',
  },
  flexhinge: {
    kinds: ['wire', 'fingers', 'cardboard', 'bendtabs', 'junction', 'latches', 'screws', 'printed', 'lego', 'none'],
    note: 'Rigid sheet made to bend with living-hinge cuts. Seams join with wire, finger joints, connectors, tabs or screws.',
  },
  layers: {
    kinds: ['screws', 'printed', 'crossing', 'bendtabs', 'lego', 'wire', 'none'],
    note: 'Layers hang on rods, threaded rod or string. Printed spacers (Method step) or collars hold the gaps; bend tabs bridge small gaps.',
  },
  meshlines: {
    kinds: ['junction', 'printed', 'wire', 'screws', 'lego', 'none'],
    note: 'Bars meet at the mesh nodes: a printed junction hub per node, wire through the end holes, bolts or LEGO pins.',
  },
  triangles: {
    kinds: ['wire', 'fingers', 'cardboard', 'junction', 'bendtabs', 'latches', 'screws', 'printed', 'lego', 'none'],
    note: 'Every triangle is a separate panel joined edge to edge, or held at its corners by junction hubs.',
  },
  classic: {
    kinds: ['none', 'crossing', 'printed'],
    note: 'Classic laser-cut models lock together through slots. Crossing clips, shaped for each angle, can reinforce them.',
  },
  sticks: {
    kinds: ['junction', 'wire', 'none'],
    note: 'Sticks meet in printed junction hubs, one per node, each with sockets at that node’s real angles. Or lash or glue them.',
  },
  bricks: {
    kinds: ['none'],
    note: 'LEGO bricks hold together by their studs: no extra joinery.',
  },
  stack: {
    kinds: ['bendtabs', 'screws', 'printed', 'crossing', 'lego', 'cardboard', 'junction', 'latches', 'fingers', 'wire', 'none'],
    note: 'Touching layers join with bend tabs or pins; laminated skins with pins or tabs; nested shells with seam joinery (latches, fingers, cardboard connectors, junction hubs).',
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
    case 'lego':
      return LEGO_HOLE + j.lego.fit;
    case 'none':
    case 'latches':
    case 'fingers':
    case 'flaticulation':
    case 'junction':
    case 'crossing':
    case 'cardboard':
    case 'bendtabs':
      return j.noneHoleDiameter;
  }
}

/** LEGO Technic hole diameter (mm) and stud pitch. */
export const LEGO_HOLE = 4.8;
export const LEGO_PITCH = 8;
