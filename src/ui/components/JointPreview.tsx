/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { useMemo } from 'react';
import type { Path2 } from '@/core/types';
import { emptyFeatures, type EdgeCtx, type Features } from '@/core/joinery/edgeFeatures';
import { difference, union } from '@/core/polygon/polygon';

/**
 * Exact preview of a seam: the real joinery code runs on a straight test
 * edge, and both sides are drawn, part A below the seam and part B above.
 */
export function JointPreview({
  draw,
  length = 90,
  thickness,
  foldAngle = Math.PI / 2,
  num = 7,
  label,
  fold = false,
}: {
  draw: (ctx: EdgeCtx, f: Features) => void;
  length?: number;
  thickness: number;
  foldAngle?: number;
  num?: number;
  label: string;
  /** Fold features (one call, drawn across both parts) instead of seam features (one call per side). */
  fold?: boolean;
}) {
  const geo = useMemo(() => {
    // Fit the plates to the features so small joints stay legible.
    const probe = (male: boolean) => {
      const F = emptyFeatures();
      draw(mk(male), F);
      let e = 0;
      for (const p of [...F.add, ...F.sub, ...F.perforations.map((l) => l.pts), ...F.score.map((l) => l.pts)]) for (const q of p) e = Math.max(e, Math.abs(q[1]));
      for (const h of F.holes) e = Math.max(e, Math.abs(h.y) + h.r);
      return e;
    };
    const extent = Math.max(probe(true), fold ? 0 : probe(false));
    const H = Math.max(extent * 1.7, length * 0.08, thickness * 2, 2);
    const base = (s: number): Path2 => [
      [0, 0],
      [length, 0],
      [length, s * H],
      [0, s * H],
    ];
    function mk(male: boolean): EdgeCtx {
      return {
      A: [0, 0],
      B: [length, 0],
      len: length,
      // Part A lies below (n > 0 points up into B); part B's n > 0 points down into A.
      toXY: (s, n) => [s, male ? n : -n],
      male,
      foldAngle,
      convex: true,
      num,
      thickness,
      };
    }
    const side = (male: boolean) => {
      const F = emptyFeatures();
      draw(mk(male), F);
      return F;
    };
    if (fold) {
      const F = side(true);
      const region = F.sub.length ? difference(union([base(-1), base(1)]), F.sub) : union([base(-1), base(1)]);
      return { H, parts: [{ region, F, tone: 0 }] };
    }
    const FA = side(true), FB = side(false);
    const build = (F: Features, s: number) => {
      let r = union([base(s), ...F.add]);
      if (F.sub.length) r = difference(r, F.sub);
      return r;
    };
    return { H, parts: [{ region: build(FA, -1), F: FA, tone: 0 }, { region: build(FB, 1), F: FB, tone: 1 }] };
  }, [draw, length, thickness, foldAngle, num, fold]);
  const pad = Math.max(1, geo.H * 0.15);
  const minY = -geo.H - pad, maxY = geo.H + pad;
  const d = (p: Path2) => 'M' + p.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join('L') + 'Z';
  const line = (p: Path2) => 'M' + p.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join('L');
  return (
    <svg className="joint-preview" viewBox={`${-pad} ${-maxY} ${length + 2 * pad} ${maxY - minY}`} role="img" aria-label={label}>
      {geo.parts.map((p, i) => (
        <g key={i}>
          <path d={p.region.map(d).join(' ')} fillRule="evenodd" className={`joint-preview__part joint-preview__part--${p.tone}`} />
          {p.F.holes.map((h, j) => (
            <circle key={j} cx={h.x} cy={-h.y} r={h.r} className="joint-preview__hole" />
          ))}
          {p.F.perforations.map((l, j) => (
            <path key={j} d={line(l.pts)} className="joint-preview__cut" />
          ))}
          {p.F.score.map((l, j) => (
            <path key={j} d={line(l.pts)} className="joint-preview__score" />
          ))}
        </g>
      ))}
    </svg>
  );
}
