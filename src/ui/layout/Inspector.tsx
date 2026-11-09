/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { useUI, type StepId } from '@/state/ui';
import { ShapePanel } from '../panels/ShapePanel';
import { SurfacePanel } from '../panels/SurfacePanel';
import { MethodPanel } from '../panels/MethodPanel';
import { JoineryPanel } from '../panels/JoineryPanel';
import { MaterialPanel } from '../panels/MaterialPanel';
import { NestPanel } from '../panels/NestPanel';
import { ExportPanel } from '../panels/ExportPanel';
import { SettingsPanel } from '../panels/SettingsPanel';

const TITLES: Record<StepId, string> = {
  shape: 'Shape',
  surface: 'Surface',
  method: 'Method',
  joinery: 'Joinery',
  material: 'Material & making',
  nest: 'Nest',
  export: 'Export',
  settings: 'Settings',
};

export function Inspector() {
  const step = useUI((s) => s.step);
  return (
    <aside className="inspector" aria-labelledby="inspector-title">
      <header className="inspector__head">
        <h2 id="inspector-title">{TITLES[step]}</h2>
      </header>
      <div className="inspector__body" key={step}>
        {step === 'shape' && <ShapePanel />}
        {step === 'surface' && <SurfacePanel />}
        {step === 'method' && <MethodPanel />}
        {step === 'joinery' && <JoineryPanel />}
        {step === 'material' && <MaterialPanel />}
        {step === 'nest' && <NestPanel />}
        {step === 'export' && <ExportPanel />}
        {step === 'settings' && <SettingsPanel />}
      </div>
    </aside>
  );
}
