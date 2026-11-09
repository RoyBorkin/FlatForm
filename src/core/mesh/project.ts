import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { MeshData } from '../types';
import { buildTopology } from './mesh';

/** Closest-point projection onto a reference surface (BVH accelerated). */
export class MeshProjector {
  private bvh: MeshBVH;
  constructor(ref: MeshData) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(ref.positions.slice(), 3));
    g.setIndex(new BufferAttribute(ref.indices.slice(), 1));
    this.bvh = new MeshBVH(g);
  }

  closest(x: number, y: number, z: number): [number, number, number] {
    const hit = this.bvh.closestPointToPoint(new Vector3(x, y, z));
    if (!hit) return [x, y, z];
    return [hit.point.x, hit.point.y, hit.point.z];
  }

  /** Project interior vertices; boundary vertices stay put to keep openings crisp. */
  project(m: MeshData): MeshData {
    const topo = buildTopology(m);
    const p = m.positions.slice();
    const target = new Vector3();
    const q = new Vector3();
    for (let v = 0; v < p.length / 3; v++) {
      if (topo.boundaryVertex[v]) continue;
      q.set(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
      const hit = this.bvh.closestPointToPoint(q, { point: target, distance: 0, faceIndex: 0 } as never);
      if (hit) {
        p[v * 3] = hit.point.x;
        p[v * 3 + 1] = hit.point.y;
        p[v * 3 + 2] = hit.point.z;
      }
    }
    return { positions: p, indices: m.indices };
  }
}
