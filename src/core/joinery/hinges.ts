/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Bending patterns cut into the sheet:
 *
 *  - Living hinges (12 patterns): rows of cuts across a band, so rigid board
 *    (plywood, MDF, acrylic) bends into a curve. Open cuts are kerf lines;
 *    closed shapes are cut out.
 *  - Bend relief (6 patterns): a single row of slots or holes along a fold, so
 *    sheet metal and thick plastic can be bent by hand along that line. The
 *    default follows SendCutSend's hand-bend guide: slots about half to 0.7×
 *    the thickness wide, tabs at least the thickness wide, about six slots
 *    per bend.
 */
import type { Circle2, Path2 } from '../types';
import type { BendReliefParams, HingeParams, HingePattern, ReliefPattern } from '../params';
import type { EdgeCtx, Features } from './edgeFeatures';
import { bounds, clipOpenPaths, intersection, pointInRegion } from '../polygon/polygon';
import type { V2 } from '../math/vec';

export const HINGE_PATTERNS: { id: HingePattern; label: string; text: string; closed: boolean; both?: boolean }[] = [
  { id: 'straight', label: 'Straight lines', text: 'Offset rows of single cuts, like brickwork. The tightest bend for a given spacing.', closed: false },
  { id: 'rectangles', label: 'Rectangles', text: 'Offset rows of narrow slots. Easier to cut cleanly in thick board.', closed: true },
  { id: 'obround', label: 'Round-end slots', text: 'Slots with round ends: no sharp corners where cracks start.', closed: true },
  { id: 'bones', label: 'Dog-bones', text: 'Cuts that end in small round holes, which stop cracks running on.', closed: false },
  { id: 'wave', label: 'Wave', text: 'Sine-shaped cuts. Softer and more even than straight lines.', closed: false },
  { id: 'zigzag', label: 'Zig-zag', text: 'Zig-zag cuts that resist twisting.', closed: false },
  { id: 'chevron', label: 'Chevron', text: 'V-shaped cuts. Bends one way and stays straight across.', closed: false },
  { id: 'serpentine', label: 'Serpentine', text: 'Interlocking U-shaped cuts: the most flexible, also twists.', closed: false },
  { id: 'diamond', label: 'Diamond lattice', text: 'Rhombus cut-outs (kerf lattice). Bends both ways and over double curves.', closed: true, both: true },
  { id: 'hexagon', label: 'Honeycomb', text: 'Long hexagon cut-outs in a honeycomb. Stiff, even and decorative.', closed: true, both: true },
  { id: 'cross', label: 'Crosses', text: 'Cuts with a short cross bar: stretches as well as bends.', closed: false, both: true },
  { id: 'triangles', label: 'Triangles', text: 'Alternating triangle cut-outs. Bends one way, very decorative.', closed: true },
];

export const RELIEF_PATTERNS: { id: ReliefPattern; label: string; text: string }[] = [
  { id: 'slots', label: 'Hand-bend slots', text: 'SendCutSend style: slots with angled ends, so the tabs between them twist easily. Bends by hand along the line.' },
  { id: 'wave', label: 'Wave slots', text: 'SendCutSend wave: curved slots, a smoother bend with more tab length.' },
  { id: 'obround', label: 'Round-end slots', text: 'Straight slots with round ends and square tabs. Simple and strong.' },
  { id: 'holes', label: 'Holes', text: 'A row of round holes. The softest relief, for thin sheet and plastic.' },
  { id: 'staggered', label: 'Staggered slots', text: 'Two offset rows of short slots. For thick or hard sheet.' },
  { id: 'bones', label: 'Slots with relief holes', text: 'Narrow slots ending in round holes, which stop cracks at the slot ends.' },
];

export interface CutSet {
  lines: Path2[];
  holes: Path2[];
  circles: Circle2[];
}

const empty = (): CutSet => ({ lines: [], holes: [], circles: [] });

function obround(a: number, b: number, v: number, w: number, seg = 8): Path2 {
  const r = w / 2;
  const pts: Path2 = [];
  if (b - a <= w) {
    const c = (a + b) / 2;
    for (let i = 0; i < seg * 2; i++) {
      const t = (i / (seg * 2)) * Math.PI * 2;
      pts.push([c + Math.cos(t) * Math.max(r, (b - a) / 2), v + Math.sin(t) * r]);
    }
    return pts;
  }
  for (let i = 0; i <= seg; i++) {
    const t = -Math.PI / 2 + (i / seg) * Math.PI;
    pts.push([b - r + Math.cos(t) * r, v + Math.sin(t) * r]);
  }
  for (let i = 0; i <= seg; i++) {
    const t = Math.PI / 2 + (i / seg) * Math.PI;
    pts.push([a + r + Math.cos(t) * r, v + Math.sin(t) * r]);
  }
  return pts;
}

const rect = (a: number, b: number, v0: number, v1: number): Path2 => [[a, v0], [b, v0], [b, v1], [a, v1]];

/**
 * One living-hinge cell in band coordinates: u along the cuts (the bend
 * axis), v across the rows. `col` alternates shapes that flip every cell.
 */
function hingeCell(P: HingeParams, u0: number, v0: number, col: number, out: CutSet) {
  const L = P.cutLength, S = P.spacing;
  const W = Math.max(0.1, P.slotWidth);
  const H = Math.min(2 * W, S * 0.9); // cut-out height: never reaches the next row
  const u1 = u0 + L;
  switch (P.pattern) {
    case 'straight':
      out.lines.push([[u0, v0], [u1, v0]]);
      break;
    case 'rectangles':
      out.holes.push(rect(u0, u1, v0 - W / 2, v0 + W / 2));
      break;
    case 'obround':
      out.holes.push(obround(u0, u1, v0, W));
      break;
    case 'bones': {
      const r = Math.min(W, S * 0.4);
      out.lines.push([[u0 + r, v0], [u1 - r, v0]]);
      out.circles.push({ x: u0 + r, y: v0, r }, { x: u1 - r, y: v0, r });
      break;
    }
    case 'wave': {
      const pts: Path2 = [];
      for (let i = 0; i <= 12; i++) pts.push([u0 + (L * i) / 12, v0 + Math.sin((i / 12) * Math.PI * 2) * S * 0.3]);
      out.lines.push(pts);
      break;
    }
    case 'zigzag': {
      const pts: Path2 = [];
      for (let i = 0; i <= 8; i++) pts.push([u0 + (L * i) / 8, v0 + (i % 2 ? 1 : -1) * S * 0.28]);
      out.lines.push(pts);
      break;
    }
    case 'chevron': {
      const h = S * 0.3;
      out.lines.push([[u0, v0 - h], [u0 + L / 2, v0 + h], [u1, v0 - h]]);
      break;
    }
    case 'serpentine': {
      const h = S * 0.36;
      out.lines.push(col % 2 ? [[u1, v0 + h], [u0, v0 + h], [u0, v0 - h], [u1, v0 - h]] : [[u0, v0 + h], [u1, v0 + h], [u1, v0 - h], [u0, v0 - h]]);
      break;
    }
    case 'diamond':
      out.holes.push([[u0, v0], [u0 + L / 2, v0 - H / 2], [u1, v0], [u0 + L / 2, v0 + H / 2]]);
      break;
    case 'hexagon': {
      const e = Math.min(L / 3, (H / 2) * 0.577);
      out.holes.push([[u0, v0], [u0 + e, v0 - H / 2], [u1 - e, v0 - H / 2], [u1, v0], [u1 - e, v0 + H / 2], [u0 + e, v0 + H / 2]]);
      break;
    }
    case 'cross': {
      const a = Math.min(S * 0.38, L / 4);
      out.lines.push([[u0, v0], [u1, v0]], [[u0 + L / 2, v0 - a], [u0 + L / 2, v0 + a]]);
      break;
    }
    case 'triangles':
      out.holes.push(col % 2 ? [[u0, v0 + H / 2], [u1, v0 + H / 2], [u0 + L / 2, v0 - H / 2]] : [[u0, v0 - H / 2], [u1, v0 - H / 2], [u0 + L / 2, v0 + H / 2]]);
      break;
  }
}

/** Whether a pattern cuts material out (needs webs) rather than just kerf lines. */
export const hingeIsClosed = (p: HingePattern) => HINGE_PATTERNS.find((x) => x.id === p)?.closed ?? false;

/**
 * Fill a region with a living hinge whose cuts run along direction d (unit,
 * 2D) — the bend axis. Returns cut lines, cut-outs and round holes, all
 * clipped to the region.
 */
export function hingeFill(region: Path2[], d: V2, P: HingeParams): CutSet {
  if (!region.length) return empty();
  const b = bounds(region);
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const L = Math.max(0.5, P.cutLength), S = Math.max(0.2, P.spacing), B = Math.max(0.2, P.bridge);
  const R = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2 + L;
  const n: V2 = [-d[1], d[0]];
  const step = L + B;
  const rows = Math.ceil(R / S);
  const local = empty();
  for (let r = -rows; r <= rows; r++) {
    const shift = (Math.abs(r) % 2) * (step / 2);
    let col = 0;
    for (let s = -R - shift; s < R; s += step) hingeCell({ ...P, cutLength: L, spacing: S }, s, r * S, col++ + Math.abs(r), local);
  }
  const map = (p: V2): V2 => [cx + d[0] * p[0] + n[0] * p[1], cy + d[1] * p[0] + n[1] * p[1]];
  const out = empty();
  out.lines = clipOpenPaths(local.lines.map((l) => l.map(map)), region);
  if (local.holes.length) {
    // Quick reject by bounding box, then clip to the band.
    const inside = local.holes.map((h) => h.map(map)).filter((h) => {
      const hb = bounds([h]);
      return hb.maxX >= b.minX && hb.minX <= b.maxX && hb.maxY >= b.minY && hb.minY <= b.maxY;
    });
    out.holes = inside.length ? intersection(inside, region) : [];
  }
  for (const c of local.circles) {
    const [x, y] = map([c.x, c.y]);
    out.circles.push({ x, y, r: c.r });
  }
  out.circles = out.circles.filter((c) => pointInRegion([c.x, c.y], region));
  return out;
}

/** Add a cut set to a part's features. */
export function addCuts(F: Features, c: CutSet) {
  for (const l of c.lines) F.perforations.push({ pts: l });
  F.sub.push(...c.holes);
  F.holes.push(...c.circles);
}

/** A living hinge in a band along one edge (previews and single folds). */
export function hingeAlongEdge(ctx: EdgeCtx, F: Features, P: HingeParams, halfWidth: number) {
  const m = Math.max(P.bridge, ctx.thickness);
  if (ctx.len <= 2 * m) return;
  const band: Path2 = [ctx.toXY(m, -halfWidth), ctx.toXY(ctx.len - m, -halfWidth), ctx.toXY(ctx.len - m, halfWidth), ctx.toXY(m, halfWidth)];
  const A = ctx.toXY(0, 0), Bp = ctx.toXY(1, 0);
  addCuts(F, hingeFill([band], [Bp[0] - A[0], Bp[1] - A[1]], P));
}

// ------------------------------------------------------------------ bend relief

/** Slot width, tab width and end margin for a fold in sheet of thickness t. */
export function reliefSizes(P: BendReliefParams, t: number) {
  const w = Math.max(0.3, P.width * t);
  const tab = Math.max(t, P.tab * t);
  const end = P.endRelief === 'none' ? 0 : Math.max(w * 1.5, t) / 2;
  return { w, tab, end };
}

/**
 * Bend relief along a fold: slots or holes on the fold line, separated by
 * tabs, plus optional relief cut-outs where the fold meets an edge or a
 * corner. Drawn in edge coordinates, so it works in previews too.
 */
export function bendRelief(ctx: EdgeCtx, F: Features, P: BendReliefParams) {
  const t = ctx.thickness;
  const { w, tab, end } = reliefSizes(P, t);
  const L = ctx.len;
  const margin = Math.max(tab, end + tab);
  const avail = L - 2 * margin;
  const local: Path2[] = [];
  const circles: Circle2[] = [];
  if (avail > w) {
    // Angled tabs are measured square to themselves: their spacing along the fold is longer.
    const gap = P.pattern === 'slots' ? tab / Math.SQRT1_2 : P.pattern === 'wave' ? tab * 1.2 : tab;
    const target = Math.max(w * 1.5, P.slotLength);
    const n = Math.max(1, Math.round((avail + gap) / (target + gap)));
    const len = (avail - (n - 1) * gap) / n;
    for (let i = 0; i < n; i++) {
      const a = margin + i * (len + gap), b = a + len;
      switch (P.pattern) {
        case 'slots': {
          const k = Math.min(w / 2, len / 4);
          local.push([[a - k, -w / 2], [b - k, -w / 2], [b + k, w / 2], [a + k, w / 2]]);
          break;
        }
        case 'wave': {
          const pts: Path2 = [];
          const back: Path2 = [];
          const A = w * 0.9;
          for (let j = 0; j <= 16; j++) {
            const s = a + (len * j) / 16;
            const c = Math.sin((j / 16) * Math.PI * 2) * A;
            pts.push([s, c - w / 2]);
            back.push([s, c + w / 2]);
          }
          local.push([...pts, ...back.reverse()]);
          break;
        }
        case 'obround':
          local.push(obround(a, b, 0, w));
          break;
        case 'holes': {
          // Holes as big as the slot width allows, at the tab pitch.
          const d = Math.max(w, Math.min(len, 2 * w));
          const pitch = d + tab;
          const k = Math.max(1, Math.floor((len + tab) / pitch));
          const span = k * pitch - tab;
          for (let q = 0; q < k; q++) circles.push({ x: a + (len - span) / 2 + d / 2 + q * pitch, y: 0, r: d / 2 });
          break;
        }
        case 'staggered': {
          const off = w * 0.9;
          const half = (len - tab) / 2;
          if (half > w) {
            local.push(obround(a, a + half, -off, w), obround(a + half + tab, b, -off, w));
            local.push(obround(a + half / 2 + tab / 2, a + half * 1.5 + tab / 2, off, w));
          } else local.push(obround(a, b, 0, w));
          break;
        }
        case 'bones': {
          const r = Math.max(w, t * 0.5);
          local.push(rect(a + r, b - r, -w / 4, w / 4));
          circles.push({ x: a + r, y: 0, r }, { x: b - r, y: 0, r });
          break;
        }
      }
    }
  }
  for (const p of local) F.sub.push(p.map(([s, n]) => ctx.toXY(s, n)));
  for (const c of circles) {
    const [x, y] = ctx.toXY(c.x, c.y);
    F.holes.push({ x, y, r: c.r });
  }
  // End relief: a round or square cut-out where the bend line ends.
  if (P.endRelief !== 'none' && end > 0)
    for (const s of [0, L]) {
      if (P.endRelief === 'round') {
        const [x, y] = ctx.toXY(s, 0);
        F.holes.push({ x, y, r: end });
      } else F.sub.push([ctx.toXY(s - end, -end), ctx.toXY(s + end, -end), ctx.toXY(s + end, end), ctx.toXY(s - end, end)]);
    }
  // The bend line itself, as a guide mark between the slots.
  F.score.push({ pts: [ctx.A, ctx.B], kind: ctx.convex ? 'mountain' : 'valley' });
}
