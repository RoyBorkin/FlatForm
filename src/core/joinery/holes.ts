import type { JoineryParams, MethodKind } from '../params';
import { SCREW_PRESETS } from '../presets';

/** Which joinery modes make sense for each method (shown in the UI). */
export const JOINERY_SUPPORT: Record<MethodKind, { kinds: JoineryParams['kind'][]; note: string }> = {
  lattice: {
    kinds: ['screws', 'printed', 'none'],
    note: 'Layers are pinned through a hole at every node. Folding latches need edges between panels, so they are off for lattices.',
  },
  slices: {
    kinds: ['screws', 'printed', 'none'],
    note: 'Slices stack on alignment dowels. Holes go through every slice.',
  },
  waffle: {
    kinds: ['none', 'printed', 'screws'],
    note: 'Ribs lock together through half-slots. Printed clips or screw brackets can reinforce the crossings.',
  },
  folded: {
    kinds: ['latches', 'none', 'screws', 'printed'],
    note: 'Cut edges join with integral latches, glue tabs, screws or printed angle brackets.',
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
    case 'none':
      return j.noneHoleDiameter;
    case 'printed': {
      const p = j.printed;
      if (p.connector === 'hollowScrew') return p.pinDiameter + 2 * p.clearance + 0.6; // thread crest clearance
      return p.pinDiameter + 2 * p.clearance;
    }
    case 'latches':
      return j.noneHoleDiameter;
  }
}
