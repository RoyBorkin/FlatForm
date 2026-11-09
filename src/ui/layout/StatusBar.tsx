/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { useMemo } from 'react';
import { useResults } from '@/state/results';
import { useProject } from '@/state/project';
import { estimate } from '@/core/manufacturing/manufacturing';
import { useUnits } from '../components/controls';

/** Live numbers that prove the build: parts, sheets, pins, cut length, cost. */
export function StatusBar() {
  const r = useResults();
  const p = useProject((s) => s.project);
  const u = useUnits();
  const stats = useMemo(() => {
    const parts = r.method?.parts ?? [];
    const e = estimate(parts, p);
    const sheets = r.nest?.sheets.length ?? 0;
    return { parts: parts.length, sheets, cut: e.cutLength, minutes: e.minutes, weight: e.weight, cost: sheets * p.material.pricePerSheet, pins: r.method?.connectorData?.pinCount ?? 0 };
  }, [r.method, r.nest, p]);
  const process = p.manufacturing.process;
  const tris = r.surface ? r.surface.indices.length / 3 : 0;
  const warnCount = r.warnings.length + (r.method?.warnings.length ?? 0) + (r.nest?.unplaced.length ? 1 : 0);
  return (
    <footer className="status" aria-live="polite">
      <dl className="status__stats">
        <Stat k="Triangles" v={tris.toLocaleString()} />
        <Stat k="Parts" v={stats.parts.toLocaleString()} />
        {stats.pins > 0 && <Stat k={p.method === 'slices' ? 'Dowels' : 'Pins'} v={stats.pins.toLocaleString()} />}
        <Stat k={process === 'print3d' ? 'Plates' : 'Sheets'} v={String(stats.sheets)} />
        {process !== 'print3d' && <Stat k="Cut length" v={stats.cut > 10000 ? `${(stats.cut / 1000).toFixed(1)} m` : u.fmt(stats.cut, 0)} />}
        <Stat k={process === 'print3d' ? 'Print time' : process === 'cnc' ? 'Router time' : 'Cut time'} v={`≈ ${stats.minutes < 60 ? `${Math.round(stats.minutes)} min` : `${(stats.minutes / 60).toFixed(1)} h`}`} />
        <Stat k="Weight" v={`≈ ${stats.weight >= 1000 ? `${(stats.weight / 1000).toFixed(2)} kg` : `${Math.round(stats.weight)} g`}`} />
        {process !== 'print3d' && <Stat k="Material" v={`≈ ${stats.cost.toFixed(0)}`} />}
        {warnCount > 0 && <Stat k="Warnings" v={String(warnCount)} tone="warn" />}
      </dl>
      <div className="status__engine">
        {r.error ? (
          <span className="status__error">Error: {r.error}</span>
        ) : (
          <>
            <span className="status__stage">{r.busy ? r.stage : 'Up to date'}</span>
            <span className="status__bar" data-busy={r.busy}>
              <span style={{ transform: `scaleX(${r.busy ? Math.max(0.05, r.progress) : 1})` }} />
            </span>
          </>
        )}
      </div>
    </footer>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: 'warn' }) {
  return (
    <div className="stat" data-tone={tone}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
