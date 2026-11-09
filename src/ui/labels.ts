/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/** Display names for methods and joinery, shared by the rail, panels and exports. */
import type { JoineryKind, MethodKind, Process } from '@/core/params';

export interface MethodInfo {
  id: MethodKind;
  title: string;
  text: string;
  family: 'Surface' | 'Sections' | 'Folded' | 'Frames';
}

export const METHODS: MethodInfo[] = [
  { id: 'lattice', title: 'Branching lattice', text: 'Maze strips in layers, pinned at every node. Bends to any curve.', family: 'Surface' },
  { id: 'meshlines', title: 'Mesh lines', text: 'Every mesh edge is a flat bar, joined at the nodes.', family: 'Frames' },
  { id: 'triangles', title: 'Triangles', text: 'A few repeated triangle shapes, relaxed to fit the surface.', family: 'Frames' },
  { id: 'slices', title: 'Stacked slices', text: 'Contours stacked on dowels. Solid look, any thick sheet.', family: 'Sections' },
  { id: 'layers', title: 'Layers', text: 'Spaced layers in any direction or along a curve, on rods and printed spacers.', family: 'Sections' },
  { id: 'waffle', title: 'Interlocking waffle', text: 'Two rib families that slot together. No hardware.', family: 'Sections' },
  { id: 'classic', title: 'Classic slot model', text: 'Profiles that slot together: grid, revolved or along a curve.', family: 'Sections' },
  { id: 'folded', title: 'Folded panels', text: 'Unfolded facets that fold and latch back into shape.', family: 'Folded' },
  { id: 'papercraft', title: 'Paper-craft', text: 'Pepakura-style pieces with glue flaps and numbered edges.', family: 'Folded' },
  { id: 'minimal', title: 'Minimal joinery', text: 'A few large pieces of felt, fabric or plastic, laced together.', family: 'Folded' },
  { id: 'flexhinge', title: 'Flex hinges', text: 'Few rigid pieces that bend on laser-cut living hinges.', family: 'Folded' },
];

export const METHOD_NAME = Object.fromEntries(METHODS.map((m) => [m.id, m.title])) as Record<MethodKind, string>;

export const JOIN_LABEL: Record<JoineryKind, string> = {
  screws: 'Screws',
  printed: 'Printed',
  none: 'None',
  latches: 'Latches',
  wire: 'Wire & lacing',
  fingers: 'Finger joints',
  flaticulation: 'Flaticulation',
};

export const JOIN_TEXT: Record<JoineryKind, string> = {
  screws: 'Clearance holes for screws, bolts or rivets.',
  printed: 'Parametric 3D-printed pins, hubs, spacers and brackets.',
  none: 'Holes only, or glue tabs where a method has them.',
  latches: 'Tabs and slots cut into the parts. No hardware.',
  wire: 'Holes or slots for wire, string, fabric strip, rubber bands or zip ties.',
  fingers: 'Box joints along every seam. Unique patterns make them fool-proof.',
  flaticulation: 'Cut-in-place hinges that snap to the fold angle (UIST ’22).',
};

export const PROCESS_LABEL: Record<Process, string> = { laser: 'Laser cut', print3d: '3D print', cnc: 'CNC' };
