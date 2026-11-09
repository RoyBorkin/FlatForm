/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import type { MeshData } from '../types';
import type { SkeletonParams } from '../params';
import { surfaceNets, smin, sdTaperedCapsule } from './surfaceNets';
import { clipByPlane } from '../mesh/clip';
import { largestComponent } from '../mesh/mesh';
import { norm3, sub3, dot3, type V3 } from '../math/vec';

/** Degree of each node. */
export function nodeDegrees(s: SkeletonParams): Map<number, number> {
  const deg = new Map<number, number>();
  for (const n of s.nodes) deg.set(n.id, 0);
  for (const e of s.edges) {
    deg.set(e.a, (deg.get(e.a) ?? 0) + 1);
    deg.set(e.b, (deg.get(e.b) ?? 0) + 1);
  }
  return deg;
}

/**
 * Skeleton lines → smooth tubular body (the MultiPipe step). The body is the
 * smooth union of tapered capsules, polygonised with Surface Nets; leaf nodes
 * marked open are cut flat exactly at the node so the rim sits where the
 * line ends.
 */
export function skeletonToMesh(s: SkeletonParams): MeshData {
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const segs = s.edges
    .map((e) => ({ a: byId.get(e.a), b: byId.get(e.b) }))
    .filter((e): e is { a: NonNullable<typeof e.a>; b: NonNullable<typeof e.b> } => !!e.a && !!e.b && e.a !== e.b);
  if (segs.length === 0) return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  const k = Math.max(0, s.blend);
  const f = (x: number, y: number, z: number) => {
    let d = Infinity;
    for (const sg of segs) {
      const di = sdTaperedCapsule(x, y, z, sg.a.p, sg.b.p, sg.a.r, sg.b.r);
      d = d === Infinity ? di : smin(d, di, k);
    }
    return d;
  };
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const n of s.nodes) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], n.p[i] - n.r - k * 0.5);
      max[i] = Math.max(max[i], n.p[i] + n.r + k * 0.5);
    }
  }
  let m = surfaceNets(f, min, max, s.resolution);
  m = largestComponent(m);

  // Open the leaves. Each vertex belongs to the skeleton segment it is
  // closest to; a leaf's cut only touches vertices of its own segment, so
  // nearby tubes are never nicked.
  const deg = nodeDegrees(s);
  for (const n of s.nodes) {
    if (!n.open || deg.get(n.id) !== 1) continue;
    const ei = segs.findIndex((sg) => sg.a.id === n.id || sg.b.id === n.id);
    if (ei < 0) continue;
    const other = segs[ei].a.id === n.id ? segs[ei].b : segs[ei].a;
    const dir = norm3(sub3(n.p, other.p));
    const nv = m.positions.length / 3;
    const mask = new Uint8Array(nv);
    for (let v = 0; v < nv; v++) {
      const x = m.positions[v * 3], y = m.positions[v * 3 + 1], z = m.positions[v * 3 + 2];
      let best = -1, bd = Infinity;
      for (let k = 0; k < segs.length; k++) {
        const d = sdTaperedCapsule(x, y, z, segs[k].a.p, segs[k].b.p, segs[k].a.r, segs[k].b.r);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      mask[v] = best === ei ? 1 : 0;
    }
    m = clipByPlane(m, dir, dot3(dir, n.p), mask);
  }
  return m;
}
