/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { describe, expect, it } from 'vitest';
import { defaultProject } from '../src/core/defaults';
import { buildBase, prepareSurface, runMethod, runNest } from '../src/core/pipeline';
import { sheetDrawings, drawPart } from '../src/core/export/sheetGeometry';
import { writeDxf } from '../src/core/export/dxf';
import { writeSvg } from '../src/core/export/svg';
import { intersection, regionArea } from '../src/core/polygon/polygon';
import { latchAt } from '../src/core/joinery/latches';
import { textPolylines, textWidth } from '../src/core/text/hershey';

const p = defaultProject();
p.surface.targetTriangles = 900;
p.lattice.layers[0].clusters = 40;
p.lattice.layers[1].clusters = 40;
const surface = prepareSurface(buildBase(p.shape, undefined), p.surface).mesh;
const method = runMethod(surface, p);
const nest = runNest(method, p);
const parts = new Map(method.parts.map((x) => [x.id, x]));

describe('lattice', () => {
  it('pins every node through every layer', () => {
    const holes = method.parts.reduce((s, x) => s + x.holes.length, 0);
    expect(holes).toBe(method.stats.pins * method.stats.layers);
  });
  it('every pin number appears once per layer', () => {
    for (const g of [0, 1]) {
      const labels = method.parts.filter((x) => x.group === g).flatMap((x) => x.holes.map((h) => h.label));
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe('nesting', () => {
  it('places every part inside its sheet without overlaps', () => {
    expect(nest.unplaced).toEqual([]);
    for (const s of nest.sheets) {
      const outlines = s.placements.map((pl) => drawPart(parts.get(pl.partId)!, pl).outer);
      for (const o of outlines)
        for (const [x, y] of o[0]) {
          expect(x).toBeGreaterThanOrEqual(p.sheet.margin - 0.5);
          expect(y).toBeGreaterThanOrEqual(p.sheet.margin - 0.5);
          expect(x).toBeLessThanOrEqual(s.width - p.sheet.margin + 0.5);
          expect(y).toBeLessThanOrEqual(s.height - p.sheet.margin + 0.5);
        }
      for (let i = 0; i < outlines.length; i++)
        for (let j = i + 1; j < outlines.length; j++) expect(regionArea(intersection(outlines[i], outlines[j]))).toBeLessThan(0.01);
    }
  });
});

describe('exports', () => {
  const drawings = sheetDrawings(nest, parts, p.sheet, p.material.kerf);
  it('writes structurally valid DXF', () => {
    const dxf = writeDxf(drawings, { includeSheetFrame: true, textAs: 'strokes' });
    const lines = dxf.trim().split('\n');
    expect(lines.length % 2).toBe(0);
    expect(dxf.match(/\nSECTION\n/g)!.length).toBe(dxf.match(/\nENDSEC\n/g)!.length);
    expect(lines[lines.length - 1]).toBe('EOF');
    expect(dxf).toContain('CUT_OUTER');
  });
  it('writes SVG in millimetres', () => {
    const svg = writeSvg(drawings[0], 0.1, true);
    expect(svg).toContain(`width="${p.sheet.width}mm"`);
    expect(svg).toContain('CUT_INNER');
  });
});

describe('latches and text', () => {
  it('every latch kind produces a male and a female feature', () => {
    for (const kind of ['tabSlot', 'arrow', 'hook', 'puzzle'] as const) {
      const g = latchAt(10, { kind, width: 8, depth: 6, clearance: 0.2, angle: 30, thickness: 1 });
      expect(g.add.length).toBeGreaterThan(0);
      expect(g.sub.length).toBeGreaterThan(0);
    }
  });
  it('single-stroke text scales with height', () => {
    expect(textWidth('123', 10)).toBeCloseTo(textWidth('123', 5) * 2, 6);
    expect(textPolylines('A1', 0, 0, 3).length).toBeGreaterThan(2);
  });
});
