/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/**
 * Flaticulation (Fang, Chan & Cheng, UIST '22): T-patterns on the shared
 * edge of two pieces cut in place, so they clutch together when folded to a
 * designated angle θ.
 *
 *  <θ-pattern: limits folding past θ.   X cos θ + T sin θ = L   (eq. 1/3)
 *  >θ-pattern: a cantilever ratchet that stops the pieces opening back flat
 *              L = |T csc θ| (− X_ext tan θ for θ > 90°),  X = T cot θ + X_ext (eq. 2)
 *  with X = T − L (θ ≤ 90°) or −L (θ > 90°) for the <θ-pattern (eq. 4), the
 *  kerf angle α folded into θ, and the kerf corrections of Table A.1.
 *
 * All lengths in mm, angles in radians. Pattern geometry is drawn as single
 * cut lines in an edge-local frame: s along the edge, n > 0 into board B.
 */
import type { Path2 } from '../types';

export interface FlatInput {
  T: number; // board thickness
  theta: number; // fold angle from flat, radians (0 = flat)
  K: number; // kerf position offset
  alpha: number; // kerf angle offset, radians
  mountain: boolean; // convex fold
  stiffness: number; // 0..1, scales X_ext (0.5 → the paper's 0.3·T·sin θ)
}

export interface TParams {
  L: number; // neck length after kerf correction
  X: number; // base displacement after kerf correction
}

const MAX = (165 * Math.PI) / 180;
const MIN = (6 * Math.PI) / 180;

/** Neck length and base displacement of the <θ-pattern. */
export function lessThanPattern(f: FlatInput): TParams {
  const th = Math.min(MAX, Math.max(MIN, f.theta));
  const a = f.alpha, T = f.T;
  const c = Math.cos(th + a), s = Math.sin(th + a);
  const den = Math.cos(a) + c;
  let L: number, X: number;
  if (th <= Math.PI / 2) {
    L = (T * (c + s - Math.sin(a))) / den;
    X = T - L;
  } else {
    L = (T * (s - Math.sin(a))) / Math.max(1e-3, den);
    X = -L;
  }
  const ta = T * Math.tan(a);
  const acute = th <= Math.PI / 2;
  if (f.mountain) return { L: L - f.K, X: X + f.K + ta };
  return { L: L - f.K - ta, X: acute ? X + ta : X + f.K + ta };
}

/** Neck length and base displacement of the >θ-pattern (the ratchet). */
export function greaterThanPattern(f: FlatInput): TParams {
  const th = Math.min(MAX, Math.max(MIN, f.theta + f.alpha));
  const T = f.T;
  const xext = 0.3 * T * Math.sin(th) * (f.stiffness * 2);
  const csc = 1 / Math.abs(Math.sin(th));
  const acute = f.theta <= Math.PI / 2;
  const L = acute ? T * csc : T * csc - xext * Math.tan(th);
  const X = T / Math.tan(th) + xext;
  const ta = T * Math.tan(f.alpha);
  if (f.mountain) return { L: L - f.K, X: acute ? X + ta : X + f.K - ta };
  return { L: L - f.K - 2 * ta, X: acute ? X + ta : X + f.K + ta };
}

export interface PatternGeometry {
  cuts: Path2[]; // open cut polylines
  /** Spans of the shared edge that must stay uncut (the necks). */
  keep: [number, number][];
}

/**
 * One <θ-pattern at s = c: a T-shaped tongue of board A reaching into board
 * B, plus the stop line that sets the base displacement.
 */
export function drawLessThan(c: number, p: TParams, neck: number, head: number, T: number): PatternGeometry {
  const L = Math.max(0.6, p.L);
  const hh = Math.max(1.2, T * 0.9);
  const wn = neck / 2, wh = head / 2;
  const tongue: Path2 = [
    [c - wn, 0],
    [c - wn, L],
    [c - wh, L],
    [c - wh, L + hh],
    [c + wh, L + hh],
    [c + wh, L],
    [c + wn, L],
    [c + wn, 0],
  ];
  const stopAt = L + hh + Math.max(0.4, Math.abs(p.X));
  const stop: Path2 = [
    [c - wh - 0.6, stopAt],
    [c + wh + 0.6, stopAt],
  ];
  return { cuts: [tongue, stop], keep: [[c - wn, c + wn]] };
}

/**
 * One >θ-pattern at s = c: a long tongue of board B reaching into board A,
 * caught behind a cantilever beam (two slits) at the base displacement X.
 */
export function drawGreaterThan(c: number, p: TParams, neck: number, head: number, T: number): PatternGeometry {
  const L = Math.max(0.8, p.L);
  const hh = Math.max(1.0, T * 0.7);
  const wn = neck / 2, wh = head / 2;
  const tongue: Path2 = [
    [c - wn, 0],
    [c - wn, -L],
    [c - wh, -L],
    [c - wh, -L - hh],
    [c + wh, -L - hh],
    [c + wh, -L],
    [c + wn, -L],
    [c + wn, 0],
  ];
  const beamAt = -(L + hh + Math.max(0.3, Math.abs(p.X) * 0.35));
  const beam = Math.max(0.8, T * 0.45);
  const s1: Path2 = [
    [c - wh - 1.2, beamAt],
    [c + wh + 1.2, beamAt],
  ];
  const s2: Path2 = [
    [c - wh - 1.2, beamAt - beam],
    [c + wh + 1.2, beamAt - beam],
  ];
  return { cuts: [tongue, s1, s2], keep: [[c - wn, c + wn]] };
}
