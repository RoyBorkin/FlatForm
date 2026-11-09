import type { MeshData } from '../types';
import { buildTopology } from './mesh';

/**
 * Relax a surface like a soap film held by its open rims (what Kangaroo does
 * in the reference workflow). Boundary vertices are anchors.
 *  - 'minimal': Laplacian flow toward a minimal surface. Needs openings,
 *    otherwise a closed surface just shrinks.
 *  - 'smooth': Taubin λ/μ smoothing, which removes noise without shrinking.
 */
export function relaxSurface(m: MeshData, mode: 'minimal' | 'smooth', iterations: number, strength: number): MeshData {
  const topo = buildTopology(m);
  const nv = m.positions.length / 3;
  let p = m.positions.slice();
  let hasBoundary = false;
  for (let i = 0; i < nv; i++) if (topo.boundaryVertex[i]) hasBoundary = true;
  const effectiveMode = mode === 'minimal' && !hasBoundary ? 'smooth' : mode;
  const step = (lambda: number) => {
    const out = p.slice();
    for (let v = 0; v < nv; v++) {
      if (topo.boundaryVertex[v]) continue;
      const nb = topo.vertexNeighbors[v];
      if (!nb.length) continue;
      let cx = 0, cy = 0, cz = 0;
      for (const w of nb) {
        cx += p[w * 3];
        cy += p[w * 3 + 1];
        cz += p[w * 3 + 2];
      }
      const k = 1 / nb.length;
      out[v * 3] += lambda * (cx * k - p[v * 3]);
      out[v * 3 + 1] += lambda * (cy * k - p[v * 3 + 1]);
      out[v * 3 + 2] += lambda * (cz * k - p[v * 3 + 2]);
    }
    p = out;
  };
  const lam = 0.15 + 0.5 * strength;
  for (let i = 0; i < iterations; i++) {
    if (effectiveMode === 'minimal') step(lam);
    else {
      step(lam);
      step(-(lam + 0.02));
    }
  }
  return { positions: p, indices: m.indices };
}
