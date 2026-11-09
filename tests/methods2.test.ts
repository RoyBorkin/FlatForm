/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { describe, expect, it } from 'vitest';
import { defaultProject } from '../src/core/defaults';
import { buildBase, prepareSurface, runMethod, runNest } from '../src/core/pipeline';
import { triCount } from '../src/core/mesh/mesh';
import { estimate } from '../src/core/manufacturing/manufacturing';
import type { MethodKind, ProjectParams } from '../src/core/params';

function run(p: ProjectParams) {
  const base = buildBase(p.shape, undefined);
  const { mesh } = prepareSurface(base, p.surface);
  const t0 = performance.now();
  const method = runMethod(mesh, p);
  const t1 = performance.now();
  const nest = runNest(method, p);
  const t2 = performance.now();
  const e = estimate(method.parts, p);
  console.log(p.method, p.manufacturing.process, { surf: triCount(mesh), parts: method.parts.length, sheets: nest.sheets.length, unplaced: nest.unplaced.length, ms: [t1 - t0, t2 - t1].map(Math.round), grams: Math.round(e.weight), warnings: method.warnings, stats: method.stats });
  return { method, nest };
}

const NEW: MethodKind[] = ['papercraft', 'minimal', 'flexhinge', 'layers', 'meshlines', 'triangles', 'classic'];

describe('new methods', () => {
  for (const m of NEW)
    it(m, () => {
      const p = defaultProject();
      p.method = m;
      if (m === 'papercraft') p.joinery.kind = 'none';
      if (m === 'minimal') p.joinery.kind = 'wire';
      if (m === 'flexhinge') p.joinery.kind = 'fingers';
      if (m === 'triangles') p.joinery.kind = 'wire';
      const r = run(p);
      expect(r.method.parts.length).toBeGreaterThan(1);
      for (const part of r.method.parts) expect(part.cut[0].length).toBeGreaterThan(2);
    }, 180000);
  it('minimal joinery on a vase keeps few pieces', () => {
    const p = defaultProject();
    p.shape.source = 'primitive';
    p.method = 'minimal';
    p.joinery.kind = 'wire';
    const r = run(p);
    expect(r.method.stats.pieces).toBeLessThan(30);
  }, 120000);
  it('layers with rods and spacers', () => {
    const p = defaultProject();
    p.shape.source = 'primitive';
    p.shape.primitive.kind = 'blob';
    p.shape.primitive.openTop = false;
    p.shape.primitive.openBottom = false;
    p.method = 'layers';
    p.layers.elevation = 0;
    const r = run(p);
    expect(r.method.stats.spacers).toBeGreaterThan(4);
  }, 120000);
  it('layers along a curve with spacers', () => {
    const p = defaultProject();
    p.shape.source = 'primitive';
    p.shape.primitive.kind = 'capsule';
    p.method = 'layers';
    p.layers.mode = 'curve';
    const r = run(p);
    expect(r.method.parts.length).toBeGreaterThan(3);
  }, 120000);
  it('classic grid and curve', () => {
    for (const style of ['grid', 'curve'] as const) {
      const p = defaultProject();
      p.method = 'classic';
      p.classic.style = style;
      const r = run(p);
      expect(r.method.stats.joints).toBeGreaterThan(2);
    }
  }, 120000);
  it('folded with flaticulation and CNC dog-bones', () => {
    const p = defaultProject();
    p.method = 'folded';
    p.joinery.kind = 'flaticulation';
    p.material.thickness = 3;
    p.manufacturing.process = 'cnc';
    const r = run(p);
    expect(r.method.stats.flaticulated).toBeGreaterThan(0);
    expect(r.method.stats.dogbones).toBeGreaterThan(0);
  }, 120000);
  it('3D print uses the bed', () => {
    const p = defaultProject();
    p.method = 'slices';
    p.manufacturing.process = 'print3d';
    const r = run(p);
    for (const s of r.nest.sheets) expect(s.width).toBe(p.manufacturing.print.bedW);
  }, 120000);
});
