import type { ProjectParams } from './params';
import { hashValue } from './math/rng';

/** Cache keys per pipeline stage: a hash of exactly the inputs each stage reads. */
export function stageKeys(p: ProjectParams) {
  const base = hashValue({ shape: p.shape.source === 'mesh' ? { a: p.shape.meshAsset, u: p.shape.importUnits } : p.shape.source === 'skeleton' ? p.shape.skeleton : p.shape.primitive, s: p.shape.source });
  const surface = hashValue({ base, s: p.surface });
  const methodParams =
    p.method === 'lattice' ? p.lattice : p.method === 'slices' ? p.slices : p.method === 'waffle' ? p.waffle : p.folded;
  const method = hashValue({ surface, m: p.method, mp: methodParams, j: p.joinery, t: p.material.thickness, mat: p.material.minBendRadius, name: p.material.name, sh: p.method === 'lattice' || p.method === 'folded' ? [p.sheet.width, p.sheet.height, p.sheet.margin] : 0 });
  const nest = hashValue({ method, sheet: p.sheet, nest: p.nest });
  return { base, surface, method, nest };
}

