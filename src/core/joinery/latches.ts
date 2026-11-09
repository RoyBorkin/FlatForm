/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/**
 * Integral folding latches. Every shape is built in an edge-local frame:
 * s runs along the edge, n points out of the panel (n > 0 is outside).
 * The male side grows a feature outward; the female side receives a cut.
 */
import type { LatchKind } from '../params';
import type { Path2 } from '../types';
import type { V2 } from '../math/vec';

export interface LatchSpec {
  kind: LatchKind;
  width: number;
  depth: number;
  clearance: number;
  angle: number; // degrees
  thickness: number;
}

export interface LatchGeometry {
  add: Path2[]; // union into the male panel
  sub: Path2[]; // subtract from the female panel
  /** Fold line on the male panel (local coords), when the feature folds. */
  fold?: [V2, V2];
}

const rect = (s0: number, s1: number, n0: number, n1: number): Path2 => [
  [s0, n0],
  [s1, n0],
  [s1, n1],
  [s0, n1],
];

/** Slot in the female panel, parallel to the edge, a little way in. */
function slot(c: number, len: number, L: LatchSpec): Path2 {
  const h = L.thickness + L.clearance;
  const off = L.thickness * 1.5 + 1;
  return rect(c - len / 2, c + len / 2, -off - h / 2, -off + h / 2);
}

export function latchAt(c: number, L: LatchSpec): LatchGeometry {
  const W = L.width, D = L.depth;
  const tan = Math.tan((Math.max(5, Math.min(60, L.angle)) * Math.PI) / 180);
  switch (L.kind) {
    case 'tabSlot': {
      const ch = Math.min(W * 0.2, D * 0.4);
      const tab: Path2 = [
        [c - W / 2, 0],
        [c + W / 2, 0],
        [c + W / 2, D - ch],
        [c + W / 2 - ch, D],
        [c - W / 2 + ch, D],
        [c - W / 2, D - ch],
      ];
      return { add: [tab], sub: [slot(c, W + L.clearance, L)], fold: [[c - W / 2, 0], [c + W / 2, 0]] };
    }
    case 'arrow': {
      const neck = W * 0.55;
      const n1 = D * 0.5;
      const barb = Math.min(D * 0.25, ((W - neck) / 2) / Math.max(0.2, tan));
      const head: Path2 = [
        [c - neck / 2, 0],
        [c + neck / 2, 0],
        [c + neck / 2, n1],
        [c + W / 2, n1],
        [c + W / 2, n1 + barb * 0.3],
        [c, D],
        [c - W / 2, n1 + barb * 0.3],
        [c - W / 2, n1],
        [c - neck / 2, n1],
      ];
      return { add: [head], sub: [slot(c, neck + L.clearance, L)], fold: [[c - neck / 2, 0], [c + neck / 2, 0]] };
    }
    case 'hook': {
      const neck = W * 0.55;
      const n1 = D * 0.45;
      const hook: Path2 = [
        [c - neck / 2, 0],
        [c + neck / 2, 0],
        [c + neck / 2, n1],
        [c + W / 2, n1],
        [c + neck / 2, D],
        [c - neck / 2, D],
      ];
      return { add: [hook], sub: [slot(c, neck + L.clearance, L)], fold: [[c - neck / 2, 0], [c + neck / 2, 0]] };
    }
    case 'puzzle': {
      // In-plane dovetail: narrow at the edge, flared at the end.
      const neck = W * 0.6;
      const flare = Math.min(W, neck + 2 * D * tan);
      const knob: Path2 = [
        [c - neck / 2, -0.01],
        [c + neck / 2, -0.01],
        [c + flare / 2, D],
        [c - flare / 2, D],
      ];
      const cl = L.clearance / 2;
      const socket: Path2 = [
        [c - neck / 2 - cl, 0.5],
        [c - flare / 2 - cl, -D - cl],
        [c + flare / 2 + cl, -D - cl],
        [c + neck / 2 + cl, 0.5],
      ];
      return { add: [knob], sub: [socket] };
    }
  }
}

/** Positions (s values) for latches along an edge of length len. */
export function latchPositions(len: number, width: number, perEdge: number): number[] {
  const usable = len - width * 1.2;
  if (usable < width * 0.5) return [];
  const n = perEdge > 0 ? perEdge : Math.max(1, Math.min(4, Math.floor(len / (width * 3.5))));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(width * 0.6 + ((i + 0.5) * usable) / n);
  return out;
}

/** Glue tab: a trapezoid with 45° shoulders. */
export function glueTab(len: number, w: number): Path2 {
  const inset = Math.min(w, len * 0.3);
  return [
    [0.0, 0],
    [len, 0],
    [len - inset, w],
    [inset, w],
  ];
}
