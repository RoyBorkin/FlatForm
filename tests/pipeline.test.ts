import { describe, expect, it } from 'vitest';
import { defaultProject } from '../src/core/defaults';
import { buildBase, prepareSurface, runMethod, runNest } from '../src/core/pipeline';
import { bbox, triCount, buildTopology } from '../src/core/mesh/mesh';
import { surfaceNets } from '../src/core/modeling/surfaceNets';
import { primitiveToMesh } from '../src/core/modeling/primitives';
import type { ProjectParams } from '../src/core/params';

function signedVolume(m: { positions: Float32Array; indices: Uint32Array }) {
  let v = 0;
  const p = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t] * 3, b = m.indices[t + 1] * 3, c = m.indices[t + 2] * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return v;
}

describe('modeling', () => {
  it('surface nets builds an outward, watertight sphere', () => {
    const m = surfaceNets((x, y, z) => Math.hypot(x, y, z) - 50, [-55, -55, -55], [55, 55, 55], 40);
    const vol = signedVolume(m);
    expect(vol).toBeGreaterThan(0.9 * (4 / 3) * Math.PI * 50 ** 3);
    const topo = buildTopology(m);
    expect(Array.from(topo.edgeT1).every((t) => t >= 0)).toBe(true);
  });
  it('builds every primitive', () => {
    for (const kind of ['sphere', 'torus', 'roundedBox', 'capsule', 'vase', 'blob', 'twistedTower', 'saddle', 'lampshade', 'knot'] as const) {
      const m = primitiveToMesh({ kind, size: 200, a: 0.5, b: 0.5, c: 0.5, seed: 1, openTop: false, openBottom: false, resolution: 40 });
      expect(triCount(m), kind).toBeGreaterThan(50);
    }
  });
});

function run(p: ProjectParams) {
  const t0 = performance.now();
  const base = buildBase(p.shape, undefined);
  const t1 = performance.now();
  const { mesh } = prepareSurface(base, p.surface);
  const t2 = performance.now();
  const method = runMethod(mesh, p);
  const t3 = performance.now();
  const nest = runNest(method, p);
  const t4 = performance.now();
  console.log(p.method, { baseTris: triCount(base), surfTris: triCount(mesh), parts: method.parts.length, sheets: nest.sheets.length, unplaced: nest.unplaced.length, ms: [t1 - t0, t2 - t1, t3 - t2, t4 - t3].map(Math.round), warnings: method.warnings, stats: method.stats });
  return { base, mesh, method, nest };
}

describe('pipeline', () => {
  it('lattice (default project)', () => {
    const p = defaultProject();
    const r = run(p);
    const b = bbox(r.mesh);
    expect(b.min[2]).toBeCloseTo(0, 1);
    expect(triCount(r.mesh)).toBeGreaterThan(1200);
    expect(triCount(r.mesh)).toBeLessThan(3200);
    expect(r.method.parts.length).toBeGreaterThan(150);
    expect(r.nest.unplaced.length).toBe(0);
  }, 120000);
  it('slices', () => {
    const p = defaultProject();
    p.method = 'slices';
    p.material = { ...p.material, thickness: 3 };
    const r = run(p);
    expect(r.method.parts.length).toBeGreaterThan(10);
  }, 120000);
  it('waffle', () => {
    const p = defaultProject();
    p.method = 'waffle';
    p.shape.source = 'primitive';
    p.shape.primitive.openTop = false;
    p.shape.primitive.openBottom = false;
    p.surface.relax = 'off';
    const r = run(p);
    expect(r.method.parts.length).toBeGreaterThan(8);
    expect(r.method.stats.joints).toBeGreaterThan(10);
  }, 120000);
  it('folded with latches', () => {
    const p = defaultProject();
    p.method = 'folded';
    p.joinery.kind = 'latches';
    p.shape.source = 'primitive';
    p.shape.primitive.kind = 'blob';
    p.surface.relax = 'off';
    const r = run(p);
    expect(r.method.parts.length).toBeGreaterThan(1);
  }, 120000);
});
