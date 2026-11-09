/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { Box, FileCode2, FileText, Layers, Package, Printer, Scissors, Shapes, Table2, Archive, BookOpen, Save } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useProject } from '@/state/project';
import { useResults } from '@/state/results';
import { exporters, useExportProgress } from '@/io/export/exporters';
import type { ModelFormat } from '@/io/export/model3d';
import type { ExportParams } from '@/core/params';
import { Button, Callout, Section, Select, SegmentedField, SliderField, SwitchField } from '../components/controls';

export function ExportPanel() {
  const e = useProject((s) => s.project.export);
  const joinKind = useProject((s) => s.project.joinery.kind);
  const process = useProject((s) => s.project.manufacturing.process);
  const hasSpacers = useResults((s) => !!s.method?.connectorData?.spacers?.length);
  const printable = joinKind === 'printed' || hasSpacers;
  const [fmtPlate, setFmtPlate] = useState<ModelFormat>('3mf');
  const update = useProject((s) => s.update);
  const ready = useResults((s) => !!s.method && !!s.nest && !s.busy);
  const sheets = useResults((s) => s.nest?.sheets.length ?? 0);
  const [fmt3d, setFmt3d] = useState<ModelFormat>('stl');
  const [fmtBase, setFmtBase] = useState<ModelFormat>('stl');
  const [busy, setBusy] = useState<string | null>(null);
  const guideProgress = useExportProgress((s) => s.guide);
  const set = (fn: (x: ExportParams) => void) => update((p) => fn(p.export));
  const go = (key: string, fn: () => Promise<void>) => async () => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  const fmtOptions = [
    { value: 'stl' as const, label: 'STL' },
    { value: 'obj' as const, label: 'OBJ' },
    { value: 'glb' as const, label: 'GLB' },
    { value: '3mf' as const, label: '3MF' },
  ];
  return (
    <>
      {!ready && (
        <div className="panel-pad">
          <Callout tone="info">Exports unlock when the parts and sheets are up to date.</Callout>
        </div>
      )}
      {process === 'print3d' && (
        <Section title="Print plates">
          <ExportRow icon={<Printer size={16} aria-hidden />} title="Plates" text={`${sheets} plate${sheets === 1 ? '' : 's'}, parts laid flat at sheet thickness`}>
            <div className="btn-row btn-row--tight">
              <Select ariaLabel="Format" value={fmtPlate} onChange={setFmtPlate} options={fmtOptions.filter((o) => o.value !== 'glb')} />
              <Button variant="primary" size="sm" onClick={go('plates', () => exporters.plates(fmtPlate))} disabled={!ready || !!busy}>
                Export
              </Button>
            </div>
          </ExportRow>
        </Section>
      )}
      <Section title={process === 'print3d' ? 'Outlines' : 'Cut files'}>
        <ExportRow icon={<Scissors size={16} aria-hidden />} title="DXF cut file" text={`${sheets} sheet${sheets === 1 ? '' : 's'} · layers CUT_INNER, CUT_OUTER, ENGRAVE, SCORE`}>
          <Button variant="primary" size="sm" onClick={go('dxf', exporters.dxf)} disabled={!ready || !!busy}>
            {busy === 'dxf' ? 'Exporting…' : 'DXF'}
          </Button>
        </ExportRow>
        <ExportRow icon={<FileCode2 size={16} aria-hidden />} title="SVG sheets" text="1:1 mm, red cut · blue engrave · green score">
          <Button size="sm" onClick={go('svg', exporters.svg)} disabled={!ready || !!busy}>
            SVG
          </Button>
        </ExportRow>
        <ExportRow icon={<Printer size={16} aria-hidden />} title="PDF sheets" text="One page per sheet, true scale">
          <Button size="sm" onClick={go('pdf', exporters.pdf)} disabled={!ready || !!busy}>
            PDF
          </Button>
        </ExportRow>
        <ExportRow icon={<Shapes size={16} aria-hidden />} title="Flat parts" text="Every part unrolled, not nested">
          <div className="btn-row btn-row--tight">
            <Button size="sm" onClick={go('flat-svg', () => exporters.flat('svg'))} disabled={!ready || !!busy}>
              SVG
            </Button>
            <Button size="sm" onClick={go('flat-dxf', () => exporters.flat('dxf'))} disabled={!ready || !!busy}>
              DXF
            </Button>
          </div>
        </ExportRow>
        <SegmentedField
          label="DXF files"
          value={e.dxfLayout}
          onChange={(v) => set((x) => void (x.dxfLayout = v))}
          options={[
            { value: 'perSheet', label: 'One per sheet' },
            { value: 'allSheets', label: 'All in one' },
          ]}
        />
        <SwitchField label="Draw sheet outline" checked={e.includeSheetFrame} onChange={(v) => set((x) => void (x.includeSheetFrame = v))} />
        <SliderField label="Line width (SVG/PDF)" value={e.svgStroke} min={0.001} max={1} step={0.001} unit="len" onChange={(v) => set((x) => void (x.svgStroke = v))} />
      </Section>
      <Section title="3D">
        <ExportRow icon={<Box size={16} aria-hidden />} title="Assembled model" text="The sheet parts in place, at real thickness">
          <div className="btn-row btn-row--tight">
            <Select ariaLabel="Format" value={fmt3d} onChange={setFmt3d} options={fmtOptions} />
            <Button size="sm" onClick={go('model', () => exporters.model(fmt3d))} disabled={!ready || !!busy}>
              Export
            </Button>
          </div>
        </ExportRow>
        <ExportRow icon={<Layers size={16} aria-hidden />} title="Original model" text="The base shape before remeshing">
          <div className="btn-row btn-row--tight">
            <Select ariaLabel="Format" value={fmtBase} onChange={setFmtBase} options={fmtOptions} />
            <Button size="sm" onClick={go('base', () => exporters.original(fmtBase))} disabled={!!busy}>
              Export
            </Button>
          </div>
        </ExportRow>
        <ExportRow icon={<Layers size={16} aria-hidden />} title="Working surface" text="The remeshed, relaxed surface">
          <Button size="sm" onClick={go('surf', () => exporters.surface(fmtBase))} disabled={!!busy}>
            Export
          </Button>
        </ExportRow>
        <ExportRow
          icon={<Package size={16} aria-hidden />}
          title={hasSpacers ? 'Printed spacers & connectors' : 'Printed connectors'}
          text={printable ? 'STL files + print list, zipped' : 'Choose 3D printed joinery first'}
        >
          <Button size="sm" onClick={go('conn', exporters.connectors)} disabled={!ready || !!busy || !printable}>
            {busy === 'conn' ? 'Building…' : 'STL'}
          </Button>
        </ExportRow>
      </Section>
      <Section title="Documents">
        <ExportRow icon={<BookOpen size={16} aria-hidden />} title="Assembly guide" text="Steps, sheets and a page for every part">
          <Button size="sm" onClick={go('guide', exporters.guide)} disabled={!ready || !!busy}>
            {busy === 'guide' ? `Writing ${Math.round((guideProgress ?? 0) * 100)}%` : 'PDF'}
          </Button>
        </ExportRow>
        <ExportRow icon={<Table2 size={16} aria-hidden />} title="Parts list & stats" text="Sizes, cut length, sheet positions">
          <div className="btn-row btn-row--tight">
            <Button size="sm" onClick={go('csv', () => exporters.partsList('csv'))} disabled={!ready || !!busy}>
              CSV
            </Button>
            <Button size="sm" onClick={go('json', () => exporters.partsList('json'))} disabled={!ready || !!busy}>
              JSON
            </Button>
          </div>
        </ExportRow>
        <ExportRow icon={<Save size={16} aria-hidden />} title="Project file" text="Re-open and keep editing later">
          <Button size="sm" onClick={go('proj', exporters.project)} disabled={!!busy}>
            .flatform
          </Button>
        </ExportRow>
      </Section>
      <div className="panel-pad">
        <Button variant="primary" full icon={<Archive size={15} aria-hidden />} onClick={go('all', exporters.all)} disabled={!ready || !!busy}>
          {busy === 'all' ? 'Packing…' : 'Export everything (.zip)'}
        </Button>
        <p className="muted small center">
          <FileText size={12} aria-hidden /> DXF + SVG per sheet, PDF, flat parts, 3D models and the project.
        </p>
      </div>
    </>
  );
}

function ExportRow({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <div className="export-row">
      <span className="export-row__icon">{icon}</span>
      <span className="export-row__text">
        <span className="export-row__title">{title}</span>
        <span className="export-row__sub">{text}</span>
      </span>
      <span className="export-row__action">{children}</span>
    </div>
  );
}
