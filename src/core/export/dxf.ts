/**
 * DXF R12 (AC1009) writer. R12 is the most widely accepted dialect: laser
 * software (LightBurn, RDWorks, Trotec), CNC CAM and every CAD package read it.
 * Layers: CUT_INNER (cut first), CUT_OUTER, ENGRAVE, SCORE, SHEET.
 */
import type { SheetDrawing } from './sheetGeometry';
import type { Path2 } from '../types';
import { textPolylines } from '../text/hershey';

const LAYERS = [
  { name: 'CUT_INNER', color: 6 },
  { name: 'CUT_OUTER', color: 1 },
  { name: 'ENGRAVE', color: 5 },
  { name: 'SCORE', color: 3 },
  { name: 'SHEET', color: 8 },
  { name: 'LABELS', color: 7 },
];

class Writer {
  out: string[] = [];
  g(code: number, value: string | number) {
    this.out.push(String(code), typeof value === 'number' ? fmt(value) : value);
  }
}

const fmt = (v: number) => (Math.abs(v) < 1e-9 ? '0' : v.toFixed(4).replace(/\.?0+$/, ''));

function polyline(w: Writer, layer: string, pts: Path2, closed: boolean) {
  if (pts.length < 2) return;
  if (pts.length === 2 && !closed) {
    w.g(0, 'LINE');
    w.g(8, layer);
    w.g(10, pts[0][0]);
    w.g(20, pts[0][1]);
    w.g(30, 0);
    w.g(11, pts[1][0]);
    w.g(21, pts[1][1]);
    w.g(31, 0);
    return;
  }
  w.g(0, 'POLYLINE');
  w.g(8, layer);
  w.g(66, 1);
  w.g(10, 0);
  w.g(20, 0);
  w.g(30, 0);
  w.g(70, closed ? 1 : 0);
  for (const [x, y] of pts) {
    w.g(0, 'VERTEX');
    w.g(8, layer);
    w.g(10, x);
    w.g(20, y);
    w.g(30, 0);
  }
  w.g(0, 'SEQEND');
  w.g(8, layer);
}

export interface DxfOptions {
  includeSheetFrame: boolean;
  textAs: 'strokes' | 'dxfText';
  /** Horizontal offset between sheets when several share one file. */
  gap?: number;
}

export function writeDxf(sheets: SheetDrawing[], opt: DxfOptions): string {
  const w = new Writer();
  let maxX = 0, maxY = 0;
  const gap = opt.gap ?? 40;
  const offsets: number[] = [];
  let ox = 0;
  for (const s of sheets) {
    offsets.push(ox);
    ox += s.width + gap;
    maxX = ox;
    maxY = Math.max(maxY, s.height);
  }
  // HEADER
  w.g(0, 'SECTION');
  w.g(2, 'HEADER');
  w.g(9, '$ACADVER');
  w.g(1, 'AC1009');
  w.g(9, '$INSBASE');
  w.g(10, 0);
  w.g(20, 0);
  w.g(30, 0);
  w.g(9, '$EXTMIN');
  w.g(10, 0);
  w.g(20, 0);
  w.g(30, 0);
  w.g(9, '$EXTMAX');
  w.g(10, maxX);
  w.g(20, maxY);
  w.g(30, 0);
  w.g(9, '$MEASUREMENT');
  w.g(70, 1);
  w.g(0, 'ENDSEC');
  // TABLES
  w.g(0, 'SECTION');
  w.g(2, 'TABLES');
  w.g(0, 'TABLE');
  w.g(2, 'LTYPE');
  w.g(70, 1);
  w.g(0, 'LTYPE');
  w.g(2, 'CONTINUOUS');
  w.g(70, 0);
  w.g(3, 'Solid line');
  w.g(72, 65);
  w.g(73, 0);
  w.g(40, 0);
  w.g(0, 'ENDTAB');
  w.g(0, 'TABLE');
  w.g(2, 'LAYER');
  w.g(70, LAYERS.length);
  for (const l of LAYERS) {
    w.g(0, 'LAYER');
    w.g(2, l.name);
    w.g(70, 0);
    w.g(62, l.color);
    w.g(6, 'CONTINUOUS');
  }
  w.g(0, 'ENDTAB');
  w.g(0, 'ENDSEC');
  // ENTITIES
  w.g(0, 'SECTION');
  w.g(2, 'ENTITIES');
  sheets.forEach((s, i) => {
    const dx = offsets[i];
    const T = (p: Path2) => p.map(([x, y]) => [x + dx, y] as [number, number]);
    if (opt.includeSheetFrame) polyline(w, 'SHEET', T([[0, 0], [s.width, 0], [s.width, s.height], [0, s.height]]), true);
    for (const e of s.engrave) polyline(w, 'ENGRAVE', T(e), false);
    for (const sc of s.score) polyline(w, 'SCORE', T(sc.pts), false);
    for (const c of s.circles) {
      w.g(0, 'CIRCLE');
      w.g(8, 'CUT_INNER');
      w.g(10, c.x + dx);
      w.g(20, c.y);
      w.g(30, 0);
      w.g(40, c.r);
    }
    for (const p of s.perforations) polyline(w, 'CUT_INNER', T(p), false);
    for (const p of s.cutInner) polyline(w, 'CUT_INNER', T(p), true);
    for (const p of s.cutOuter) polyline(w, 'CUT_OUTER', T(p), true);
    if (opt.includeSheetFrame) {
      const label = `SHEET ${s.index + 1}`;
      if (opt.textAs === 'dxfText') {
        w.g(0, 'TEXT');
        w.g(8, 'LABELS');
        w.g(10, dx);
        w.g(20, s.height + 6);
        w.g(30, 0);
        w.g(40, 8);
        w.g(1, label);
      } else for (const l of textPolylines(label, dx + 40, s.height + 10, 8)) polyline(w, 'LABELS', T(l.pts.map(([x, y]) => [x - dx, y])), false);
    }
  });
  w.g(0, 'ENDSEC');
  w.g(0, 'EOF');
  return w.out.join('\n') + '\n';
}
