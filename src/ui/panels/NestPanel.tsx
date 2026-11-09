/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { useProject } from '@/state/project';
import { useResults } from '@/state/results';
import { useLayerColors, useUI } from '@/state/ui';
import type { NestParams } from '@/core/params';
import { Callout, Section, SegmentedField, SliderField, SwitchField } from '../components/controls';

export function NestPanel() {
  const n = useProject((s) => s.project.nest);
  const update = useProject((s) => s.update);
  const nest = useResults((s) => s.nest);
  const stale = useResults((s) => s.stale.nest);
  const method = useResults((s) => s.method);
  const colors = useLayerColors();
  const setUI = useUI((s) => s.set);
  const set = (fn: (x: NestParams) => void) => update((p) => fn(p.nest));
  const groupNames = new Map((method?.parts ?? []).map((p) => [p.group, p.groupName]));
  return (
    <>
      <Section title="Nesting">
        <SegmentedField
          label="Mode"
          hint="Tight interlocks irregular parts on a fine grid. Fast packs bounding boxes."
          value={n.mode}
          onChange={(v) => set((x) => void (x.mode = v))}
          options={[
            { value: 'tight', label: 'Tight' },
            { value: 'fast', label: 'Fast' },
          ]}
        />
        <SegmentedField
          label="Rotations"
          hint="1 keeps the grain direction."
          value={String(n.rotations) as '1' | '2' | '4' | '8' | '16'}
          onChange={(v) => set((x) => void (x.rotations = Number(v) as NestParams['rotations']))}
          options={['1', '2', '4', '8', '16'].map((v) => ({ value: v as '1', label: v }))}
        />
        {n.mode === 'tight' && (
          <SliderField label="Grid" hint="Smaller packs tighter but takes longer." value={n.resolution} min={0.5} max={10} step={0.25} unit="len" onChange={(v) => set((x) => void (x.resolution = v))} />
        )}
        <SwitchField label="Separate sheets per layer" checked={n.groupByLayer} onChange={(v) => set((x) => void (x.groupByLayer = v))} />
      </Section>
      {nest?.unplaced.length ? (
        <div className="panel-pad">
          <Callout tone="warn">
            {nest.unplaced.length} part{nest.unplaced.length > 1 ? 's do' : ' does'} not fit on the sheet: {nest.unplaced.slice(0, 8).join(', ')}
            {nest.unplaced.length > 8 ? '…' : ''}. Use a bigger sheet or smaller parts.
          </Callout>
        </div>
      ) : null}
      <Section title={`Sheets${nest ? ` (${nest.sheets.length})` : ''}`}>
        {stale && <p className="muted small">Updating…</p>}
        <ul className="sheet-list">
          {nest?.sheets.map((s) => (
            <li key={s.index}>
              <button type="button" className="sheet-row" onClick={() => setUI({ view: 'sheets' })}>
                <span className="sheet-row__swatch" style={{ background: colors[s.group % colors.length] }} aria-hidden />
                <span className="sheet-row__name">Sheet {s.index + 1}</span>
                <span className="sheet-row__meta">
                  {groupNames.get(s.group) ?? ''} · {s.placements.length} parts
                </span>
                <span className="sheet-row__util">
                  <span className="meter" aria-hidden>
                    <span style={{ transform: `scaleX(${Math.min(1, s.utilisation)})` }} />
                  </span>
                  {Math.round(s.utilisation * 100)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
