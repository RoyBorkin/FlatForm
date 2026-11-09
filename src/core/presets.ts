/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import type { MaterialParams, PrimitiveKind } from './params';

export const MATERIAL_PRESETS: MaterialParams[] = [
  { preset: 'stainless-1', name: 'Stainless steel 1.0 mm', thickness: 1, kerf: 0.15, minBendRadius: 120, pricePerSheet: 42, cutSpeed: 35, look: 'metal', color: '#b9bcc0', density: 8000 },
  { preset: 'alu-1.5', name: 'Aluminium 1.5 mm', thickness: 1.5, kerf: 0.2, minBendRadius: 150, pricePerSheet: 28, cutSpeed: 40, look: 'metal', color: '#c9ccd0', density: 2700 },
  { preset: 'ply-3', name: 'Birch plywood 3 mm', thickness: 3, kerf: 0.2, minBendRadius: 0, pricePerSheet: 9, cutSpeed: 20, look: 'plywood', color: '#d9b98c', density: 680 },
  { preset: 'ply-1.5', name: 'Aircraft plywood 1.5 mm', thickness: 1.5, kerf: 0.15, minBendRadius: 180, pricePerSheet: 14, cutSpeed: 28, look: 'plywood', color: '#e0c49c', density: 650 },
  { preset: 'mdf-3', name: 'MDF 3 mm', thickness: 3, kerf: 0.25, minBendRadius: 0, pricePerSheet: 5, cutSpeed: 18, look: 'mdf', color: '#a98a69', density: 750 },
  { preset: 'acrylic-3', name: 'Acrylic 3 mm', thickness: 3, kerf: 0.2, minBendRadius: 0, pricePerSheet: 16, cutSpeed: 15, look: 'acrylic', color: '#d8eef2', density: 1190 },
  { preset: 'pp-0.8', name: 'Polypropylene 0.8 mm', thickness: 0.8, kerf: 0.1, minBendRadius: 20, pricePerSheet: 6, cutSpeed: 45, look: 'plastic', color: '#eef0ea', density: 905 },
  { preset: 'cardboard-3', name: 'Corrugated cardboard 3 mm', thickness: 3, kerf: 0.3, minBendRadius: 40, pricePerSheet: 1.5, cutSpeed: 60, look: 'card', color: '#b98d5c', density: 150 },
  { preset: 'card-0.5', name: 'Card stock 0.5 mm', thickness: 0.5, kerf: 0.1, minBendRadius: 8, pricePerSheet: 0.6, cutSpeed: 80, look: 'card', color: '#ebe3d3', density: 700 },
  { preset: 'paper-0.2', name: 'Paper 0.2 mm', thickness: 0.2, kerf: 0.05, minBendRadius: 2, pricePerSheet: 0.1, cutSpeed: 120, look: 'paper', color: '#f6f3ec', density: 400 },
  { preset: 'fabric-0.6', name: 'Canvas / fabric 0.6 mm', thickness: 0.6, kerf: 0.1, minBendRadius: 1, pricePerSheet: 4, cutSpeed: 90, look: 'felt', color: '#c9c2b0', density: 550 },
  { preset: 'leather-1.5', name: 'Leather 1.5 mm', thickness: 1.5, kerf: 0.15, minBendRadius: 4, pricePerSheet: 20, cutSpeed: 40, look: 'felt', color: '#8a5a3a', density: 900 },
  { preset: 'pla-2', name: 'PLA print, 2 mm plates', thickness: 2, kerf: 0, minBendRadius: 60, pricePerSheet: 3, cutSpeed: 30, look: 'plastic', color: '#e8e4dc', density: 1240 },
  { preset: 'felt-3', name: 'Wool felt 3 mm', thickness: 3, kerf: 0.3, minBendRadius: 5, pricePerSheet: 12, cutSpeed: 30, look: 'felt', color: '#7d7a76', density: 330 },
];

export interface ScrewPreset {
  id: string;
  label: string;
  /** Clearance-hole diameters for close / normal / loose fit (ISO 273). */
  close: number;
  normal: number;
  loose: number;
}

export const SCREW_PRESETS: ScrewPreset[] = [
  { id: 'M2', label: 'M2', close: 2.2, normal: 2.4, loose: 2.6 },
  { id: 'M2.5', label: 'M2.5', close: 2.7, normal: 2.9, loose: 3.1 },
  { id: 'M3', label: 'M3', close: 3.2, normal: 3.4, loose: 3.6 },
  { id: 'M4', label: 'M4', close: 4.3, normal: 4.5, loose: 4.8 },
  { id: 'M5', label: 'M5', close: 5.3, normal: 5.5, loose: 5.8 },
  { id: 'M6', label: 'M6', close: 6.4, normal: 6.6, loose: 7 },
  { id: '#4', label: '#4 (US)', close: 3.0, normal: 3.3, loose: 3.6 },
  { id: '#6', label: '#6 (US)', close: 3.7, normal: 4.0, loose: 4.4 },
  { id: '#8', label: '#8 (US)', close: 4.4, normal: 4.6, loose: 5.0 },
  { id: 'rivet-3.2', label: 'Pop rivet 3.2', close: 3.3, normal: 3.4, loose: 3.6 },
  { id: 'rivet-4', label: 'Pop rivet 4.0', close: 4.1, normal: 4.2, loose: 4.4 },
  { id: 'custom', label: 'Custom', close: 3, normal: 3, loose: 3 },
];

export const SHEET_PRESETS = [
  { id: '1000x500', label: '1000 × 500 mm', w: 1000, h: 500 },
  { id: '600x400', label: '600 × 400 mm (desktop laser)', w: 600, h: 400 },
  { id: '1220x610', label: '1220 × 610 mm (4 × 2 ft)', w: 1220, h: 610 },
  { id: '2440x1220', label: '2440 × 1220 mm (8 × 4 ft)', w: 2440, h: 1220 },
  { id: '1250x2500', label: '2500 × 1250 mm (metal)', w: 2500, h: 1250 },
  { id: 'a3', label: 'A3 420 × 297 mm', w: 420, h: 297 },
  { id: 'a4', label: 'A4 297 × 210 mm', w: 297, h: 210 },
  { id: 'letter', label: 'Letter 279 × 216 mm', w: 279.4, h: 215.9 },
  { id: '300x300', label: '300 × 300 mm', w: 300, h: 300 },
  { id: 'cnc-1220', label: 'CNC 1220 × 2440 mm (full sheet)', w: 2440, h: 1220 },
];

export const PRIMITIVES: { kind: PrimitiveKind; label: string; a: string; b: string; c: string }[] = [
  { kind: 'sphere', label: 'Sphere', a: 'Squash', b: 'Lumps', c: 'Lump size' },
  { kind: 'torus', label: 'Torus', a: 'Tube', b: 'Twist wave', c: 'Wave height' },
  { kind: 'roundedBox', label: 'Rounded box', a: 'Depth', b: 'Height', c: 'Rounding' },
  { kind: 'capsule', label: 'Capsule', a: 'Length', b: 'Waist', c: 'Bend' },
  { kind: 'vase', label: 'Vase', a: 'Belly', b: 'Neck', c: 'Ripples' },
  { kind: 'blob', label: 'Blob', a: 'Lobes', b: 'Spread', c: 'Softness' },
  { kind: 'twistedTower', label: 'Twisted tower', a: 'Sides', b: 'Twist', c: 'Taper' },
  { kind: 'saddle', label: 'Saddle', a: 'Curvature', b: 'Aspect', c: 'Wave' },
  { kind: 'lampshade', label: 'Lampshade', a: 'Flare', b: 'Pleats', c: 'Pleat depth' },
  { kind: 'knot', label: 'Trefoil knot', a: 'Tube', b: 'Loops', c: 'Height' },
];

export const PRINT_BEDS = [
  { id: 'mk4', label: 'Prusa MK4 · 250 × 210', w: 250, h: 210 },
  { id: 'x1', label: 'Bambu X1 / P1 · 256 × 256', w: 256, h: 256 },
  { id: 'a1mini', label: 'Bambu A1 mini · 180 × 180', w: 180, h: 180 },
  { id: 'ender3', label: 'Ender 3 · 220 × 220', w: 220, h: 220 },
  { id: 'xl', label: 'Prusa XL · 360 × 360', w: 360, h: 360 },
];

export const PRINT_MATERIALS = { PLA: 1.24, PETG: 1.27, ABS: 1.04, TPU: 1.21 } as const;

export const WIRE_PRESETS = {
  metal: { label: 'Metal wire', holeDiameter: 1.4, slotLength: 0, pitch: 16, edgeOffset: 4, stitch: 'running' },
  string: { label: 'String / cord', holeDiameter: 2.5, slotLength: 0, pitch: 12, edgeOffset: 5, stitch: 'cross' },
  fabric: { label: 'Fabric ribbon', holeDiameter: 1.6, slotLength: 7, pitch: 16, edgeOffset: 6, stitch: 'running' },
  rubber: { label: 'Rubber band', holeDiameter: 3, slotLength: 0, pitch: 22, edgeOffset: 3, stitch: 'notch' },
  zip: { label: 'Zip tie', holeDiameter: 2, slotLength: 5, pitch: 30, edgeOffset: 6, stitch: 'running' },
} as const;

/** Stick stock: bought rods, tubes and profiles, or laser-cut flat strips. */
export const STICK_PRESETS: { id: string; label: string; profile: 'round' | 'square' | 'tube' | 'flat'; size: number; inner?: number; stock: number }[] = [
  { id: 'toothpick', label: 'Toothpicks Ø2 × 65', profile: 'round', size: 2, stock: 65 },
  { id: 'skewer', label: 'Bamboo skewers Ø3 × 250', profile: 'round', size: 3, stock: 250 },
  { id: 'dowel6', label: 'Wood dowel Ø6 × 1000', profile: 'round', size: 6, stock: 1000 },
  { id: 'dowel8', label: 'Wood dowel Ø8 × 1000', profile: 'round', size: 8, stock: 1000 },
  { id: 'dowel10', label: 'Wood dowel Ø10 × 1000', profile: 'round', size: 10, stock: 1000 },
  { id: 'carbon6', label: 'Carbon tube Ø6/4 × 1000', profile: 'tube', size: 6, inner: 4, stock: 1000 },
  { id: 'alu8', label: 'Aluminium tube Ø8/6 × 1000', profile: 'tube', size: 8, inner: 6, stock: 1000 },
  { id: 'square10', label: 'Square pine 10 × 1000', profile: 'square', size: 10, stock: 1000 },
  { id: 'alusq10', label: 'Aluminium square 10 × 1000', profile: 'square', size: 10, stock: 1000 },
  { id: 'flat', label: 'Laser-cut flat strips', profile: 'flat', size: 10, stock: 0 },
];

/** LEGO colours by LDraw code, with screen colours for the preview. */
export const LEGO_COLORS: { code: number; name: string; hex: string }[] = [
  { code: 4, name: 'Red', hex: '#c91a09' },
  { code: 25, name: 'Orange', hex: '#fe8a18' },
  { code: 191, name: 'Bright light orange', hex: '#f8bb3d' },
  { code: 14, name: 'Yellow', hex: '#f2cd37' },
  { code: 72, name: 'Dark bluish grey', hex: '#6c6e68' },
  { code: 71, name: 'Light bluish grey', hex: '#a0a5a9' },
  { code: 0, name: 'Black', hex: '#1b2a34' },
  { code: 15, name: 'White', hex: '#f4f4f4' },
  { code: 19, name: 'Tan', hex: '#e4cd9e' },
  { code: 70, name: 'Reddish brown', hex: '#582a12' },
  { code: 1, name: 'Blue', hex: '#0055bf' },
  { code: 2, name: 'Green', hex: '#237841' },
];

/** LDraw part numbers for each footprint (long side along LDraw X). */
export const LEGO_PARTS: Record<string, { brick: string; plate: string }> = {
  '1x1': { brick: '3005', plate: '3024' },
  '1x2': { brick: '3004', plate: '3023' },
  '1x3': { brick: '3622', plate: '3623' },
  '1x4': { brick: '3010', plate: '3710' },
  '1x6': { brick: '3009', plate: '3666' },
  '1x8': { brick: '3008', plate: '3460' },
  '2x2': { brick: '3003', plate: '3022' },
  '2x3': { brick: '3002', plate: '3021' },
  '2x4': { brick: '3001', plate: '3020' },
  '2x6': { brick: '2456', plate: '3795' },
  '2x8': { brick: '3007', plate: '3034' },
};
