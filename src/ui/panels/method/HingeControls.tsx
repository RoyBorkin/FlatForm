/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/** Pattern pickers and settings for living hinges and bend relief, shared by Folded panels and Flex hinges. */
import { useMemo } from 'react';
import type { BendReliefParams, HingeParams, HingePattern, ReliefPattern } from '@/core/params';
import { HINGE_PATTERNS, RELIEF_PATTERNS, bendRelief, hingeAlongEdge, hingeFill, hingeIsClosed, reliefSizes, type CutSet } from '@/core/joinery/hinges';
import { emptyFeatures, type EdgeCtx } from '@/core/joinery/edgeFeatures';
import type { Path2 } from '@/core/types';
import { JointPreview } from '../../components/JointPreview';
import { SegmentedField, SliderField, useUnits } from '../../components/controls';

const pathD = (p: Path2, close: boolean) => 'M' + p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L') + (close ? 'Z' : '');

function Swatch({ cuts, w, h, score }: { cuts: CutSet; w: number; h: number; score?: Path2[] }) {
  return (
    <svg className="pattern-chip__svg" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <rect x={0} y={0} width={w} height={h} className="pattern-chip__sheet" />
      {score?.map((l, i) => <path key={`s${i}`} d={pathD(l, false)} className="pattern-chip__score" />)}
      {cuts.holes.map((p, i) => <path key={`h${i}`} d={pathD(p, true)} className="pattern-chip__hole" />)}
      {cuts.circles.map((c, i) => <circle key={`c${i}`} cx={c.x} cy={c.y} r={c.r} className="pattern-chip__hole" />)}
      {cuts.lines.map((l, i) => <path key={`l${i}`} d={pathD(l, false)} className="pattern-chip__cut" />)}
    </svg>
  );
}

const HINGE_DEMO = { cutLength: 11, bridge: 3, spacing: 4, slotWidth: 1.3 };

/** A grid of all twelve living-hinge patterns, each drawn by the code that cuts it. */
function HingePicker({ value, onChange }: { value: HingePattern; onChange: (v: HingePattern) => void }) {
  const swatches = useMemo(
    () =>
      HINGE_PATTERNS.map((p) => ({
        ...p,
        cuts: hingeFill([[[2, 2], [46, 2], [46, 26], [2, 26]]], [1, 0], { ...HINGE_DEMO, pattern: p.id }),
      })),
    [],
  );
  return (
    <div className="pattern-grid" role="radiogroup" aria-label="Hinge pattern">
      {swatches.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={value === s.id} className="pattern-chip" title={s.text} onClick={() => onChange(s.id)}>
          <Swatch cuts={s.cuts} w={48} h={28} />
          <span className="pattern-chip__label">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

function ReliefPicker({ value, onChange, base }: { value: ReliefPattern; onChange: (v: ReliefPattern) => void; base: BendReliefParams }) {
  const swatches = useMemo(
    () =>
      RELIEF_PATTERNS.map((p) => {
        const F = emptyFeatures();
        const ctx: EdgeCtx = { A: [0, 14], B: [48, 14], len: 48, toXY: (s, n) => [s, 14 + n], male: true, foldAngle: 0.6, convex: true, num: 0, thickness: 2 };
        bendRelief(ctx, F, { ...base, pattern: p.id, slotLength: 12, endRelief: base.endRelief });
        return { ...p, cuts: { lines: F.perforations.map((l) => l.pts), holes: F.sub, circles: F.holes }, score: F.score.map((l) => l.pts) };
      }),
    [base],
  );
  return (
    <div className="pattern-grid pattern-grid--3" role="radiogroup" aria-label="Relief pattern">
      {swatches.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={value === s.id} className="pattern-chip" title={s.text} onClick={() => onChange(s.id)}>
          <Swatch cuts={s.cuts} w={48} h={28} score={s.score} />
          <span className="pattern-chip__label">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Pattern, cut sizes and a live preview of a living hinge. */
export function HingeFields({ P, set, thickness, halfWidth }: { P: HingeParams; set: (fn: (x: HingeParams) => void) => void; thickness: number; halfWidth: number }) {
  const info = HINGE_PATTERNS.find((x) => x.id === P.pattern);
  const closed = hingeIsClosed(P.pattern);
  return (
    <>
      <HingePicker value={P.pattern} onChange={(v) => set((x) => void (x.pattern = v))} />
      {info && (
        <p className="muted small">
          <strong>{info.label}.</strong> {info.text}
        </p>
      )}
      <JointPreview
        label="Living hinge preview"
        fold
        length={Math.min(160, Math.max(50, (P.cutLength + P.bridge) * 3.2))}
        thickness={thickness}
        draw={(c, f) => hingeAlongEdge(c, f, P, Math.min(halfWidth, Math.max(4, P.spacing * 6)))}
      />
      <SliderField label="Cut length" value={P.cutLength} min={2} max={80} step={0.5} unit="len" onChange={(v) => set((x) => void (x.cutLength = v))} />
      <SliderField label="Bridge" hint="Uncut material between cuts in a row. Smaller bends easier and breaks sooner." value={P.bridge} min={0.5} max={20} step={0.1} unit="len" onChange={(v) => set((x) => void (x.bridge = v))} />
      <SliderField label="Row spacing" hint="About the sheet thickness or a little less for line patterns; wider for cut-outs." value={P.spacing} min={0.4} max={12} step={0.05} unit="len" onChange={(v) => set((x) => void (x.spacing = v))} />
      {(closed || P.pattern === 'bones') && (
        <SliderField
          label={P.pattern === 'bones' ? 'End hole size' : 'Slot width'}
          hint={closed ? 'Lattice, honeycomb and triangles cut out up to twice this, never more than the row spacing allows.' : undefined}
          value={P.slotWidth}
          min={0.2}
          max={8}
          step={0.05}
          unit="len"
          onChange={(v) => set((x) => void (x.slotWidth = v))}
        />
      )}
    </>
  );
}

/** Pattern, sizes (relative to the sheet thickness) and a live preview of bend relief. */
export function ReliefFields({ P, set, thickness }: { P: BendReliefParams; set: (fn: (x: BendReliefParams) => void) => void; thickness: number }) {
  const u = useUnits();
  const info = RELIEF_PATTERNS.find((x) => x.id === P.pattern);
  const sz = reliefSizes(P, thickness);
  return (
    <>
      <ReliefPicker value={P.pattern} onChange={(v) => set((x) => void (x.pattern = v))} base={P} />
      {info && (
        <p className="muted small">
          <strong>{info.label}.</strong> {info.text}
        </p>
      )}
      <JointPreview label="Bend relief preview" fold length={Math.max(60, P.slotLength * 3.5)} thickness={thickness} draw={(c, f) => bendRelief(c, f, P)} />
      <SliderField label="Slot width" hint="× sheet thickness. SendCutSend: at least 0.5×, more for thick or hard metal." value={P.width} min={0.3} max={2} step={0.05} unit="× t" onChange={(v) => set((x) => void (x.width = v))} />
      <SliderField label="Tab width" hint="× sheet thickness, at least 1×. Wider tabs are stronger and harder to bend." value={P.tab} min={1} max={6} step={0.1} unit="× t" onChange={(v) => set((x) => void (x.tab = v))} />
      <SliderField label="Slot length" hint="The number of slots follows each fold's length (about six on a typical bend)." value={P.slotLength} min={3} max={120} step={0.5} unit="len" onChange={(v) => set((x) => void (x.slotLength = v))} />
      <SegmentedField
        label="End relief"
        hint="A cut-out where the bend meets an edge or a corner, so the bend does not tear the sheet."
        value={P.endRelief}
        onChange={(v) => set((x) => void (x.endRelief = v))}
        options={[
          { value: 'round', label: 'Round' },
          { value: 'square', label: 'Square' },
          { value: 'none', label: 'None' },
        ]}
      />
      <p className="muted small">
        At {u.fmt(thickness)} thick: slots {u.fmt(sz.w)} wide, tabs {u.fmt(sz.tab)}. Do a test bend: relief changes the bend radius.
      </p>
    </>
  );
}
