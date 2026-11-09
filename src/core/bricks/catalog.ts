/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/** What each placed LEGO piece is: its kind, name and LDraw/BrickLink part number. */
import type { BrickPlacement } from '../types';
import { LEGO_PARTS, LEGO_SPECIAL } from '../presets';

export interface BrickKind {
  key: string;
  label: string;
  part: string;
  shape: 'rect' | 'round' | 'corner';
  /** Footprint, long side first. */
  w: number;
  d: number;
}

export function brickKind(b: BrickPlacement, plate: boolean): BrickKind {
  const unit = plate ? 'plate' : 'brick';
  if (b.shape === 'round') {
    const s = b.w >= 2 ? LEGO_SPECIAL.round2 : LEGO_SPECIAL.round1;
    return { key: `round-${b.w}x${b.w}`, label: s.label, part: s[unit], shape: 'round', w: b.w, d: b.w };
  }
  if (b.shape === 'corner') return { key: 'corner-2x2', label: LEGO_SPECIAL.corner.label, part: LEGO_SPECIAL.corner[unit], shape: 'corner', w: 2, d: 2 };
  const lo = Math.min(b.w, b.d), hi = Math.max(b.w, b.d);
  const size = `${lo}x${hi}`;
  return { key: size, label: `${lo}×${hi}`, part: LEGO_PARTS[size]?.[unit] ?? '?', shape: 'rect', w: hi, d: lo };
}

/** Grid cells (relative to x, y) that a corner piece covers, its corner stud first. */
export function cornerCells(rot: number): [number, number][] {
  switch (rot & 3) {
    case 1:
      return [[1, 0], [0, 0], [1, 1]];
    case 2:
      return [[1, 1], [0, 1], [1, 0]];
    case 3:
      return [[0, 1], [1, 1], [0, 0]];
    default:
      return [[0, 0], [1, 0], [0, 1]];
  }
}

/** The cells a placed piece covers (absolute grid coordinates). */
export function brickCells(b: BrickPlacement): [number, number][] {
  if (b.shape === 'corner') return cornerCells(b.rot ?? 0).map(([i, j]) => [b.x + i, b.y + j]);
  const out: [number, number][] = [];
  for (let i = 0; i < b.w; i++) for (let j = 0; j < b.d; j++) out.push([b.x + i, b.y + j]);
  return out;
}
