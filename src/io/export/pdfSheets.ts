/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/** One PDF page per sheet at 1:1 scale, same layers and colours as the SVG. */
import { jsPDF } from 'jspdf';
import { APP_NAME, AUTHOR, AUTHOR_EMAIL, COPYRIGHT_LINE } from '@/brand';
import type { SheetDrawing } from '@/core/export/sheetGeometry';
import type { Path2 } from '@/core/types';

function drawPath(doc: jsPDF, p: Path2, H: number, closed: boolean) {
  if (p.length < 2) return;
  const segs: number[][] = [];
  for (let i = 1; i < p.length; i++) segs.push([p[i][0] - p[i - 1][0], -(p[i][1] - p[i - 1][1])]);
  doc.lines(segs, p[0][0], H - p[0][1], [1, 1], 'S', closed);
}

export function sheetsPdf(sheets: SheetDrawing[], stroke: number, frame: boolean, title: string): Blob {
  const first = sheets[0];
  const doc = new jsPDF({ unit: 'mm', format: [first?.width ?? 210, first?.height ?? 297], orientation: (first?.width ?? 1) >= (first?.height ?? 1) ? 'landscape' : 'portrait', compress: true });
  doc.setProperties({ title, creator: APP_NAME, author: `${AUTHOR} (${AUTHOR_EMAIL})`, subject: COPYRIGHT_LINE });
  sheets.forEach((s, i) => {
    if (i > 0) doc.addPage([s.width, s.height], s.width >= s.height ? 'landscape' : 'portrait');
    const H = s.height;
    doc.setLineWidth(stroke);
    if (frame) {
      doc.setDrawColor(153, 153, 153);
      doc.rect(0, 0, s.width, s.height, 'S');
    }
    doc.setDrawColor(0, 0, 255);
    for (const e of s.engrave) drawPath(doc, e, H, false);
    doc.setDrawColor(0, 160, 0);
    for (const sc of s.score) {
      doc.setLineDashPattern(sc.kind === 'valley' ? [2, 1] : [], 0);
      drawPath(doc, sc.pts, H, false);
    }
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(255, 0, 255);
    for (const c of s.circles) doc.circle(c.x, H - c.y, c.r, 'S');
    for (const p of s.perforations) drawPath(doc, p, H, false);
    for (const p of s.cutInner) drawPath(doc, p, H, true);
    doc.setDrawColor(255, 0, 0);
    for (const p of s.cutOuter) drawPath(doc, p, H, true);
    for (const p of s.cutOuterOpen) drawPath(doc, p, H, false);
  });
  return doc.output('blob');
}
