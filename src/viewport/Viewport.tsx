/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { lazy, Suspense } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useUI, useLayerColors, type Overlays } from '@/state/ui';
import { useResults } from '@/state/results';
import { useProject } from '@/state/project';
import { GROUP_LETTERS, cutLength } from '@/core/parts';
import { useUnits } from '@/ui/components/controls';
import { Canvas2D } from './Canvas2D';

const Scene3D = lazy(() => import('./Scene3D').then((m) => ({ default: m.Scene3D })));

export function Viewport() {
  const view = useUI((s) => s.view);
  const step = useUI((s) => s.step);
  const busy = useResults((s) => s.busy);
  const stage = useResults((s) => s.stage);
  const hasParts = useResults((s) => !!s.method?.parts.length);
  return (
    <main className="viewport" aria-label="Viewport">
      {view === '3d' ? (
        <Suspense fallback={<div className="viewport__loading">Starting 3D view…</div>}>
          <Scene3D />
        </Suspense>
      ) : hasParts ? (
        <Canvas2D mode={view === 'flat' ? 'flat' : 'sheets'} />
      ) : (
        <div className="viewport__empty">Parts appear here once the method has run.</div>
      )}
      {view === '3d' && step !== 'shape' && step !== 'surface' && <DisplayBar />}
      {view === '3d' && step === 'shape' && <ShapeHint />}
      <PartCard />
      {busy && (
        <div className="viewport__busy" role="status">
          <Loader2 size={14} className="spin" aria-hidden />
          {stage}
        </div>
      )}
    </main>
  );
}

function ShapeHint() {
  const tool = useUI((s) => s.shapeTool);
  const source = useProject((s) => s.project.shape.source);
  const text =
    tool === 'sculpt'
      ? 'Drag on the shape to sculpt · Alt reverses · right-drag to orbit'
      : source === 'skeleton'
        ? 'Click a node to select it, drag the arrows to move it · F frames the view'
        : 'Drag to orbit · scroll to zoom · F frames the view';
  return <div className="viewport__hint">{text}</div>;
}

function DisplayBar() {
  const ov = useUI((s) => s.overlays);
  const setOverlay = useUI((s) => s.setOverlay);
  const set = useUI((s) => s.set);
  const method = useResults((s) => s.method);
  const colors = useLayerColors();
  const step = useUI((s) => s.step);
  const groups = [...new Set(method?.parts.map((p) => p.group) ?? [])].sort();
  const toggles: { k: keyof Omit<Overlays, 'hiddenGroups'>; label: string; show: boolean }[] = [
    { k: 'base', label: 'Surface', show: true },
    { k: 'clusters', label: 'Clusters', show: method?.assembly.kind === 'lattice' && step === 'method' },
    { k: 'maze', label: 'Maze lines', show: method?.assembly.kind === 'lattice' && step === 'method' },
    { k: 'parts', label: 'Parts', show: true },
    { k: 'pins', label: 'Pins', show: !!method?.assembly.pins },
  ];
  return (
    <div className="display-bar" role="toolbar" aria-label="Display">
      {toggles
        .filter((t) => t.show)
        .map((t) => (
          <button key={t.k} type="button" className="display-bar__toggle" aria-pressed={ov[t.k]} onClick={() => setOverlay(t.k, !ov[t.k])}>
            {ov[t.k] ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
            {t.label}
          </button>
        ))}
      {groups.length > 1 && <span className="display-bar__sep" aria-hidden />}
      {groups.length > 1 &&
        groups.map((g) => {
          const hidden = ov.hiddenGroups.includes(g);
          return (
            <button
              key={g}
              type="button"
              className="display-bar__group"
              aria-pressed={!hidden}
              aria-label={`${hidden ? 'Show' : 'Hide'} group ${GROUP_LETTERS[g]}`}
              onClick={() => set({ overlays: { ...ov, hiddenGroups: hidden ? ov.hiddenGroups.filter((x) => x !== g) : [...ov.hiddenGroups, g] } })}
            >
              <span className="display-bar__swatch" style={{ background: colors[g % colors.length], opacity: hidden ? 0.25 : 1 }} />
              {GROUP_LETTERS[g]}
            </button>
          );
        })}
    </div>
  );
}

/** Details of the selected (or hovered) part: the link between flat and 3D. */
function PartCard() {
  const sel = useUI((s) => s.selectedPart);
  const hov = useUI((s) => s.hoveredPart);
  const id = sel ?? hov;
  const part = useResults((s) => (id ? s.partIndex.get(id) : undefined));
  const nest = useResults((s) => s.nest);
  const colors = useLayerColors();
  const u = useUnits();
  if (!part) return null;
  const sheet = nest?.sheets.find((s) => s.placements.some((p) => p.partId === part.id));
  return (
    <div className="part-card" data-pinned={!!sel}>
      <div className="part-card__head">
        <span className="part-card__swatch" style={{ background: colors[part.group % colors.length] }} aria-hidden />
        <span className="part-card__id">{part.id}</span>
        <span className="part-card__group">{part.groupName}</span>
      </div>
      <dl className="part-card__facts">
        <div>
          <dt>Size</dt>
          <dd>
            {u.fmt(part.bbox.maxX - part.bbox.minX, 0)} × {u.fmt(part.bbox.maxY - part.bbox.minY, 0)}
          </dd>
        </div>
        <div>
          <dt>Cut</dt>
          <dd>{u.fmt(cutLength(part), 0)}</dd>
        </div>
        {part.holes.length > 0 && (
          <div>
            <dt>Holes</dt>
            <dd>{part.holes.length}</dd>
          </div>
        )}
        {sheet && (
          <div>
            <dt>Sheet</dt>
            <dd>{sheet.index + 1}</dd>
          </div>
        )}
      </dl>
      {sel && <p className="part-card__hint">Selected in every view. Press Esc to clear.</p>}
    </div>
  );
}
