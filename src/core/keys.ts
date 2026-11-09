/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import type { ProjectParams } from './params';
import { hashValue } from './math/rng';

/** Cache keys per pipeline stage: a hash of exactly the inputs each stage reads. */
export function stageKeys(p: ProjectParams) {
  const base = hashValue({ shape: p.shape.source === 'mesh' ? { a: p.shape.meshAsset, u: p.shape.importUnits } : p.shape.source === 'skeleton' ? p.shape.skeleton : p.shape.primitive, s: p.shape.source });
  const surface = hashValue({ base, s: p.surface });
  const methodParams = p[p.method];
  const M = p.manufacturing;
  // Only what the geometry reads: the process, CNC reliefs and the print bed.
  const mf = M ? { pr: M.process, cnc: M.process === 'cnc' ? [M.cnc.toolDiameter, M.cnc.dogbones, M.cnc.dogboneStyle] : 0, bed: M.process === 'print3d' ? [M.print.bedW, M.print.bedH, M.print.brim] : 0 } : 0;
  const sheetDependent = p.method === 'lattice' || p.method === 'folded' || p.method === 'papercraft' || p.method === 'minimal' || p.method === 'flexhinge';
  const method = hashValue({ surface, m: p.method, mp: methodParams, j: p.joinery, t: p.material.thickness, mat: p.material.minBendRadius, name: p.material.name, sh: sheetDependent ? [p.sheet.width, p.sheet.height, p.sheet.margin] : 0, mf });
  const nest = hashValue({ method, sheet: p.sheet, nest: p.nest, bed: mf });
  return { base, surface, method, nest };
}

