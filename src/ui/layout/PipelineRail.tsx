import { Settings as Cog } from 'lucide-react';
import { useProject } from '@/state/project';
import { useResults } from '@/state/results';
import { useUI, type StepId } from '@/state/ui';
import { pinHoleDiameter } from '@/core/joinery/holes';
import { useUnits } from '../components/controls';

const METHOD_NAMES = { lattice: 'Branching lattice', slices: 'Stacked slices', waffle: 'Interlocking waffle', folded: 'Folded panels' } as const;
const JOIN_NAMES = { screws: 'Screws', printed: 'Printed connectors', none: 'Plain holes', latches: 'Folding latches' } as const;

/** The build order is the navigation. Each step shows its live result. */
export function PipelineRail() {
  const step = useUI((s) => s.step);
  const setStep = useUI((s) => s.setStep);
  const p = useProject((s) => s.project);
  const r = useResults();
  const u = useUnits();
  const triCount = r.surface ? r.surface.indices.length / 3 : 0;
  const parts = r.method?.parts.length ?? 0;
  const sheets = r.nest?.sheets.length ?? 0;
  const util = r.nest?.sheets.length ? r.nest.sheets.reduce((s, x) => s + x.utilisation, 0) / r.nest.sheets.length : 0;

  const shapeSummary =
    p.shape.source === 'skeleton'
      ? `Skeleton · ${p.shape.skeleton.edges.length} lines`
      : p.shape.source === 'primitive'
        ? `Primitive · ${p.shape.primitive.kind}`
        : p.shape.meshName || 'Imported mesh';
  const steps: { id: StepId; title: string; summary: string; state: 'ok' | 'busy' | 'warn' | 'idle' }[] = [
    { id: 'shape', title: 'Shape', summary: shapeSummary, state: r.base ? 'ok' : 'busy' },
    { id: 'surface', title: 'Surface', summary: triCount ? `${triCount.toLocaleString()} triangles` : '—', state: r.stale.surface ? 'busy' : r.warnings.length ? 'warn' : 'ok' },
    {
      id: 'method',
      title: 'Method',
      summary: `${METHOD_NAMES[p.method]}${parts ? ` · ${parts} parts` : ''}`,
      state: r.stale.method ? 'busy' : r.method?.warnings.length ? 'warn' : r.method ? 'ok' : 'idle',
    },
    {
      id: 'joinery',
      title: 'Joinery',
      summary:
        p.joinery.kind === 'latches'
          ? `Latches · ${p.joinery.latch.kind}`
          : `${JOIN_NAMES[p.joinery.kind]}${pinHoleDiameter(p.joinery) ? ` · Ø${u.fmt(pinHoleDiameter(p.joinery))}` : ''}`,
      state: 'ok',
    },
    { id: 'material', title: 'Material & sheet', summary: `${p.material.thickness} mm · ${p.sheet.width}×${p.sheet.height}`, state: 'ok' },
    {
      id: 'nest',
      title: 'Nest',
      summary: sheets ? `${sheets} sheet${sheets > 1 ? 's' : ''} · ${Math.round(util * 100)}% used` : '—',
      state: r.stale.nest ? 'busy' : r.nest?.unplaced.length ? 'warn' : r.nest ? 'ok' : 'idle',
    },
    { id: 'export', title: 'Export', summary: 'DXF, SVG, PDF, 3D, guide', state: 'idle' },
  ];
  return (
    <nav className="rail" aria-label="Build steps">
      <ol className="rail__list">
        {steps.map((s, i) => (
          <li key={s.id}>
            <button type="button" className="rail__step" aria-current={step === s.id ? 'step' : undefined} onClick={() => setStep(s.id)}>
              <span className="rail__index" aria-hidden>
                {i + 1}
              </span>
              <span className="rail__text">
                <span className="rail__title">{s.title}</span>
                <span className="rail__summary">{s.summary}</span>
              </span>
              <span className={`rail__dot rail__dot--${s.state}`} aria-label={s.state === 'busy' ? 'updating' : s.state === 'warn' ? 'has warnings' : undefined} />
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="rail__step rail__settings" aria-current={step === 'settings' ? 'step' : undefined} onClick={() => setStep('settings')}>
        <span className="rail__index" aria-hidden>
          <Cog size={13} />
        </span>
        <span className="rail__text">
          <span className="rail__title">Settings</span>
          <span className="rail__summary">Look, colours, units</span>
        </span>
      </button>
    </nav>
  );
}
