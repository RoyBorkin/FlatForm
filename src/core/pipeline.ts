/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/**
 * The geometry pipeline, stage by stage. Each stage is keyed by a hash of
 * exactly the inputs it depends on, so changing the sheet size never
 * re-runs the remesher, and changing the strip width never re-slices.
 */
import type { MeshData, MethodResult, NestResult } from './types';
import type { ProjectParams, ShapeParams, SurfaceParams } from './params';
import { stageKeys } from './keys';
import { effectiveSheet } from './manufacturing/manufacturing';
import { skeletonToMesh } from './modeling/skeleton';
import { primitiveToMesh } from './modeling/primitives';
import { bbox, transformMesh, translateMesh, triCount } from './mesh/mesh';
import { clipByPlane } from './mesh/clip';
import { remesh, edgeLengthForTriangles } from './mesh/remesh';
import { relaxSurface } from './mesh/relax';
import { buildLattice } from './lattice/lattice';
import { buildSlices } from './slices/slices';
import { buildWaffle } from './waffle/waffle';
import { buildFolded } from './folded/folded';
import { buildPapercraft, buildMinimal, buildFlexHinge } from './unfold/methods';
import { buildLayers } from './sections/layers';
import { buildClassic } from './sections/classic';
import { buildMeshLines } from './frame/meshlines';
import { buildTriangles } from './frame/triangles';
import { applyManufacturing } from './manufacturing/manufacturing';
import { nestParts } from './nest/nest';
import type { V3 } from './math/vec';

export { stageKeys };

export type ProgressFn = (stage: string, fraction: number) => void;

const UNIT: Record<ShapeParams['importUnits'], number> = { mm: 1, cm: 10, m: 1000, in: 25.4 };

export function buildBase(shape: ShapeParams, asset: MeshData | undefined): MeshData {
  if (shape.source === 'skeleton') return skeletonToMesh(shape.skeleton);
  if (shape.source === 'primitive') return primitiveToMesh(shape.primitive);
  if (!asset) return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  const k = UNIT[shape.importUnits] ?? 1;
  return k === 1 ? asset : transformMesh(asset, [k, k, k], [0, 0, 0]);
}

/** Scale, orient, place, open, remesh and relax the working surface. */
export function prepareSurface(base: MeshData, s: SurfaceParams, progress?: ProgressFn): { mesh: MeshData; warnings: string[] } {
  const warnings: string[] = [];
  if (triCount(base) === 0) return { mesh: base, warnings: ['There is no shape yet.'] };
  let m = transformMesh(base, s.scale, s.rotation);
  let b = bbox(m);
  m = translateMesh(m, [-b.center[0], -b.center[1], s.dropToFloor ? -b.min[2] : -b.center[2]]);
  b = bbox(m);
  for (const c of s.cutPlanes) {
    if (!c.enabled) continue;
    const ax = c.axis.replace('-', '') as 'x' | 'y' | 'z';
    const i = ax === 'x' ? 0 : ax === 'y' ? 1 : 2;
    const neg = c.axis.startsWith('-');
    const at = b.min[i] + b.size[i] * c.offset;
    const n: V3 = [0, 0, 0];
    n[i] = neg ? -1 : 1;
    m = clipByPlane(m, n, neg ? -at : at);
  }
  if (triCount(m) === 0) return { mesh: m, warnings: ['The cut planes removed the whole shape.'] };
  progress?.('Remeshing', 0.05);
  if (s.remesh) {
    const L = edgeLengthForTriangles(m, s.targetTriangles);
    m = remesh(m, { targetEdge: L, iterations: s.remeshIterations, onProgress: (f) => progress?.('Remeshing', 0.05 + f * 0.6) });
    if (s.relax !== 'off' && s.relaxIterations > 0) {
      progress?.('Relaxing', 0.7);
      const relaxed = relaxSurface(m, s.relax, s.relaxIterations, s.relaxStrength);
      m = remesh(relaxed, { targetEdge: L, iterations: 2, reference: relaxed });
    }
  } else if (s.relax !== 'off' && s.relaxIterations > 0) {
    m = relaxSurface(m, s.relax, s.relaxIterations, s.relaxStrength);
  }
  if (s.dropToFloor) {
    const fb = bbox(m);
    m = translateMesh(m, [0, 0, -fb.min[2]]);
  }
  progress?.('Surface ready', 1);
  return { mesh: m, warnings };
}

export function runMethod(surface: MeshData, p: ProjectParams, progress?: ProgressFn): MethodResult {
  return applyManufacturing(buildMethod(surface, p, progress), p);
}

function buildMethod(surface: MeshData, p: ProjectParams, progress?: ProgressFn): MethodResult {
  const on = (f: number, st: string) => progress?.(st, f);
  const common = { surface, joinery: p.joinery, material: p.material, sheet: effectiveSheet(p), onProgress: on };
  switch (p.method) {
    case 'lattice':
      return buildLattice({ ...common, params: p.lattice });
    case 'slices':
      return buildSlices(surface, p.slices, p.joinery, p.material, on);
    case 'waffle':
      return buildWaffle(surface, p.waffle, p.material, on);
    case 'folded':
      return buildFolded({ ...common, params: p.folded });
    case 'papercraft':
      return buildPapercraft({ ...common, params: p.papercraft });
    case 'minimal':
      return buildMinimal({ ...common, params: p.minimal });
    case 'flexhinge':
      return buildFlexHinge({ ...common, params: p.flexhinge });
    case 'layers':
      return buildLayers(surface, p.layers, p.joinery, p.material, on);
    case 'meshlines':
      return buildMeshLines(surface, p.meshlines, p.joinery, p.material, on);
    case 'triangles':
      return buildTriangles({ ...common, params: p.triangles });
    case 'classic':
      return buildClassic(surface, p.classic, p.material, on);
  }
}

export function runNest(method: MethodResult, p: ProjectParams, progress?: ProgressFn): NestResult {
  return nestParts({ parts: method.parts, sheet: effectiveSheet(p), nest: p.nest, onProgress: (f) => progress?.('Nesting', f) });
}
