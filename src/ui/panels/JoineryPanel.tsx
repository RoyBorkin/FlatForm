import { lazy, Suspense } from 'react';
import { useProject } from '@/state/project';
import { JOINERY_SUPPORT, pinHoleDiameter } from '@/core/joinery/holes';
import { SCREW_PRESETS } from '@/core/presets';
import type { ConnectorKind, JoineryKind, JoineryParams, LatchKind } from '@/core/params';
import { Callout, Section, Segmented, SegmentedField, SelectField, SliderField, useUnits } from '../components/controls';
import { LatchGlyph } from '../components/glyphs';

const ConnectorPreview = lazy(() => import('@/viewport/ConnectorPreview'));

const JOIN_LABEL: Record<JoineryKind, string> = { screws: 'Screws', printed: 'Printed', none: 'None', latches: 'Latches' };
const CONNECTORS: { id: ConnectorKind; label: string; text: string }[] = [
  { id: 'snapPin', label: 'Snap pin', text: 'Push-through pin with a split, barbed tip.' },
  { id: 'hollowScrew', label: 'Hollow screw', text: 'Threaded sleeve and nut with an open centre.' },
  { id: 'spacer', label: 'Spacer', text: 'Tube that holds two layers apart.' },
  { id: 'nodeHub', label: 'Node hub', text: 'Unique hub per node; arms follow the strips at their real angles.' },
  { id: 'angleBracket', label: 'Angle bracket', text: 'Joins two panels at their exact angle. Cross clips for waffles.' },
];
const LATCHES: { id: LatchKind; label: string; text: string }[] = [
  { id: 'tabSlot', label: 'Tab & slot', text: 'A tab folds through a slot on the next panel.' },
  { id: 'arrow', label: 'Arrowhead', text: 'Barbed arrow squeezes through and locks.' },
  { id: 'hook', label: 'Hook', text: 'One-sided barb hooks behind the slot.' },
  { id: 'puzzle', label: 'Dovetail', text: 'In-plane puzzle key; no folding tab.' },
];

export function JoineryPanel() {
  const j = useProject((s) => s.project.joinery);
  const method = useProject((s) => s.project.method);
  const update = useProject((s) => s.update);
  const u = useUnits();
  const set = (fn: (x: JoineryParams) => void) => update((p) => fn(p.joinery));
  const support = JOINERY_SUPPORT[method];
  const allowed = support.kinds.includes(j.kind);
  return (
    <>
      <div className="panel-intro">
        <p>{support.note}</p>
      </div>
      <div className="panel-pad">
        <Segmented<JoineryKind>
          ariaLabel="Joinery"
          value={j.kind}
          onChange={(v) => set((x) => void (x.kind = v))}
          options={(['screws', 'printed', 'none', 'latches'] as JoineryKind[]).map((k) => ({
            value: k,
            label: JOIN_LABEL[k],
            disabled: !support.kinds.includes(k),
            hint: support.kinds.includes(k) ? undefined : 'Not available for this method',
          }))}
        />
      </div>
      {!allowed && (
        <div className="panel-pad">
          <Callout tone="warn">{JOIN_LABEL[j.kind]} do not apply to this method. Pick one of the enabled options.</Callout>
        </div>
      )}
      {j.kind === 'screws' && (
        <Section title="Screws">
          <SelectField
            label="Screw"
            value={j.screw.preset}
            onChange={(v) => set((x) => void (x.screw.preset = v))}
            options={SCREW_PRESETS.map((s) => ({ value: s.id, label: s.label, hint: s.id === 'custom' ? undefined : `Ø ${s.normal} mm` }))}
          />
          {j.screw.preset === 'custom' ? (
            <SliderField label="Hole diameter" value={j.screw.diameter} min={0.5} max={20} step={0.05} unit="len" onChange={(v) => set((x) => void (x.screw.diameter = v))} />
          ) : (
            <SegmentedField
              label="Fit"
              hint="ISO 273 clearance holes: close, normal (medium) or loose."
              value={j.screw.fit}
              onChange={(v) => set((x) => void (x.screw.fit = v))}
              options={[
                { value: 'close', label: 'Close' },
                { value: 'normal', label: 'Normal' },
                { value: 'loose', label: 'Loose' },
              ]}
            />
          )}
          <p className="muted small">Hole: Ø {u.fmt(pinHoleDiameter(j), 2)}</p>
        </Section>
      )}
      {j.kind === 'none' && (
        <Section title="Holes">
          <SliderField label="Hole diameter" hint="0 removes the holes." value={j.noneHoleDiameter} min={0} max={20} step={0.05} unit="len" onChange={(v) => set((x) => void (x.noneHoleDiameter = v))} />
        </Section>
      )}
      {j.kind === 'printed' && (
        <>
          <Section title="Connector">
            <div className="card-list" role="radiogroup" aria-label="Connector">
              {CONNECTORS.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={j.printed.connector === c.id} className="option-card" onClick={() => set((x) => void (x.printed.connector = c.id))}>
                  <span className="option-card__title">{c.label}</span>
                  <span className="option-card__text">{c.text}</span>
                </button>
              ))}
            </div>
            <Suspense fallback={<div className="connector-preview connector-preview--loading">Loading preview…</div>}>
              <ConnectorPreview />
            </Suspense>
          </Section>
          <Section title="Dimensions">
            <SliderField label={j.printed.connector === 'hollowScrew' ? 'Thread diameter' : 'Pin diameter'} value={j.printed.pinDiameter} min={1} max={20} step={0.1} unit="len" onChange={(v) => set((x) => void (x.printed.pinDiameter = v))} />
            <SliderField label="Head diameter" value={j.printed.headDiameter} min={2} max={40} step={0.1} unit="len" onChange={(v) => set((x) => void (x.printed.headDiameter = v))} />
            <SliderField label="Print clearance" hint="Gap between printed parts and the sheet, per side." value={j.printed.clearance} min={0} max={1} step={0.01} unit="len" onChange={(v) => set((x) => void (x.printed.clearance = v))} />
            <SliderField label="Wall" value={j.printed.wall} min={0.4} max={6} step={0.1} unit="len" onChange={(v) => set((x) => void (x.printed.wall = v))} />
            {j.printed.connector === 'hollowScrew' && (
              <>
                <SliderField label="Thread pitch" value={j.printed.threadPitch} min={0.5} max={4} step={0.05} unit="len" onChange={(v) => set((x) => void (x.printed.threadPitch = v))} />
                <SliderField label="Open bore" hint="Diameter of the open centre." value={j.printed.bore} min={0} max={18} step={0.1} unit="len" onChange={(v) => set((x) => void (x.printed.bore = v))} />
              </>
            )}
            {j.printed.connector === 'spacer' && <SliderField label="Gap" value={j.printed.spacerGap} min={0.5} max={60} step={0.5} unit="len" onChange={(v) => set((x) => void (x.printed.spacerGap = v))} />}
            {(j.printed.connector === 'nodeHub' || j.printed.connector === 'angleBracket') && (
              <SliderField label="Arm length" value={j.printed.armLength} min={4} max={80} step={0.5} unit="len" onChange={(v) => set((x) => void (x.printed.armLength = v))} />
            )}
            <p className="muted small">Sheet holes: Ø {u.fmt(pinHoleDiameter(j), 2)}</p>
          </Section>
        </>
      )}
      {j.kind === 'latches' && (
        <>
          <Section title="Latch">
            <div className="latch-grid" role="radiogroup" aria-label="Latch type">
              {LATCHES.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={j.latch.kind === l.id} className="latch-card" onClick={() => set((x) => void (x.latch.kind = l.id))}>
                  <LatchGlyph kind={l.id} width={j.latch.width} depth={j.latch.depth} angle={j.latch.angle} clearance={j.latch.clearance} />
                  <span className="option-card__title">{l.label}</span>
                  <span className="option-card__text">{l.text}</span>
                </button>
              ))}
            </div>
          </Section>
          <Section title="Dimensions">
            <SliderField label="Width" value={j.latch.width} min={2} max={60} step={0.5} unit="len" onChange={(v) => set((x) => void (x.latch.width = v))} />
            <SliderField label="Depth" value={j.latch.depth} min={1} max={60} step={0.5} unit="len" onChange={(v) => set((x) => void (x.latch.depth = v))} />
            <SliderField label="Clearance" value={j.latch.clearance} min={0} max={2} step={0.01} unit="len" onChange={(v) => set((x) => void (x.latch.clearance = v))} />
            <SliderField label="Flare angle" value={j.latch.angle} min={5} max={60} step={1} unit="°" onChange={(v) => set((x) => void (x.latch.angle = v))} />
            <SliderField label="Per edge" hint="0 picks a count from the edge length." value={j.latch.perEdge} min={0} max={6} step={1} onChange={(v) => set((x) => void (x.latch.perEdge = v))} />
          </Section>
        </>
      )}
    </>
  );
}
