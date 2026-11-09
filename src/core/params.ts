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

export type MethodKind = 'lattice' | 'slices' | 'waffle' | 'folded';

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

export interface FoldedParams {
  targetFaces: number;
  strategy: 'flattest' | 'bfs' | 'longest';
  maxIslandFaces: number;
  autoSplit: boolean;
  foldLine: 'score' | 'perforate';
  perforation: { dash: number; gap: number };
  tabs: 'none' | 'glue';
  tabWidth: number; // mm
  numberEdges: boolean;
  textHeight: number;
}

// ---------------------------------------------------------------- joinery

export type JoineryKind = 'screws' | 'printed' | 'none' | 'latches';
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

export interface ProjectParams {
  version: 1;
  name: string;
  units: 'mm' | 'in';
  shape: ShapeParams;
  surface: SurfaceParams;
  method: MethodKind;
  lattice: LatticeParams;
  slices: SlicesParams;
  waffle: WaffleParams;
  folded: FoldedParams;
  joinery: JoineryParams;
  material: MaterialParams;
  sheet: SheetParams;
  nest: NestParams;
  export: ExportParams;
}
