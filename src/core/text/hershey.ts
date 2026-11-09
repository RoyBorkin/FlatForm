/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { FUTURAL } from './hersheyFuturalData';
import type { Polyline2 } from '../types';
import type { V2 } from '../math/vec';

const CAP = 21; // font units from top (1) to baseline (22)

function parseGlyph(d: string): V2[][] {
  const strokes: V2[][] = [];
  let cur: V2[] | null = null;
  const tokens = d.match(/[ML]|-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g) ?? [];
  let mode = 'M';
  for (const t of tokens) {
    if (t === 'M' || t === 'L') {
      mode = t;
      continue;
    }
    const [x, y] = t.split(',').map(Number);
    if (mode === 'M') {
      cur = [[x, y]];
      strokes.push(cur);
      mode = 'L';
    } else cur?.push([x, y]);
  }
  return strokes.filter((s) => s.length > 1);
}

const cache = new Map<string, V2[][]>();
function glyph(ch: string): { strokes: V2[][]; adv: number } {
  const g = FUTURAL[ch] ?? FUTURAL['?'];
  let s = cache.get(ch);
  if (!s) {
    s = parseGlyph(g.d);
    cache.set(ch, s);
  }
  return { strokes: s, adv: g.o * 2 };
}

export function textWidth(text: string, height: number): number {
  let w = 0;
  for (const ch of text) w += glyph(ch).adv;
  return (w * height) / CAP;
}

/**
 * Single-stroke text as engrave polylines. (x, y) is the text centre,
 * `angle` in radians, `height` is cap height in mm.
 */
export function textPolylines(text: string, x: number, y: number, height: number, angle = 0): Polyline2[] {
  const k = height / CAP;
  const total = textWidth(text, height);
  const c = Math.cos(angle), s = Math.sin(angle);
  const out: Polyline2[] = [];
  let pen = -total / 2;
  for (const ch of text) {
    const g = glyph(ch);
    for (const st of g.strokes) {
      const pts: V2[] = st.map(([gx, gy]) => {
        const lx = pen + gx * k;
        const ly = (CAP / 2 + 1 - gy) * k; // flip y, centre vertically
        return [x + lx * c - ly * s, y + lx * s + ly * c];
      });
      out.push({ pts, kind: 'text' });
    }
    pen += g.adv * k;
  }
  return out;
}
