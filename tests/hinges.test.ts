/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { describe, expect, it, beforeAll } from 'vitest';
import { defaultProject } from '../src/core/defaults';
import { buildBase, prepareSurface, runMethod, runNest } from '../src/core/pipeline';
import { buildKit } from '../src/core/connectors/kit';
import { HINGE_PATTERNS, RELIEF_PATTERNS, bendRelief, hingeFill } from '../src/core/joinery/hinges';
import { emptyFeatures, type EdgeCtx } from '../src/core/joinery/edgeFeatures';
import { flatHub } from '../src/core/joinery/flatHub';
import type { ProjectParams } from '../src/core/params';
import type { ManifoldToplevel } from 'manifold-3d';

let W: ManifoldToplevel;
beforeAll(async () => {
  const Module = (await import('manifold-3d')).default;
  W = await Module();
  W.setup();
});

function run(p: ProjectParams, tag = '') {
  const base = buildBase(p.shape, undefined);
  const { mesh } = prepareSurface(base, p.surface);
  const method = runMethod(mesh, p);
  const nest = runNest(method, p);
  console.log(tag || p.method, { parts: method.parts.length, sheets: nest.sheets.length, stats: method.stats, warnings: method.warnings });
  return method;
}

const cutCount = (r: ReturnType<typeof run>) => r.parts.reduce((s, q) => s + q.cut.length + q.holes.length + (q.perforations?.length ?? 0), 0);

describe('pattern geometry', () => {
  it('every living-hinge pattern cuts something', () => {
    for (const p of HINGE_PATTERNS) {
      const c = hingeFill([[[0, 0], [60, 0], [60, 30], [0, 30]]], [1, 0], { pattern: p.id, cutLength: 12, bridge: 3, spacing: 4, slotWidth: 1.2 });
      expect(c.lines.length + c.holes.length + c.circles.length, p.id).toBeGreaterThan(5);
      if (p.closed) expect(c.holes.length, p.id).toBeGreaterThan(5);
    }
  });
  it('every bend-relief pattern cuts slots or holes along the fold', () => {
    const ctx: EdgeCtx = { A: [0, 0], B: [120, 0], len: 120, toXY: (s, n) => [s, n], male: true, foldAngle: 1, convex: true, num: 0, thickness: 2 };
    for (const p of RELIEF_PATTERNS) {
      const F = emptyFeatures();
      bendRelief(ctx, F, { pattern: p.id, width: 0.6, tab: 1.5, slotLength: 20, endRelief: 'round' });
      expect(F.sub.length + F.holes.length, p.id).toBeGreaterThan(3);
      // Tabs: no cut reaches the ends of the fold (except the end relief).
      for (const s of F.sub) for (const q of s) expect(q[0]).toBeGreaterThan(1);
    }
  });
});

describe('1.1.2 methods', () => {
  for (const pattern of ['slots', 'wave', 'holes'] as const)
    it(`folded panels with ${pattern} bend relief`, () => {
      const p = defaultProject();
      p.method = 'folded';
      p.folded.targetFaces = 160;
      const base = cutCount(run(p, 'folded/score'));
      p.folded.foldLine = 'relief';
      p.folded.relief.pattern = pattern;
      const r = run(p, `folded/relief/${pattern}`);
      expect(r.stats.reliefFolds).toBeGreaterThan(10);
      expect(cutCount(r)).toBeGreaterThan(base);
    }, 120000);
  it('folded panels with living hinges at the folds', () => {
    const p = defaultProject();
    p.method = 'folded';
    p.folded.targetFaces = 160;
    p.folded.foldLine = 'hinge';
    p.folded.hinge.pattern = 'diamond';
    p.folded.hinge.spacing = 3;
    const r = run(p, 'folded/hinge/diamond');
    expect(r.stats.hingeFolds).toBeGreaterThan(5);
  }, 120000);
  for (const pattern of ['rectangles', 'serpentine', 'hexagon', 'bones'] as const)
    it(`flex hinges with ${pattern}`, () => {
      const p = defaultProject();
      p.method = 'flexhinge';
      p.flexhinge.targetFaces = 300;
      p.flexhinge.pattern = pattern;
      p.flexhinge.spacing = 3;
      p.flexhinge.align = pattern === 'serpentine' ? 'fold' : 'piece';
      const r = run(p, `flexhinge/${pattern}`);
      expect(r.stats.hingeArea).toBeGreaterThan(100);
      expect(r.parts.some((q) => q.cut.length > 3 || (q.perforations?.length ?? 0) > 10 || q.holes.length > 10)).toBe(true);
    }, 120000);
});

describe('junction hub versions', () => {
  it('support-free hubs and flat hubs', () => {
    const p = defaultProject();
    p.method = 'sticks';
    p.joinery.kind = 'junction';
    p.sticks.targetFaces = 120;
    p.joinery.junction.style = 'printable';
    const r = run(p, 'sticks/printable');
    const split = buildKit(W, { kind: 'junction', joinery: p.joinery, thickness: 1, data: r.connectorData }, 2);
    expect(split.length).toBe(2);
    expect(split[0].name).toContain('_nosupport');
    expect(split[0].mesh.indices.length).toBeGreaterThan(100);
    p.joinery.junction.style = 'flat';
    const flat = buildKit(W, { kind: 'junction', joinery: p.joinery, thickness: 1, data: r.connectorData }, 2);
    expect(flat[0].name).toContain('_flat');
    expect(flat[0].mesh.indices.length).toBeGreaterThan(50);
    const fh = flatHub(r.connectorData!.junctions![0], p.joinery.junction);
    expect(fh.arms.length).toBe(r.connectorData!.junctions![0].arms.length);
    expect(fh.arms.some((a) => Math.abs(a.angle) > 1)).toBe(true);
  }, 120000);
  it('flat hubs cut from the sheet, with matching screw holes in the panels', () => {
    const p = defaultProject();
    p.method = 'folded';
    p.folded.targetFaces = 160;
    p.joinery.kind = 'junction';
    const solid = run(p, 'folded/junction/solid');
    p.joinery.junction.style = 'flat';
    p.joinery.junction.flatOnSheet = true;
    const r = run(p, 'folded/junction/flat');
    const hubs = r.parts.filter((q) => q.groupName === 'Hubs');
    expect(hubs.length).toBe(r.connectorData!.junctions!.length);
    expect(hubs.every((q) => q.score.length > 0 || q.holes.length > 0)).toBe(true);
    const panelHoles = (x: typeof r) => x.parts.filter((q) => q.groupName !== 'Hubs').reduce((s, q) => s + q.holes.length, 0);
    expect(panelHoles(r)).toBeGreaterThan(panelHoles(solid));
  }, 120000);
  it('support-free panel hubs have shelves with screw holes matching the panels', () => {
    const p = defaultProject();
    p.method = 'triangles';
    p.joinery.kind = 'junction';
    const solid = run(p, 'triangles/junction/solid');
    p.joinery.junction.style = 'printable';
    const r = run(p, 'triangles/junction/printable');
    const kit = buildKit(W, { kind: 'junction', joinery: p.joinery, thickness: p.material.thickness, data: r.connectorData }, 1);
    expect(kit[0].name).toContain('_nosupport');
    expect(kit[0].mesh.indices.length).toBeGreaterThan(100);
    const holes = (x: typeof r) => x.parts.reduce((s, q) => s + q.holes.length, 0);
    expect(holes(r)).toBeGreaterThan(holes(solid));
  }, 120000);
});
