/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/** Map the project's joinery choice onto seam features (both sides of a cut edge). */
import type { JoineryParams } from '../params';
import { fingers, glueFlap, holeRow, latches, wireStitches, type EdgeCtx, type Features } from './edgeFeatures';
import { pinHoleDiameter } from './holes';

export interface SeamOptions {
  /** Glue tabs when joinery is "none" (width in mm, 0 = off). */
  glueTabWidth: number;
  /** Called per hole row on the male side (for brackets and connector counts). */
  onHoles?: (ctx: EdgeCtx, count: number) => void;
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
      case 'none':
        if (o.glueTabWidth > 0 && ctx.male) glueFlap(ctx, F, o.glueTabWidth, 'trapezoid', 45);
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
