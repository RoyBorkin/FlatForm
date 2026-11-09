/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * SVG at 1:1 scale (mm). Layers are groups named for Inkscape/Illustrator and
 * coloured the way LightBurn and most laser software map operations:
 * red = cut, blue = engrave, green = score.
 */
import type { SheetDrawing } from './sheetGeometry';
import type { Path2 } from '../types';

const f = (v: number) => (Math.round(v * 1000) / 1000).toString();

export function svgPath(p: Path2, closed: boolean, H: number): string {
  if (!p.length) return '';
  let d = `M${f(p[0][0])} ${f(H - p[0][1])}`;
  for (let i = 1; i < p.length; i++) d += `L${f(p[i][0])} ${f(H - p[i][1])}`;
  return closed ? d + 'Z' : d;
}

export const SVG_COLORS = { cut: '#ff0000', inner: '#ff00ff', engrave: '#0000ff', score: '#00a000', sheet: '#999999' };

export function writeSvg(s: SheetDrawing, stroke: number, frame: boolean, title = '', credit = ''): string {
  const H = s.height;
  const g = (id: string, color: string, body: string, extra = '') =>
    `<g id="${id}" inkscape:groupmode="layer" inkscape:label="${id}" fill="none" stroke="${color}" stroke-width="${stroke}" ${extra}>${body}</g>`;
  const paths = (list: Path2[], closed: boolean) => (list.length ? `<path d="${list.map((p) => svgPath(p, closed, H)).join('')}"/>` : '');
  const circles = s.circles.map((c) => `<circle cx="${f(c.x)}" cy="${f(H - c.y)}" r="${f(c.r)}"/>`).join('');
  const mountain = s.score.filter((x) => x.kind !== 'valley').map((x) => x.pts);
  const valley = s.score.filter((x) => x.kind === 'valley').map((x) => x.pts);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${f(s.width)}mm" height="${f(H)}mm" viewBox="0 0 ${f(s.width)} ${f(H)}">
<title>${escapeXml(title || `Sheet ${s.index + 1}`)}</title>${credit ? `\n<desc>${escapeXml(credit)}</desc>\n<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><rdf:Description><dc:creator>${escapeXml(credit)}</dc:creator><dc:rights>${escapeXml(credit)}</dc:rights></rdf:Description></rdf:RDF></metadata>` : ''}
${frame ? g('SHEET', SVG_COLORS.sheet, `<rect x="0" y="0" width="${f(s.width)}" height="${f(H)}"/>`) : ''}
${g('ENGRAVE', SVG_COLORS.engrave, paths(s.engrave, false))}
${g('SCORE', SVG_COLORS.score, paths(mountain, false) + (valley.length ? `<path stroke-dasharray="2 1" d="${valley.map((p) => svgPath(p, false, H)).join('')}"/>` : ''))}
${g('CUT_INNER', SVG_COLORS.inner, circles + paths(s.perforations, false) + paths(s.cutInner, true))}
${g('CUT_OUTER', SVG_COLORS.cut, paths(s.cutOuter, true) + paths(s.cutOuterOpen, false))}
</svg>
`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}
