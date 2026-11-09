import type { ProjectParams, SkeletonParams } from './params';
import { MATERIAL_PRESETS } from './presets';

/**
 * The default skeleton echoes the reference table base: three tube ends at
 * the top, three at the floor, joined through two branching nodes per side.
 * Twelve lines, Z is up, units are mm.
 */
export function tableBaseSkeleton(): SkeletonParams {
  const H = 430;
  return {
    blend: 70,
    resolution: 96,
    nodes: [
      { id: 0, p: [-300, 0, H], r: 105, open: true }, // top left
      { id: 1, p: [0, 240, H], r: 105, open: true }, // top back
      { id: 2, p: [300, 0, H], r: 105, open: true }, // top right
      { id: 3, p: [-285, 0, 0], r: 95, open: true }, // floor left
      { id: 4, p: [0, -250, 0], r: 105, open: true }, // floor front
      { id: 5, p: [285, 0, 0], r: 95, open: true }, // floor right
      { id: 6, p: [-290, 10, 285], r: 78, open: false }, // left upper
      { id: 7, p: [-290, -10, 165], r: 78, open: false }, // left lower
      { id: 8, p: [290, 10, 285], r: 78, open: false }, // right upper
      { id: 9, p: [290, -10, 165], r: 78, open: false }, // right lower
      { id: 10, p: [0, 215, 290], r: 82, open: false }, // back node
      { id: 11, p: [0, -225, 140], r: 82, open: false }, // front node
    ],
    edges: [
      { a: 0, b: 6 }, { a: 6, b: 7 }, { a: 7, b: 3 },
      { a: 2, b: 8 }, { a: 8, b: 9 }, { a: 9, b: 5 },
      { a: 1, b: 10 }, { a: 10, b: 6 }, { a: 10, b: 8 },
      { a: 4, b: 11 }, { a: 11, b: 7 }, { a: 11, b: 9 },
    ],
  };
}

export function defaultProject(): ProjectParams {
  return {
    version: 1,
    name: 'Low table base',
    units: 'mm',
    shape: {
      source: 'skeleton',
      skeleton: tableBaseSkeleton(),
      primitive: { kind: 'vase', size: 360, a: 0.55, b: 0.35, c: 0.25, seed: 7, openTop: true, openBottom: true, resolution: 80 },
      meshAsset: null,
      meshName: '',
      importUnits: 'mm',
    },
    surface: {
      scale: [1, 1, 1],
      lockProportions: true,
      rotation: [0, 0, 0],
      dropToFloor: true,
      cutPlanes: [],
      remesh: true,
      targetTriangles: 2000,
      remeshIterations: 5,
      relax: 'minimal',
      relaxIterations: 40,
      relaxStrength: 0.5,
    },
    method: 'lattice',
    lattice: {
      pattern: 'hex',
      layers: [
        { enabled: true, seed: 11, clusters: 120, algorithm: 'kruskal', bias: 0, biasAxis: 'z' },
        { enabled: true, seed: 29, clusters: 120, algorithm: 'kruskal', bias: 0, biasAxis: 'z' },
        { enabled: false, seed: 47, clusters: 90, algorithm: 'backtracker', bias: 0.3, biasAxis: 'z' },
        { enabled: false, seed: 83, clusters: 90, algorithm: 'wilson', bias: 0, biasAxis: 'x' },
      ],
      stripWidth: 9,
      joinStyle: 'round',
      endStyle: 'round',
      stackDirection: 'outward',
      pins: 'all',
      numberHoles: true,
      labelParts: true,
      textHeight: 2.2,
      autoSplit: true,
    },
    slices: {
      axis: 'z',
      spacingMode: 'custom',
      spacing: 18,
      hollow: true,
      wall: 14,
      alignmentHoles: 2,
      registration: true,
      labelParts: true,
      textHeight: 5,
    },
    waffle: {
      plane: 'xy',
      countA: 9,
      countB: 7,
      inset: 0.04,
      slotClearance: 0.15,
      slotLeadIn: 0.6,
      hollow: false,
      frame: 18,
      labelParts: true,
      textHeight: 5,
    },
    folded: {
      targetFaces: 320,
      strategy: 'flattest',
      maxIslandFaces: 60,
      autoSplit: true,
      foldLine: 'score',
      perforation: { dash: 3, gap: 2 },
      tabs: 'glue',
      tabWidth: 8,
      numberEdges: true,
      textHeight: 3,
    },
    joinery: {
      kind: 'screws',
      screw: { preset: 'M2', diameter: 2.4, fit: 'normal' },
      noneHoleDiameter: 2.5,
      printed: {
        connector: 'snapPin',
        clearance: 0.2,
        wall: 1.6,
        pinDiameter: 3,
        headDiameter: 6,
        spacerGap: 4,
        threadPitch: 1.5,
        bore: 2,
        armLength: 14,
      },
      latch: { kind: 'tabSlot', width: 8, depth: 6, clearance: 0.2, perEdge: 0, angle: 30 },
    },
    material: { ...MATERIAL_PRESETS[0] },
    sheet: { width: 1000, height: 500, margin: 8, spacing: 4, kerfCompensation: false },
    nest: { mode: 'tight', rotations: 8, resolution: 2.5, groupByLayer: true },
    export: { dxfLayout: 'perSheet', textAs: 'strokes', svgStroke: 0.1, includeSheetFrame: true },
  };
}
