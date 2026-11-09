import type { LatchKind, MethodKind } from '@/core/params';
import { latchAt } from '@/core/joinery/latches';

/** Small line drawings for the method cards, drawn in the layer colours. */
export function MethodGlyph({ kind }: { kind: MethodKind }) {
  const a = 'var(--layer-0)', b = 'var(--layer-1)';
  return (
    <svg className="method-card__glyph" viewBox="0 0 64 40" aria-hidden>
      {kind === 'lattice' && (
        <g fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 30 L14 22 L14 12 M14 22 L24 26 L32 18 L32 8 M32 18 L42 22 L50 14 M42 22 L44 32" stroke={a} />
          <path d="M8 12 L18 16 L26 10 M18 16 L22 30 L34 32 L40 26 M34 32 L54 30 M40 26 L56 22" stroke={b} />
          {[[14, 22], [32, 18], [42, 22], [18, 16], [34, 32]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" fill="var(--text)" />
          ))}
        </g>
      )}
      {kind === 'slices' && (
        <g fill="none" strokeWidth="2.2">
          {[0, 1, 2, 3, 4].map((i) => (
            <ellipse key={i} cx="32" cy={34 - i * 6} rx={14 + Math.sin(i * 0.9) * 8} ry="4" stroke={i % 2 ? b : a} />
          ))}
        </g>
      )}
      {kind === 'waffle' && (
        <g fill="none" strokeWidth="2.2" strokeLinecap="round">
          {[14, 26, 38, 50].map((x) => (
            <path key={x} d={`M${x} 6 L${x} 34`} stroke={a} />
          ))}
          {[12, 22, 32].map((y) => (
            <path key={y} d={`M6 ${y} L58 ${y}`} stroke={b} />
          ))}
        </g>
      )}
      {kind === 'folded' && (
        <g fill="none" strokeWidth="2" strokeLinejoin="round">
          <path d="M8 32 L20 8 L32 32 Z M20 8 L44 8 L32 32 M44 8 L56 32 L32 32" stroke={a} />
          <path d="M20 8 L32 32 M44 8 L32 32" stroke={b} strokeDasharray="3 3" />
        </g>
      )}
    </svg>
  );
}

/** Exact preview of a latch: male feature on top, matching female cut below. */
export function LatchGlyph({ kind, width, depth, angle, clearance }: { kind: LatchKind; width: number; depth: number; angle: number; clearance: number }) {
  const g = latchAt(0, { kind, width, depth, angle, clearance, thickness: 1 });
  const s = 40 / Math.max(width * 1.6, depth * 2.4);
  const path = (pts: [number, number][], dy: number) => 'M' + pts.map(([x, y]) => `${(x * s + 48).toFixed(2)},${(dy - y * s).toFixed(2)}`).join(' L') + ' Z';
  return (
    <svg className="latch-glyph" viewBox="0 0 96 64" aria-hidden>
      <rect x="6" y="30" width="84" height="2" fill="var(--line-strong)" />
      <path d={`M6 30 L90 30 L90 6 L6 6 Z`} fill="none" />
      {g.add.map((p, i) => (
        <path key={i} d={path(p as [number, number][], 30)} fill="var(--layer-0)" fillOpacity="0.25" stroke="var(--layer-0)" strokeWidth="1.3" />
      ))}
      <rect x="6" y="32" width="84" height="26" fill="var(--layer-1)" fillOpacity="0.12" />
      {g.sub.map((p, i) => (
        <path key={i} d={path(p as [number, number][], 32)} fill="var(--panel)" stroke="var(--layer-1)" strokeWidth="1.3" />
      ))}
      {g.fold && <line x1={g.fold[0][0] * s + 48} y1="30" x2={g.fold[1][0] * s + 48} y2="30" stroke="var(--text)" strokeDasharray="2 2" />}
    </svg>
  );
}
