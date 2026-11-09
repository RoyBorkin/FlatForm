import type { MaterialParams, PrimitiveKind } from './params';

export const MATERIAL_PRESETS: MaterialParams[] = [
  { preset: 'stainless-1', name: 'Stainless steel 1.0 mm', thickness: 1, kerf: 0.15, minBendRadius: 120, pricePerSheet: 42, cutSpeed: 35, look: 'metal', color: '#b9bcc0' },
  { preset: 'alu-1.5', name: 'Aluminium 1.5 mm', thickness: 1.5, kerf: 0.2, minBendRadius: 150, pricePerSheet: 28, cutSpeed: 40, look: 'metal', color: '#c9ccd0' },
  { preset: 'ply-3', name: 'Birch plywood 3 mm', thickness: 3, kerf: 0.2, minBendRadius: 0, pricePerSheet: 9, cutSpeed: 20, look: 'plywood', color: '#d9b98c' },
  { preset: 'ply-1.5', name: 'Aircraft plywood 1.5 mm', thickness: 1.5, kerf: 0.15, minBendRadius: 180, pricePerSheet: 14, cutSpeed: 28, look: 'plywood', color: '#e0c49c' },
  { preset: 'mdf-3', name: 'MDF 3 mm', thickness: 3, kerf: 0.25, minBendRadius: 0, pricePerSheet: 5, cutSpeed: 18, look: 'mdf', color: '#a98a69' },
  { preset: 'acrylic-3', name: 'Acrylic 3 mm', thickness: 3, kerf: 0.2, minBendRadius: 0, pricePerSheet: 16, cutSpeed: 15, look: 'acrylic', color: '#d8eef2' },
  { preset: 'pp-0.8', name: 'Polypropylene 0.8 mm', thickness: 0.8, kerf: 0.1, minBendRadius: 20, pricePerSheet: 6, cutSpeed: 45, look: 'plastic', color: '#eef0ea' },
  { preset: 'cardboard-3', name: 'Corrugated cardboard 3 mm', thickness: 3, kerf: 0.3, minBendRadius: 40, pricePerSheet: 1.5, cutSpeed: 60, look: 'card', color: '#b98d5c' },
  { preset: 'card-0.5', name: 'Card stock 0.5 mm', thickness: 0.5, kerf: 0.1, minBendRadius: 8, pricePerSheet: 0.6, cutSpeed: 80, look: 'card', color: '#ebe3d3' },
  { preset: 'paper-0.2', name: 'Paper 0.2 mm', thickness: 0.2, kerf: 0.05, minBendRadius: 2, pricePerSheet: 0.1, cutSpeed: 120, look: 'paper', color: '#f6f3ec' },
  { preset: 'felt-3', name: 'Wool felt 3 mm', thickness: 3, kerf: 0.3, minBendRadius: 5, pricePerSheet: 12, cutSpeed: 30, look: 'felt', color: '#7d7a76' },
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
