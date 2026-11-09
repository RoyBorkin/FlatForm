/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/** Map the project's joinery choice onto seam features (both sides of a cut edge). */
import type { JoineryParams } from '../params';
import { fingers, glueFlap, holeRow, latches, wireStitches, type EdgeCtx, type Features } from './edgeFeatures';
import { LEGO_HOLE, LEGO_PITCH, pinHoleDiameter } from './holes';
import { seamBendTabs } from './bendTabs';

export interface SeamOptions {
  /** Glue tabs when joinery is "none" (width in mm, 0 = off). */
  glueTabWidth: number;
  /** Called per hole row on the male side (for brackets and connector counts). */
  onHoles?: (ctx: EdgeCtx, count: number) => void;
  /** Cardboard connectors: called on the male side with the clip count and inside angle (degrees). */
  onClip?: (ctx: EdgeCtx, count: number, insideDeg: number) => void;
}

/** Counts clips by angle for the printed-connector export. */
export class AngleCounter {
  private map = new Map<number, number>();
  /** Angles are grouped to this step (degrees): one printed shape per group. */
  constructor(private step = 1) {}
  add(angle: number, n = 1) {
    const a = Math.round(angle / this.step) * this.step;
    this.map.set(a, (this.map.get(a) ?? 0) + n);
  }
  list() {
    return [...this.map.entries()].sort((a, b) => a[0] - b[0]).map(([angle, count]) => ({ angle, count }));
  }
  get total() {
    let n = 0;
    for (const c of this.map.values()) n += c;
    return n;
  }
}

/** How far each panel is cut back from a seam so a cardboard connector's two slots clear each other. */
export function cardboardSetback(ctx: EdgeCtx, c: JoineryParams['cardboard']) {
  const inside = Math.max(0.2, Math.PI - ctx.foldAngle);
  return Math.min(ctx.thickness * 6 + c.wall, (ctx.thickness / 2 + c.wall / 2) / Math.tan(inside / 2) + 0.3);
}

/** Holes on the LEGO grid along a seam, for Technic pins or axles. */
export function legoRow(ctx: EdgeCtx, f: Features, J: JoineryParams): number {
  const d = LEGO_HOLE + J.lego.fit;
  const pitch = LEGO_PITCH * Math.max(1, Math.round(J.lego.pitch));
  const off = LEGO_PITCH / 2 + 0.6;
  const n = Math.max(1, Math.floor((ctx.len - LEGO_PITCH) / pitch) + 1);
  const span = (n - 1) * pitch;
  for (let i = 0; i < n; i++) {
    const q = ctx.toXY((ctx.len - span) / 2 + i * pitch, -off);
    f.holes.push({ x: q[0], y: q[1], r: d / 2 });
  }
  return n;
}

export function seamFeature(J: JoineryParams, o: SeamOptions) {
  const holeD = pinHoleDiameter(J);
  return (ctx: EdgeCtx, F: Features) => {
    switch (J.kind) {
      case 'latches':
      case 'flaticulation': // seams between separate pieces cannot be cut in place: fall back to latches
        latches(ctx, F, J.latch);
        break;
      case 'wire':
        wireStitches(ctx, F, J.wire);
        break;
      case 'fingers':
        fingers(ctx, F, J.fingers);
        break;
      case 'screws':
      case 'printed':
        if (holeD > 0) {
          const n = holeRow(ctx, F, holeD);
          if (ctx.male) o.onHoles?.(ctx, n);
        }
        break;
      case 'lego': {
        const n = legoRow(ctx, F, J);
        if (ctx.male) o.onHoles?.(ctx, n);
        break;
      }
      case 'bendtabs':
        seamBendTabs(ctx, F, J.bendtabs);
        break;
      case 'cardboard': {
        // Both panels stop short of the seam; the printed channel grips both edges.
        const r = cardboardSetback(ctx, J.cardboard);
        F.sub.push([ctx.toXY(-1, -r), ctx.toXY(ctx.len + 1, -r), ctx.toXY(ctx.len + 1, 0.05), ctx.toXY(-1, 0.05)]);
        if (ctx.male) {
          const n = Math.max(1, Math.round(ctx.len / Math.max(J.cardboard.pitch, J.cardboard.length * 1.5)));
          o.onClip?.(ctx, n, ((Math.PI - ctx.foldAngle) * 180) / Math.PI);
          // Engraved marks show where each connector goes.
          for (let i = 0; i < n; i++) {
            const s = ((i + 0.5) * ctx.len) / n, h = Math.min(J.cardboard.length, ctx.len) / 2;
            F.engrave.push({ pts: [ctx.toXY(s - h, -r - 1), ctx.toXY(s + h, -r - 1)], kind: 'mark' });
          }
        }
        break;
      }
      case 'none':
        if (o.glueTabWidth > 0 && ctx.male) glueFlap(ctx, F, o.glueTabWidth, 'trapezoid', 45);
        break;
      default:
        // junction hubs grip the corners; crossing clips apply to sections
        break;
    }
  };
}

/** How far in from the seam the seam number must sit to clear the joinery. */
export function seamLabelInset(J: JoineryParams, t: number) {
  const holeD = pinHoleDiameter(J);
  return (ctx: EdgeCtx) => {
    switch (J.kind) {
      case 'screws':
      case 'printed':
        return holeD * 2.2;
      case 'lego':
        return LEGO_PITCH + 1;
      case 'cardboard':
        return cardboardSetback(ctx, J.cardboard) + 2;
      case 'bendtabs':
        return ctx.male ? 0 : Math.max(2 * t, 3) + J.bendtabs.bendRadius + t + 1;
      case 'wire':
        return J.wire.edgeOffset + J.wire.holeDiameter;
      case 'latches':
      case 'flaticulation':
        return ctx.male ? 0 : t * 2 + J.latch.clearance + 2;
      default:
        return 0;
    }
  };
}
