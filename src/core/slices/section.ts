/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import type { Path2 } from '../types';
import { difference, offsetPolygons, strokePaths, union } from '../polygon/polygon';
import { basisMatrix, type M4 } from '../math/vec';
import type { PlaneFrame } from '../mesh/slice';

/**
 * Turn a planar section into a cuttable region:
 *  - closed loops are filled (even-odd, so inner loops become holes),
 *  - open chains (from open surfaces) are thickened into a band of `wall`,
 *  - `hollow` keeps only a ring of `wall` inside closed loops.
 */
export function sectionRegion(closed: Path2[], open: Path2[], wall: number, hollow: boolean): Path2[] {
  let region: Path2[] = [];
  if (closed.length) {
    const solid = union(closed, 'evenodd');
    region = hollow ? difference(solid, offsetPolygons(solid, -wall)) : solid;
  }
  if (open.length) {
    const band = strokePaths(open, wall / 2, 'round', 'round');
    region = union([...region, ...band]);
  }
  return region;
}

/** Matrix mapping part (u, v, w) → world for a plane at offset `d` along n. */
export function planeMatrix(f: PlaneFrame, d: number): M4 {
  return basisMatrix(f.u, f.v, f.n, [f.n[0] * d, f.n[1] * d, f.n[2] * d]);
}
