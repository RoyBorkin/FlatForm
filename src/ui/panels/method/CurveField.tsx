/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Plus, Minus } from 'lucide-react';
import type { CurveParams } from '@/core/params';
import { CURVE_PRESETS } from '@/core/defaults';
import { IconButton, SegmentedField, SelectField } from '../../components/controls';

const W = 240, H = 168, PAD = 14;

function catmull(pts: [number, number][], steps = 64): [number, number][] {
  if (pts.length < 2) return pts;
  const ext = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts, [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]]];
  const out: [number, number][] = [];
  const segs = pts.length - 1;
  for (let i = 0; i <= steps * segs; i++) {
    const x = i / steps;
    const k = Math.min(segs - 1, Math.floor(x));
    const t = x - k, t2 = t * t, t3 = t2 * t;
    const [p0, p1, p2, p3] = [ext[k], ext[k + 1], ext[k + 2], ext[k + 3]];
    const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

const AXES: Record<CurveParams['plane'], [string, string]> = { xz: ['X', 'Z'], yz: ['Y', 'Z'], xy: ['X', 'Y'] };

/**
 * A guide curve drawn in one of the three side views of the shape's bounding
 * box. Drag points to bend it; add or remove points with the buttons.
 */
export function CurveField({ label, value, onChange }: { label: string; value: CurveParams; onChange: (fn: (c: CurveParams) => void) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const toPx = ([u, v]: [number, number]) => [PAD + u * (W - 2 * PAD), H - PAD - v * (H - 2 * PAD)] as const;
  const fromEvent = (e: RPointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    const clamp = (q: number) => Math.round(Math.max(0, Math.min(1, q)) * 1000) / 1000;
    return [clamp((x - PAD) / (W - 2 * PAD)), clamp((H - PAD - y) / (H - 2 * PAD))] as [number, number];
  };
  const path = catmull(value.points)
    .map((p, i) => `${i ? 'L' : 'M'}${toPx(p)[0].toFixed(1)},${toPx(p)[1].toFixed(1)}`)
    .join(' ');
  const [ax, ay] = AXES[value.plane];
  return (
    <div className="curve-field">
      <div className="curve-field__row">
        <SelectField
          label={label}
          value={value.preset}
          onChange={(v) =>
            onChange((c) => {
              c.preset = v;
              if (v !== 'custom') c.points = CURVE_PRESETS[v].map((p) => [p[0], p[1]] as [number, number]);
            })
          }
          options={[
            { value: 'straight', label: 'Straight' },
            { value: 'arc', label: 'Arc' },
            { value: 's', label: 'S-curve' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      </div>
      <SegmentedField
        label="Drawn in"
        hint="The view the curve is drawn in. The box is the shape's bounding box."
        value={value.plane}
        onChange={(v) => onChange((c) => void (c.plane = v))}
        options={[
          { value: 'xz', label: 'Front (XZ)' },
          { value: 'yz', label: 'Side (YZ)' },
          { value: 'xy', label: 'Top (XY)' },
        ]}
      />
      <div className="curve-field__pad">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="curve-field__svg"
          role="group"
          aria-label={`${label}: drag the points to bend the curve`}
          onPointerMove={(e) => {
            if (drag === null) return;
            const q = fromEvent(e);
            onChange((c) => {
              c.points[drag] = q;
              c.preset = 'custom';
            });
          }}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
        >
          <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} className="curve-field__box" />
          <text x={W - PAD} y={H - 3} className="curve-field__axis" textAnchor="end">
            {ax} →
          </text>
          <text x={3} y={PAD + 2} className="curve-field__axis">
            {ay}
          </text>
          <path d={path} className="curve-field__curve" />
          {value.points.map((p, i) => {
            const [x, y] = toPx(p);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={drag === i ? 7 : 5.5}
                className="curve-field__pt"
                data-end={i === 0 || i === value.points.length - 1}
                tabIndex={0}
                role="slider"
                aria-label={`Point ${i + 1}`}
                aria-valuetext={`${Math.round(p[0] * 100)}%, ${Math.round(p[1] * 100)}%`}
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  setDrag(i);
                }}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 0.1 : 0.02;
                  const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
                  if (!d[e.key]) return;
                  e.preventDefault();
                  onChange((c) => {
                    c.points[i] = [Math.max(0, Math.min(1, c.points[i][0] + d[e.key][0])), Math.max(0, Math.min(1, c.points[i][1] + d[e.key][1]))];
                    c.preset = 'custom';
                  });
                }}
              />
            );
          })}
        </svg>
        <div className="curve-field__tools">
          <IconButton
            label="Add a point"
            side="left"
            disabled={value.points.length >= 8}
            onClick={() =>
              onChange((c) => {
                // Split the longest span.
                let k = 0, best = -1;
                for (let i = 0; i + 1 < c.points.length; i++) {
                  const d = Math.hypot(c.points[i + 1][0] - c.points[i][0], c.points[i + 1][1] - c.points[i][1]);
                  if (d > best) (best = d), (k = i);
                }
                const a = c.points[k], b = c.points[k + 1];
                c.points.splice(k + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
                c.preset = 'custom';
              })
            }
          >
            <Plus size={14} aria-hidden />
          </IconButton>
          <IconButton
            label="Remove a point"
            side="left"
            disabled={value.points.length <= 2}
            onClick={() =>
              onChange((c) => {
                c.points.splice(Math.floor(c.points.length / 2), 1);
                c.preset = 'custom';
              })
            }
          >
            <Minus size={14} aria-hidden />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
