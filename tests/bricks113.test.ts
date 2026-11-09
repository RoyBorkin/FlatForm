/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { describe, expect, it, beforeAll } from 'vitest';
import { defaultProject } from '../src/core/defaults';
import { buildBase, prepareSurface, runMethod } from '../src/core/pipeline';
import { buildKit } from '../src/core/connectors/kit';
import { brickCells, brickKind } from '../src/core/bricks/catalog';
import { brickCounts, ldraw, brickInstructions } from '../src/io/export/kitExports';
import { packPlates, type PrintItem } from '../src/state/printPlates';
import type { ManifoldToplevel } from 'manifold-3d';

let W: ManifoldToplevel;
beforeAll(async () => {
  const Module = (await import('manifold-3d')).default;
  W = await Module();
  W.setup();
});

describe('LEGO variety', () => {
  it('corners, round pieces and a size mix, with no overlaps', () => {
    const p = defaultProject();
    p.method = 'bricks';
    p.joinery.kind = 'none';
    p.bricks.corners = true;
    p.bricks.round = 0.5;
    p.bricks.mix = 0.4;
    p.bricks.sizes = [...p.bricks.sizes, '1x10', '2x10', '4x6'];
    const base = buildBase(p.shape, undefined);
    const { mesh } = prepareSurface(base, p.surface);
    const r = runMethod(mesh, p);
    const list = r.kit!.bricks!;
    expect(list.some((b) => b.shape === 'corner')).toBe(true);
    expect(list.some((b) => b.shape === 'round')).toBe(true);
    // No two pieces share a cell.
    const seen = new Set<string>();
    for (const b of list)
      for (const [i, j] of brickCells(b)) {
        const k = `${i},${j},${b.z}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    // Every piece has a real part number.
    for (const b of list) expect(brickKind(b, false).part).not.toBe('?');
    const kinds = new Set(list.map((b) => brickKind(b, false).key));
    expect(kinds.size).toBeGreaterThan(8);
    const ldr = ldraw(r, 'Test').split('\r\n').filter((l) => l.startsWith('1 '));
    expect(ldr.length).toBe(list.length);
    expect(ldr.some((l) => l.endsWith('2357.dat'))).toBe(true);
    expect(ldr.some((l) => l.endsWith('3941.dat') || l.endsWith('3062b.dat'))).toBe(true);
    expect(brickInstructions(r, 'Test').size).toBeGreaterThan(2000);
    // Printable versions of every kind.
    const counts = brickCounts(r);
    const printable = buildKit(W, { kind: 'bricks', joinery: p.joinery, thickness: 1, bricks: counts });
    expect(printable.length).toBe(counts.length);
    expect(printable.some((q) => q.name.startsWith('corner'))).toBe(true);
    expect(printable.some((q) => q.name.startsWith('round'))).toBe(true);
    for (const q of printable) expect(q.mesh.indices.length).toBeGreaterThan(30);
  }, 180000);
});

describe('print plates', () => {
  const fake = (name: string, w: number, d: number, count: number): PrintItem => ({
    key: name,
    name,
    group: 'Test',
    count,
    mesh: { positions: new Float32Array(), indices: new Uint32Array() },
    w,
    d,
    h: 10,
    offset: [0, 0, 0],
    volume: w * d * 10,
  });
  it('packs every copy inside the bed and spills onto new plates', () => {
    const items = [fake('a', 30, 20, 40), fake('b', 60, 15, 12), fake('big', 300, 300, 1)];
    const bed = { w: 220, h: 220 };
    const L = packPlates(items, bed, false);
    expect(L.copies.length).toBe(53);
    expect(L.plates).toBeGreaterThan(1);
    expect(L.oversize).toEqual(['big']);
    for (const c of L.copies) {
      if (items[c.item].name === 'big') continue;
      const it = items[c.item];
      const w = c.rot ? it.d : it.w, d = c.rot ? it.w : it.d;
      expect(c.x + w).toBeLessThanOrEqual(bed.w + 1e-6);
      expect(c.y + d).toBeLessThanOrEqual(bed.h + 1e-6);
    }
    const U = packPlates(items, bed, true);
    expect(U.copies.length).toBe(3);
  });
});
