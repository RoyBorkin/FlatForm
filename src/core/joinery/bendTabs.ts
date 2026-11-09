/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Bend tabs: a tab on one part passes through a slot in its neighbour and is
 * bent over to hold it. Between stacked flat layers the tab grows from the
 * smaller layer's outline, bends down at the edge, goes through a slot in the
 * layer below and folds flat underneath. Along a seam it bends round the seam
 * into the other panel's slot.
 */
import type { Path2, Polyline2 } from '../types';
import type { JoineryParams } from '../params';
import { pointInRegion } from '../polygon/polygon';
import type { V2 } from '../math/vec';
import type { EdgeCtx, Features } from './edgeFeatures';

type B = JoineryParams['bendtabs'];

export interface LayerTabs {
  add: Path2[];
  sub: Path2[];
  score: Polyline2[];
}

const rect = (P: (s: number, n: number) => V2, s0: number, s1: number, n0: number, n1: number): Path2 => [P(s0, n0), P(s1, n0), P(s1, n1), P(s0, n1)];

/**
 * Tabs between consecutive layers that share one 2D frame. `gap` is the empty
 * space between neighbouring layers (0 when they touch). Returns features per
 * layer and the number of tabs placed.
 */
export function stackTabs(regions: Path2[][], thickness: number, gap: number, b: B): { features: LayerTabs[]; count: number } {
  const features = regions.map(() => ({ add: [] as Path2[], sub: [] as Path2[], score: [] as Polyline2[] }));
  let count = 0;
  const t = thickness;
  const o = b.bendRadius + gap + t / 2; // slot centre from the bend line
  const reach = o + t / 2 + b.bendRadius + b.fold; // tab length laid flat
  const margin = Math.max(t, 1.5);
  const tryPair = (ai: number, bi: number) => {
    const A = regions[ai], Bq = regions[bi];
    if (!A.length || !Bq.length) return;
    for (const poly of A) {
      const n = poly.length;
      let acc = b.pitch / 2;
      for (let i = 0; i < n; i++) {
        const p0 = poly[i], p1 = poly[(i + 1) % n];
        const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        if (L < 1e-6) continue;
        const u: V2 = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L];
        let s = acc;
        while (s <= L) {
          const c: V2 = [p0[0] + u[0] * s, p0[1] + u[1] * s];
          if (s - b.width / 2 >= 0 && s + b.width / 2 <= L) {
            // Outward normal: the side of the edge with no material of A.
            let out: V2 = [u[1], -u[0]];
            if (pointInRegion([c[0] + out[0] * 0.4, c[1] + out[1] * 0.4], A)) out = [-out[0], -out[1]];
            if (!pointInRegion([c[0] - out[0] * 0.4, c[1] - out[1] * 0.4], A)) {
              s += 1;
              continue;
            }
            const P = (ss: number, nn: number): V2 => [c[0] + u[0] * ss + out[0] * nn, c[1] + u[1] * ss + out[1] * nn];
            const hw = b.width / 2, sw = (b.width + b.clearance) / 2, st = (t + b.clearance) / 2;
            // The tab must lie clear of A, and B must hold the slot (and the folded end) with a margin.
            const tabClear = [0.3, 0.6, 1].every((f) => [-hw, 0, hw].every((ss) => !pointInRegion(P(ss, reach * f), A)));
            const slotIn = [-sw - margin, 0, sw + margin].every((ss) => [o - st - margin, o, o + st + margin].every((nn) => pointInRegion(P(ss, nn), Bq)));
            const foldIn = [-hw, hw].every((ss) => pointInRegion(P(ss, o + b.fold), Bq)) || [-hw, hw].every((ss) => pointInRegion(P(ss, o - b.fold), Bq));
            if (tabClear && slotIn && foldIn) {
              features[ai].add.push(rect(P, -hw, hw, -0.01, reach));
              features[ai].score.push({ pts: [P(-hw, 0), P(hw, 0)], kind: 'valley' });
              features[bi].sub.push(rect(P, -sw, sw, o - st, o + st));
              count++;
              s += b.pitch;
              continue;
            }
          }
          s += Math.max(2, b.width / 2);
        }
        acc = s - L;
      }
    }
  };
  for (let k = 1; k < regions.length; k++) {
    tryPair(k, k - 1);
    tryPair(k - 1, k);
  }
  return { features, count };
}

/**
 * Bend tabs along a seam between panels: the male side grows tabs that wrap
 * round the seam into slots on the female side.
 */
export function seamBendTabs(ctx: EdgeCtx, f: Features, b: B) {
  const t = ctx.thickness;
  const o = Math.max(2 * t, 3) + b.bendRadius;
  const n = Math.max(1, Math.round(ctx.len / Math.max(b.pitch, b.width * 2)));
  const hw = b.width / 2, sw = (b.width + b.clearance) / 2, st = (t + b.clearance) / 2;
  for (let i = 0; i < n; i++) {
    const s = ((i + 0.5) * ctx.len) / n;
    if (s - sw < 1 || s + sw > ctx.len - 1) continue;
    if (ctx.male) {
      const reach = o + t + b.bendRadius + b.fold;
      f.add.push([ctx.toXY(s - hw, -0.01), ctx.toXY(s + hw, -0.01), ctx.toXY(s + hw, reach), ctx.toXY(s - hw, reach)]);
      f.score.push({ pts: [ctx.toXY(s - hw, 0), ctx.toXY(s + hw, 0)], kind: 'valley' });
      f.score.push({ pts: [ctx.toXY(s - hw, o), ctx.toXY(s + hw, o)], kind: 'valley' });
    } else {
      f.sub.push([ctx.toXY(s - sw, -o - st), ctx.toXY(s + sw, -o - st), ctx.toXY(s + sw, -o + st), ctx.toXY(s - sw, -o + st)]);
    }
  }
}
