/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import type { M4, V2, V3 } from './math/vec';

/** Indexed triangle mesh. Units are millimetres everywhere in the core. */
export interface MeshData {
  positions: Float32Array; // xyz per vertex
  indices: Uint32Array; // 3 per triangle
}

export type Path2 = V2[];

export interface Circle2 {
  x: number;
  y: number;
  r: number;
  /** Pin / hole number that is engraved next to it, if any. */
  label?: string;
}

export interface Polyline2 {
  pts: Path2;
  closed?: boolean;
  /** Score lines: mountain or valley fold. Engrave lines: text or mark. */
  kind?: 'mountain' | 'valley' | 'text' | 'mark' | 'registration';
}

/**
 * A flat part, exactly as it will be cut. Coordinates are mm in the part's own
 * frame (origin roughly at its bounding-box corner after normalisation).
 */
export interface Part2D {
  id: string; // e.g. "A012"
  /** Layer / family / group index: lattice layer, waffle family, slice set, panel set. */
  group: number;
  groupName: string;
  /** Closed cut contours. Index 0 is the outer outline; others are inner cut-outs. */
  cut: Path2[];
  holes: Circle2[];
  score: Polyline2[];
  engrave: Polyline2[];
  /** Open cut lines (perforated folds). Cut through, on the cut layer. */
  perforations?: Polyline2[];
  /** Mapping of the flat part into the assembled model, for planar parts. */
  planar?: { matrix: M4 };
  /** Free-form metadata shown in the inspector and parts list. */
  meta?: Record<string, string | number>;
  warnings?: string[];
  area: number; // mm²
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface Placement {
  partId: string;
  sheet: number;
  x: number;
  y: number;
  rot: number; // radians, applied about part origin before translation
}

export interface SheetLayout {
  index: number;
  group: number;
  width: number;
  height: number;
  placements: Placement[];
  utilisation: number; // 0..1
}

export interface NestResult {
  sheets: SheetLayout[];
  unplaced: string[];
}

/** Bent strip segments for 3D preview of the lattice (instanced boxes + discs). */
export interface Strip3D {
  group: number;
  partIndex: number;
  /** Per segment: start xyz, end xyz, normal xyz (9 floats). */
  segments: Float32Array;
  /** Per node disc: centre xyz, normal xyz (6 floats). */
  nodes: Float32Array;
}

export interface Pin3D {
  /** Per pin: centre xyz, axis xyz (6 floats). */
  data: Float32Array;
  length: number;
  radius: number;
}

export interface Assembly3D {
  kind: 'lattice' | 'planar' | 'panels';
  strips?: Strip3D[];
  pins?: Pin3D;
  stripWidth?: number;
  thickness: number;
  /** Folded panels: triangles of each island, flattened xyz, plus island index per triangle. */
  panels?: { positions: Float32Array; island: Uint32Array; normals: Float32Array };
  /** Connector placements in 3D for preview: centre xyz + axis xyz. */
  connectors?: Float32Array;
  /** Printed layer spacers: start xyz, end xyz per spacer (6 floats); size = outer width. */
  spacers?: { data: Float32Array; size: number; shape: 'round' | 'square' | 'hex' | 'star' };
}

export interface MethodResult {
  parts: Part2D[];
  assembly: Assembly3D;
  /** Debug/preview overlays, e.g. clusters and maze lines (3D line segments). */
  overlays: {
    clusters?: { faceCluster: Int32Array; group: number }[];
    graphLines?: Float32Array; // xyz pairs
    treeLines?: { group: number; lines: Float32Array }[];
    /** Guide curve (layers / classic along a curve), as xyz pairs. */
    guide?: Float32Array;
  };
  stats: Record<string, number>;
  warnings: string[];
  /** What the printed connectors need to know about the build. */
  connectorData?: {
    /** Pins / dowels / screws: how many and how long the stack they pass through is. */
    pinCount: number;
    gripLength: number;
    /** Node hubs: arm directions in each node's local frame (z = surface normal). */
    hubs?: { node: number; dirs: V3[] }[];
    /** Angle brackets: inside angle between the two panels, degrees, one per bracket. */
    bracketAngles?: number[];
    /** Waffle crossings that can take a cross clip. */
    crossings?: number;
    /** Layer spacers grouped by length (mm). */
    spacers?: { length: number; count: number }[];
    spacerShape?: 'round' | 'square' | 'hex' | 'star';
    spacerSize?: number;
    spacerBore?: number;
    /** Node hub channel cross-section when it is not a lattice strip stack. */
    hubChannel?: { width: number; height: number };
  };
}

export interface Progress {
  stage: string;
  fraction: number; // 0..1
}

export type { V2, V3, M4 };
