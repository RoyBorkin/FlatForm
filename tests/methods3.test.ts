/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { describe, expect, it, beforeAll } from 'vitest';
import { defaultProject } from '../src/core/defaults';
import { buildBase, prepareSurface, runMethod, runNest } from '../src/core/pipeline';
import { buildKit } from '../src/core/connectors/kit';
import { bomCsv, brickInstructions, cutListCsv, ldraw } from '../src/io/export/kitExports';
import { kitWeight } from '../src/core/manufacturing/manufacturing';
import type { JoineryKind, ProjectParams } from '../src/core/params';
import type { ManifoldToplevel } from 'manifold-3d';

let W: ManifoldToplevel;
beforeAll(async () => {
  // In Node, Emscripten finds manifold.wasm next to its JS by itself.
  const Module = (await import('manifold-3d')).default;
  W = await Module();
  W.setup();
});

function run(p: ProjectParams, tag = '') {
  const base = buildBase(p.shape, undefined);
  const { mesh } = prepareSurface(base, p.surface);
  const t0 = performance.now();
  const method = runMethod(mesh, p);
  const nest = runNest(method, p);
  const cd = method.connectorData;
  console.log(tag || `${p.method}/${p.joinery.kind}`, {
    parts: method.parts.length,
    sheets: nest.sheets.length,
    ms: Math.round(performance.now() - t0),
    stats: method.stats,
    junctions: cd?.junctions?.length,
    crossClips: cd?.crossClips,
    seamClips: cd?.seamClips?.length,
    collars: cd?.collars,
    kit: method.kit ? { sticks: method.kit.sticks?.length, stock: method.kit.stickStock, bricks: method.kit.bricks?.length } : undefined,
    warnings: method.warnings,
  });
  return method;
}

const prim = (p: ProjectParams, kind: ProjectParams['shape']['primitive']['kind'] = 'blob') => {
  p.shape.source = 'primitive';
  p.shape.primitive.kind = kind;
  p.shape.primitive.openTop = false;
  p.shape.primitive.openBottom = false;
  return p;
};

describe('1.1 methods', () => {
  it('sticks with junction hubs, and printable hubs', () => {
    const p = defaultProject();
    p.method = 'sticks';
    p.joinery.kind = 'junction';
    p.sticks.targetFaces = 160;
    const r = run(p);
    expect(r.kit?.sticks?.length).toBeGreaterThan(1);
    expect(r.connectorData?.junctions?.length).toBeGreaterThan(10);
    const hubs = buildKit(W, { kind: 'junction', joinery: p.joinery, thickness: p.material.thickness, data: r.connectorData }, 3);
    expect(hubs.length).toBe(3);
    for (const h of hubs) expect(h.mesh.indices.length).toBeGreaterThan(100);
    const csv = cutListCsv(r);
    expect(csv.split('\n')[1]).toMatch(/^A,\d/);
    expect(kitWeight(r.kit, p).weight).toBeGreaterThan(1);
  }, 120000);
  it('sticks as flat strips', () => {
    const p = defaultProject();
    p.method = 'sticks';
    p.sticks.profile = 'flat';
    p.sticks.size = 10;
    p.joinery.kind = 'junction';
    p.sticks.targetFaces = 120;
    const r = run(p);
    expect(r.parts.length).toBeGreaterThan(10);
  }, 120000);
  it('LEGO bricks', () => {
    const p = defaultProject();
    p.method = 'bricks';
    p.joinery.kind = 'none';
    const r = run(p);
    expect(r.kit?.bricks?.length).toBeGreaterThan(20);
    const ldr = ldraw(r, 'Test');
    const lines = ldr.split('\r\n').filter((l) => l.startsWith('1 '));
    expect(lines.length).toBe(r.kit!.bricks!.length);
    expect(lines[0]).toMatch(/^1 \d+ -?[\d.]+ -?[\d.]+ -?[\d.]+ ([-\d]+ ){9}\d+\.dat$/);
    expect(bomCsv(r).split('\n').length).toBeGreaterThan(2);
    expect(brickInstructions(r, 'Test').size).toBeGreaterThan(2000);
    expect(kitWeight(r.kit, p).weight).toBeGreaterThan(10);
    const bricks = buildKit(W, { kind: 'bricks', joinery: p.joinery, thickness: 1, bricks: [{ w: 4, d: 2, plate: false, count: 1 }, { w: 2, d: 1, plate: true, count: 1 }] });
    expect(bricks.length).toBe(2);
  }, 120000);
  for (const mode of ['relief', 'solid', 'laminate', 'shells'] as const)
    it(`stack ${mode}`, () => {
      const p = prim(defaultProject(), mode === 'shells' ? 'sphere' : 'blob');
      p.method = 'stack';
      p.stack.mode = mode;
      p.material.thickness = 3;
      p.joinery.kind = mode === 'shells' ? 'cardboard' : 'bendtabs';
      if (mode === 'solid') p.stack.count = 0;
      if (mode === 'shells') p.stack.count = 2;
      if (mode === 'laminate') p.stack.count = 3;
      const r = run(p, `stack/${mode}/${p.joinery.kind}`);
      expect(r.parts.length).toBeGreaterThan(1);
    }, 180000);
});

describe('1.1 joinery', () => {
  const combos: [ProjectParams['method'], JoineryKind][] = [
    ['triangles', 'junction'],
    ['triangles', 'cardboard'],
    ['triangles', 'bendtabs'],
    ['folded', 'cardboard'],
    ['folded', 'junction'],
    ['folded', 'lego'],
    ['meshlines', 'junction'],
    ['lattice', 'junction'],
    ['classic', 'crossing'],
    ['waffle', 'crossing'],
    ['slices', 'crossing'],
    ['slices', 'bendtabs'],
    ['papercraft', 'bendtabs'],
  ];
  for (const [method, kind] of combos)
    it(`${method} + ${kind}`, () => {
      const p = method === 'slices' ? prim(defaultProject(), 'roundedBox') : defaultProject();
      p.method = method;
      p.joinery.kind = kind;
      if (method === 'slices') {
        p.slices.spacingMode = 'thickness';
        p.slices.hollow = false;
        p.material.thickness = 3;
      }
      const r = run(p);
      expect(r.parts.length).toBeGreaterThan(1);
      const cd = r.connectorData;
      if (kind === 'junction') expect(cd?.junctions?.length).toBeGreaterThan(0);
      if (kind === 'cardboard') expect(cd?.seamClips?.length).toBeGreaterThan(0);
      if (kind === 'crossing') expect((cd?.crossClips?.length ?? 0) + (cd?.collars?.count ?? 0)).toBeGreaterThan(0);
      if (kind === 'bendtabs') expect(r.stats.tabs ?? r.parts.some((x) => x.score.length)).toBeTruthy();
      if (kind === 'junction' || kind === 'cardboard' || kind === 'crossing') {
        const parts = buildKit(W, { kind, joinery: p.joinery, thickness: p.material.thickness, data: cd }, 2);
        expect(parts.length).toBeGreaterThan(0);
      }
    }, 180000);
});
