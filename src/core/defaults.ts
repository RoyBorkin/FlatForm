/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import type { CurveParams, ProjectParams, SkeletonParams } from './params';
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

export const CURVE_PRESETS: Record<Exclude<CurveParams['preset'], 'custom'>, [number, number][]> = {
  straight: [
    [0.5, 0],
    [0.5, 1],
  ],
  arc: [
    [0.15, 0],
    [0.42, 0.45],
    [0.5, 1],
  ],
  s: [
    [0.3, 0],
    [0.7, 0.33],
    [0.3, 0.66],
    [0.6, 1],
  ],
};

export function defaultCurve(preset: Exclude<CurveParams['preset'], 'custom'> = 'arc', plane: CurveParams['plane'] = 'xz'): CurveParams {
  return { plane, preset, points: CURVE_PRESETS[preset].map((p) => [p[0], p[1]] as [number, number]) };
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
    papercraft: {
      targetFaces: 260,
      strategy: 'flattest',
      maxPieceFaces: 80,
      autoSplit: true,
      flaps: 'alternate',
      flapShape: 'trapezoid',
      flapWidth: 7,
      flapAngle: 45,
      foldStyle: 'lines',
      flatThreshold: 2,
      edgeNumbers: true,
      pieceLabels: true,
      textHeight: 3,
    },
    minimal: { targetFaces: 900, pieces: 6, seed: 3, autoSplit: true, numberSeams: true, seamMarks: true, textHeight: 4 },
    flexhinge: {
      targetFaces: 700,
      pieces: 8,
      seed: 5,
      autoSplit: true,
      numberSeams: true,
      seamMarks: true,
      textHeight: 4,
      pattern: 'straight',
      cutLength: 18,
      bridge: 3,
      spacing: 1.6,
      minAngle: 4,
      bendRadius: 14,
    },
    layers: {
      mode: 'direction',
      azimuth: 0,
      elevation: 90,
      curve: defaultCurve('arc', 'xz'),
      pitch: 14,
      hollow: true,
      wall: 16,
      rods: 2,
      registration: true,
      labelParts: true,
      textHeight: 5,
      spacer: { enabled: true, shape: 'hex', size: 12 },
    },
    meshlines: { targetFaces: 500, barWidth: 10, orientation: 'radial', endStyle: 'round', nodeClearance: 3, lengthStep: 1, labelBars: true, textHeight: 3 },
    triangles: { targetFaces: 240, lengthClasses: 3, iterations: 400, style: 'frame', frameWidth: 12, gap: 1, cornerTrim: 4, labelParts: true, textHeight: 4 },
    classic: {
      style: 'revolve',
      grid: { plane: 'xy', countA: 7, countB: 5, rotate: 0, inset: 0.05 },
      revolve: { profiles: 2, rings: 6, inset: 0.06, twist: 0 },
      curve: { curve: defaultCurve('arc', 'xz'), ribs: 14, spines: 1, spineGap: 40, inset: 0.03 },
      hollow: false,
      frame: 18,
      slotClearance: 0.15,
      slotLeadIn: 0.6,
      labelParts: true,
      textHeight: 5,
    },
    sticks: { targetFaces: 300, profile: 'round', preset: 'dowel6', size: 6, inner: 4, stockLength: 1000, lengthStep: 1, labelSticks: true, textHeight: 3 },
    bricks: { unit: 'brick', hollow: true, shell: 2, sizes: ['1x1', '1x2', '1x3', '1x4', '1x6', '1x8', '2x2', '2x3', '2x4', '2x6', '2x8'], stagger: true, colorMode: 'layers', color: 4, palette: [4, 191, 72] },
    stack: {
      mode: 'relief',
      count: 12,
      azimuth: -90,
      elevation: 0,
      targetFaces: 900,
      pieces: 6,
      seed: 3,
      pinSpacing: 60,
      shellGap: 12,
      backing: true,
      margin: 12,
      depthCurve: 1,
      rods: 2,
      registration: true,
      labelParts: true,
      textHeight: 5,
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
      wire: { preset: 'string', stitch: 'cross', holeDiameter: 2.5, slotLength: 0, pitch: 12, edgeOffset: 5 },
      fingers: { width: 10, pattern: 'classic', depthMode: 'auto', depth: 3, clearance: 0.1 },
      flaticulation: { joint: 'articulated', kerfOffset: 0.12, kerfAngle: 2.1, neckWidth: 2.2, headWidth: 6, occupancy: 0.55, stiffness: 0.5, breakTab: 0.6 },
      junction: { socketDepth: 12, wall: 1.6, clearance: 0.15, core: 1, dedupe: true },
      crossing: { size: 14, depth: 10, wall: 1.6, clearance: 0.2 },
      cardboard: { length: 24, depth: 10, wall: 1.6, clearance: 0.1, pitch: 120 },
      lego: { element: 'pin', fit: 0.1, pitch: 3 },
      bendtabs: { width: 8, fold: 6, bendRadius: 0.5, pitch: 70, clearance: 0.2 },
    },
    manufacturing: {
      process: 'laser',
      laser: { passes: 1, engraveSpeed: 250, bridges: 0, bridgeWidth: 0.4 },
      cnc: { toolDiameter: 3.175, dogbones: true, dogboneStyle: 'dogbone', tabs: 3, tabWidth: 5, feed: 1500, depthPerPass: 1.5 },
      print: { material: 'PLA', density: 1.24, layerHeight: 0.2, nozzle: 0.4, infill: 0.2, speed: 12, bed: 'mk4', bedW: 250, bedH: 210, brim: 0 },
    },
    material: { ...MATERIAL_PRESETS[0] },
    sheet: { width: 1000, height: 500, margin: 8, spacing: 4, kerfCompensation: false },
    nest: { mode: 'tight', rotations: 8, resolution: 2.5, groupByLayer: true },
    export: { dxfLayout: 'perSheet', textAs: 'strokes', svgStroke: 0.1, includeSheetFrame: true },
  };
}

/** Fill anything missing from an older saved project with today's defaults (deep, arrays kept as saved). */
export function withDefaults(saved: Partial<ProjectParams>): ProjectParams {
  const merge = (d: unknown, s: unknown): unknown => {
    if (s === undefined || s === null) return d;
    if (Array.isArray(d) || Array.isArray(s) || typeof d !== 'object' || typeof s !== 'object' || d === null) return s;
    const out: Record<string, unknown> = { ...(d as Record<string, unknown>) };
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) out[k] = merge((d as Record<string, unknown>)[k], v);
    return out;
  };
  return merge(defaultProject(), saved) as ProjectParams;
}
