/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * The project file. Everything the user can control lives here, is plain JSON,
 * and is the single input to the geometry pipeline. Undo/redo snapshots this.
 */

import type { V3 } from './math/vec';

// ---------------------------------------------------------------- shape

export interface SkeletonNode {
  id: number;
  p: V3; // mm
  r: number; // tube radius at this node, mm
  /** Leaf nodes: leave the tube end open (cut flat at the node). */
  open: boolean;
}
export interface SkeletonEdge {
  a: number;
  b: number;
}
export interface SkeletonParams {
  nodes: SkeletonNode[];
  edges: SkeletonEdge[];
  blend: number; // smooth-union radius, mm
  resolution: number; // marching-cubes cells along the longest axis
}

export type PrimitiveKind =
  | 'sphere'
  | 'torus'
  | 'roundedBox'
  | 'capsule'
  | 'vase'
  | 'blob'
  | 'twistedTower'
  | 'saddle'
  | 'lampshade'
  | 'knot';

export interface PrimitiveParams {
  kind: PrimitiveKind;
  size: number; // overall characteristic size, mm
  a: number; // shape-specific parameter 0..1
  b: number; // shape-specific parameter 0..1
  c: number; // shape-specific parameter 0..1
  seed: number;
  openTop: boolean;
  openBottom: boolean;
  resolution: number;
}

export type ImportUnits = 'mm' | 'cm' | 'm' | 'in';

export interface ShapeParams {
  source: 'skeleton' | 'primitive' | 'mesh';
  skeleton: SkeletonParams;
  primitive: PrimitiveParams;
  /** For source 'mesh': key into the asset store (imported or sculpted mesh). */
  meshAsset: string | null;
  meshName: string;
  importUnits: ImportUnits;
}

// ---------------------------------------------------------------- surface

export interface CutPlane {
  id: number;
  axis: 'x' | 'y' | 'z' | '-x' | '-y' | '-z';
  offset: number; // 0..1 along the bounding box in that axis
  enabled: boolean;
}

export interface SurfaceParams {
  /** Scale multipliers applied to the source shape (the UI edits these through W/D/H in mm). */
  scale: V3;
  lockProportions: boolean;
  rotation: V3; // degrees
  dropToFloor: boolean;
  cutPlanes: CutPlane[];
  remesh: boolean;
  /** Target triangle count for the working surface (drives edge length). */
  targetTriangles: number;
  remeshIterations: number;
  relax: 'off' | 'minimal' | 'smooth';
  relaxIterations: number;
  relaxStrength: number; // 0..1
}

// ---------------------------------------------------------------- methods

export type MethodKind =
  | 'lattice'
  | 'slices'
  | 'waffle'
  | 'folded'
  | 'papercraft'
  | 'minimal'
  | 'flexhinge'
  | 'layers'
  | 'meshlines'
  | 'triangles'
  | 'classic'
  | 'sticks'
  | 'bricks'
  | 'stack';

// ---------------------------------------------------------------- sticks

/** Bought stock (round, square or tube) or laser-cut flat strips. */
export type StickProfile = 'round' | 'square' | 'tube' | 'flat';

export interface SticksParams {
  /** Faces of the remeshed surface; 0 keeps the surface mesh. */
  targetFaces: number;
  profile: StickProfile;
  preset: string;
  /** Diameter (round, tube), side (square) or strip width (flat), mm. */
  size: number;
  /** Tube inner diameter, mm. */
  inner: number;
  /** Length of one bought stick, for the shopping count (mm). */
  stockLength: number;
  /** Cut lengths are rounded to this, so equal sticks can be cut together (mm). */
  lengthStep: number;
  labelSticks: boolean;
  textHeight: number;
}

// ---------------------------------------------------------------- LEGO bricks

export type BrickSize = '1x1' | '1x2' | '1x3' | '1x4' | '1x6' | '1x8' | '2x2' | '2x3' | '2x4' | '2x6' | '2x8';

export interface BricksParams {
  /** Build in full bricks (9.6 mm) or plates (3.2 mm). */
  unit: 'brick' | 'plate';
  hollow: boolean;
  /** Wall thickness of a hollow build, in studs. */
  shell: number;
  sizes: BrickSize[];
  /** Alternate brick direction every layer so joints overlap, like a brick wall. */
  stagger: boolean;
  colorMode: 'single' | 'layers' | 'height';
  /** LDraw colour codes. */
  color: number;
  palette: number[];
}

// ---------------------------------------------------------------- stacked layers

export type StackMode = 'laminate' | 'shells' | 'relief' | 'solid';

export interface StackParams {
  mode: StackMode;
  /** Layers (laminate, relief, solid) or shells. */
  count: number;
  /** Direction for relief and solid stacks. */
  azimuth: number;
  elevation: number;
  // laminated skins
  targetFaces: number;
  pieces: number;
  seed: number;
  /** Pins through every layer of a laminate, this far apart (mm). */
  pinSpacing: number;
  // nested shells
  shellGap: number;
  // relief
  backing: boolean;
  margin: number;
  /** Depth mapping exponent: 1 = even, >1 more layers at the front. */
  depthCurve: number;
  // solid / relief
  /** Rods through the stack (when the joinery uses holes). */
  rods: number;
  registration: boolean;
  labelParts: boolean;
  textHeight: number;
}

/**
 * A planar guide curve, drawn in one of the three main planes. Control points
 * are normalised (0..1) to the shape's bounding box in that plane, so the
 * curve follows the shape when it is resized.
 */
export interface CurveParams {
  plane: 'xz' | 'yz' | 'xy';
  preset: 'straight' | 'arc' | 's' | 'custom';
  points: [number, number][];
}

export type LatticePattern = 'hex' | 'tri' | 'quad' | 'kis';
export type TreeAlgorithm = 'kruskal' | 'prim' | 'backtracker' | 'wilson' | 'radial';

export interface LatticeLayer {
  enabled: boolean;
  seed: number;
  clusters: number;
  algorithm: TreeAlgorithm;
  /** 0..1 preference for edges aligned with biasAxis. */
  bias: number;
  biasAxis: 'x' | 'y' | 'z';
}

export interface LatticeParams {
  pattern: LatticePattern;
  layers: LatticeLayer[];
  stripWidth: number; // mm
  joinStyle: 'round' | 'miter';
  endStyle: 'round' | 'square';
  stackDirection: 'outward' | 'inward';
  pins: 'all' | 'junctions' | 'alternate';
  numberHoles: boolean;
  labelParts: boolean;
  textHeight: number; // mm
  autoSplit: boolean;
}

export interface SlicesParams {
  axis: 'x' | 'y' | 'z';
  spacingMode: 'thickness' | 'custom';
  spacing: number; // mm, when custom
  hollow: boolean;
  wall: number; // mm
  alignmentHoles: number; // 0..4 dowels
  registration: boolean; // engrave next slice outline
  labelParts: boolean;
  textHeight: number;
}

export interface WaffleParams {
  plane: 'xy' | 'xz' | 'yz'; // which two rib families; slots run along the third axis
  countA: number;
  countB: number;
  inset: number; // 0..0.45 keeps outer ribs away from the silhouette
  slotClearance: number; // mm added to material thickness
  slotLeadIn: number; // mm chamfer at slot mouth
  hollow: boolean;
  frame: number; // mm rib frame width when hollow
  labelParts: boolean;
  textHeight: number;
}

/** Living-hinge patterns (see core/joinery/hinges.ts). */
export type HingePattern = 'straight' | 'rectangles' | 'obround' | 'bones' | 'wave' | 'zigzag' | 'chevron' | 'serpentine' | 'diamond' | 'hexagon' | 'cross' | 'triangles';

export interface HingeParams {
  pattern: HingePattern;
  cutLength: number; // mm, length of each cut along the bend axis
  bridge: number; // mm, uncut material between cuts in a row
  spacing: number; // mm, distance between rows
  slotWidth: number; // mm, width of cut-out patterns (rectangles, slots, lattice…)
}

/** Bend-relief patterns along a fold line. */
export type ReliefPattern = 'slots' | 'wave' | 'obround' | 'holes' | 'staggered' | 'bones';

export interface BendReliefParams {
  pattern: ReliefPattern;
  width: number; // slot width, × sheet thickness
  tab: number; // tab width, × sheet thickness (at least 1)
  slotLength: number; // mm, target slot length (the count follows the fold length)
  endRelief: 'none' | 'round' | 'square';
}

export interface FoldedParams {
  targetFaces: number;
  strategy: 'flattest' | 'bfs' | 'longest';
  maxIslandFaces: number;
  autoSplit: boolean;
  foldLine: 'score' | 'perforate' | 'relief' | 'hinge';
  perforation: { dash: number; gap: number };
  relief: BendReliefParams;
  hinge: HingeParams & { bendRadius: number; minAngle: number };
  tabs: 'none' | 'glue';
  tabWidth: number; // mm
  numberEdges: boolean;
  textHeight: number;
}

export interface PapercraftParams {
  targetFaces: number;
  strategy: 'flattest' | 'bfs' | 'longest';
  maxPieceFaces: number;
  autoSplit: boolean;
  flaps: 'alternate' | 'oneSide' | 'both' | 'none';
  flapShape: 'trapezoid' | 'rounded' | 'triangle';
  flapWidth: number; // mm
  flapAngle: number; // degrees, shoulder angle of trapezoid flaps
  foldStyle: 'lines' | 'none';
  flatThreshold: number; // degrees: folds flatter than this get no line
  edgeNumbers: boolean;
  pieceLabels: boolean;
  textHeight: number;
}

export interface MinimalParams {
  targetFaces: number;
  pieces: number; // target number of large pieces
  seed: number;
  autoSplit: boolean;
  numberSeams: boolean;
  seamMarks: boolean; // alignment ticks across seams
  textHeight: number;
}

export interface FlexHingeParams extends MinimalParams, HingeParams {
  /** One cut direction per piece, or each band following its own fold (curved bending). */
  align: 'piece' | 'fold';
  minAngle: number; // degrees: folds sharper than this get a hinge
  bendRadius: number; // mm: band width = fold angle × radius
}

export interface LayersParams {
  mode: 'direction' | 'curve';
  azimuth: number; // degrees, around Z
  elevation: number; // degrees, from the XY plane
  curve: CurveParams;
  pitch: number; // mm, centre-to-centre layer spacing
  hollow: boolean;
  wall: number; // mm
  rods: number; // 0..4 alignment rods / spacer stacks
  registration: boolean;
  labelParts: boolean;
  textHeight: number;
  spacer: {
    enabled: boolean;
    shape: 'round' | 'square' | 'hex' | 'star';
    size: number; // mm, outer size
  };
}

export interface MeshLinesParams {
  targetFaces: number; // 0 = use the working surface as is
  barWidth: number; // mm
  orientation: 'flat' | 'radial';
  endStyle: 'round' | 'square';
  nodeClearance: number; // mm cut back from each node
  lengthStep: number; // mm, bars are grouped by length rounded to this
  labelBars: boolean;
  textHeight: number;
}

export interface TrianglesParams {
  targetFaces: number;
  lengthClasses: number; // how many distinct edge lengths
  iterations: number;
  style: 'panel' | 'frame';
  frameWidth: number; // mm
  gap: number; // mm between neighbouring panels
  cornerTrim: number; // mm
  labelParts: boolean;
  textHeight: number;
}

export interface ClassicParams {
  style: 'grid' | 'revolve' | 'curve';
  grid: { plane: 'xy' | 'xz' | 'yz'; countA: number; countB: number; rotate: number; inset: number };
  revolve: { profiles: number; rings: number; inset: number; twist: number };
  curve: { curve: CurveParams; ribs: number; spines: number; spineGap: number; inset: number };
  hollow: boolean;
  frame: number; // mm
  slotClearance: number;
  slotLeadIn: number;
  labelParts: boolean;
  textHeight: number;
}

// ---------------------------------------------------------------- joinery

export type JoineryKind = 'screws' | 'printed' | 'none' | 'latches' | 'wire' | 'fingers' | 'flaticulation' | 'junction' | 'crossing' | 'cardboard' | 'lego' | 'bendtabs';
export type ConnectorKind = 'nodeHub' | 'snapPin' | 'angleBracket' | 'spacer' | 'hollowScrew';
export type LatchKind = 'tabSlot' | 'arrow' | 'hook' | 'puzzle';

export interface JoineryParams {
  kind: JoineryKind;
  screw: { preset: string; diameter: number; fit: 'close' | 'normal' | 'loose' };
  noneHoleDiameter: number;
  printed: {
    connector: ConnectorKind;
    clearance: number; // mm, print tolerance
    wall: number; // mm
    pinDiameter: number; // mm
    headDiameter: number; // mm
    spacerGap: number; // mm
    threadPitch: number; // mm
    bore: number; // mm, open centre of the hollow screw
    armLength: number; // mm, node hub arms / bracket flanges
  };
  latch: {
    kind: LatchKind;
    width: number; // mm
    depth: number; // mm
    clearance: number; // mm
    perEdge: number; // latches per cut edge (0 = auto)
    angle: number; // degrees, arrow / dovetail flare
  };
  /** Wire, string, fabric, rubber band or zip-tie lacing through holes along seams. */
  wire: {
    preset: 'metal' | 'string' | 'fabric' | 'rubber' | 'zip';
    stitch: 'running' | 'cross' | 'whip' | 'notch';
    holeDiameter: number; // mm
    slotLength: number; // mm, 0 = round holes
    pitch: number; // mm between stitches
    edgeOffset: number; // mm from the seam
  };
  /** Classic finger (box) joints, with FoolProofJoint-style patterns. */
  fingers: {
    width: number; // mm target finger width
    pattern: 'classic' | 'unique' | 'symmetric';
    depthMode: 'auto' | 'custom';
    depth: number; // mm when custom
    clearance: number; // mm, per side
  };
  /** Flaticulation T-patterns: pieces cut in place that clutch at their fold angle. */
  flaticulation: {
    joint: 'articulated' | 'detent';
    kerfOffset: number; // K, mm
    kerfAngle: number; // α, degrees
    neckWidth: number; // mm
    headWidth: number; // mm
    occupancy: number; // 0..1 of each edge filled with patterns
    stiffness: number; // 0..1 multiplier on X_ext (detent strength)
    breakTab: number; // mm, breakaway bridges along the cut edge (0 = none)
  };
  /** Printed hubs, one per junction, with a socket for every member that meets there. */
  junction: {
    socketDepth: number; // mm
    wall: number; // mm
    clearance: number; // mm, per side
    core: number; // mm, extra hub radius
    dedupe: boolean; // share one file between junctions with the same angles
    /**
     * solid: one piece with round core and sleeves (may need supports);
     * printable: one piece that prints without supports: every sleeve stands on a 45° fin down to the bed, round sockets are 45° diamonds, panel corners rest on shelves (screwed or glued);
     * flat: a thin star-shaped plate whose arms bend along marked lines to each member's angle (printed flexible, or cut from sheet).
     */
    style: 'solid' | 'printable' | 'flat';
    flatThickness: number; // mm, flat hubs: plate thickness when printed
    flatHinge: number; // mm, flat hubs: material left at each bend groove
    flatTab: number; // mm, flat hubs: arm length past the bend
    flatHole: number; // mm, flat and printable hubs: screw/rivet hole where a panel is held (0 = glue)
    flatOnSheet: boolean; // flat hubs: also cut them from the sheet with the parts
  };
  /** Printed clips where parts cross (ribs) or a rod passes through a layer. */
  crossing: {
    size: number; // mm, clip reach from the crossing
    depth: number; // mm, slot depth
    wall: number; // mm
    clearance: number; // mm
  };
  /** Printed channel connectors that grip two sheet edges at their angle (cardboard system). */
  cardboard: {
    length: number; // mm along the seam
    depth: number; // mm the sheet sits in the channel
    wall: number; // mm
    clearance: number; // mm, total slot play (negative = press fit)
    pitch: number; // mm between connectors on a long seam
  };
  /** Real LEGO Technic pins or axles through holes on the 8 mm grid. */
  lego: {
    element: 'pin' | 'axle';
    fit: number; // mm added to 4.8 mm
    pitch: number; // studs between holes along a seam
  };
  /** Tabs that pass through a slot in the next layer or panel and are bent over. */
  bendtabs: {
    width: number; // mm
    fold: number; // mm folded flat under the other layer
    bendRadius: number; // mm
    pitch: number; // mm between tabs
    clearance: number; // mm slot play
  };
}

// ---------------------------------------------------------------- manufacturing

export type Process = 'laser' | 'print3d' | 'cnc';

export interface ManufacturingParams {
  process: Process;
  laser: { passes: number; engraveSpeed: number; bridges: number; bridgeWidth: number };
  cnc: { toolDiameter: number; dogbones: boolean; dogboneStyle: 'dogbone' | 'tbone'; tabs: number; tabWidth: number; feed: number; depthPerPass: number };
  print: { material: 'PLA' | 'PETG' | 'ABS' | 'TPU'; density: number; layerHeight: number; nozzle: number; infill: number; speed: number; bed: string; bedW: number; bedH: number; brim: number };
}

// ---------------------------------------------------------------- material & sheet

export interface MaterialParams {
  preset: string;
  name: string;
  thickness: number; // mm
  kerf: number; // mm
  minBendRadius: number; // mm, 0 = not bendable
  pricePerSheet: number;
  cutSpeed: number; // mm/s, for time estimates
  look: 'plywood' | 'mdf' | 'metal' | 'acrylic' | 'card' | 'paper' | 'plastic' | 'felt';
  color: string;
  density: number; // kg/m³, for weight
}

export interface SheetParams {
  width: number;
  height: number;
  margin: number;
  spacing: number;
  kerfCompensation: boolean;
}

export interface NestParams {
  mode: 'fast' | 'tight';
  rotations: 1 | 2 | 4 | 8 | 16;
  resolution: number; // mm per raster cell in tight mode
  groupByLayer: boolean;
}

// ---------------------------------------------------------------- export

export interface ExportParams {
  dxfLayout: 'perSheet' | 'allSheets';
  textAs: 'strokes' | 'dxfText';
  svgStroke: number;
  includeSheetFrame: boolean;
}

export type Units = 'mm' | 'cm' | 'm' | 'in';

export interface ProjectParams {
  version: 1;
  name: string;
  units: Units;
  shape: ShapeParams;
  surface: SurfaceParams;
  method: MethodKind;
  lattice: LatticeParams;
  slices: SlicesParams;
  waffle: WaffleParams;
  folded: FoldedParams;
  papercraft: PapercraftParams;
  minimal: MinimalParams;
  flexhinge: FlexHingeParams;
  layers: LayersParams;
  meshlines: MeshLinesParams;
  triangles: TrianglesParams;
  classic: ClassicParams;
  sticks: SticksParams;
  bricks: BricksParams;
  stack: StackParams;
  joinery: JoineryParams;
  manufacturing: ManufacturingParams;
  material: MaterialParams;
  sheet: SheetParams;
  nest: NestParams;
  export: ExportParams;
}
