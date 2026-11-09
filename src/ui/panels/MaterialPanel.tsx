/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { Flame, Printer, Drill } from 'lucide-react';
import { useProject } from '@/state/project';
import { useResults } from '@/state/results';
import { MATERIAL_PRESETS, PRINT_BEDS, PRINT_MATERIALS, SHEET_PRESETS } from '@/core/presets';
import type { ManufacturingParams, MaterialParams, Process, SheetParams } from '@/core/params';
import { estimate } from '@/core/manufacturing/manufacturing';
import { Callout, ColorInput, Field, NumberField, Section, Segmented, SelectField, SliderField, SwitchField, useUnits } from '../components/controls';

const PROCESS_TEXT: Record<Process, string> = {
  laser: 'Cut and engrave sheet on a laser cutter. Exports DXF/SVG with cut, score and engrave layers.',
  cnc: 'Route sheet with an end mill. Inside corners get dog-bones so slots and tabs still fit.',
  print3d: 'Print every part flat on the bed, at the sheet thickness. Parts are nested per print plate.',
};

function ManufacturingSection() {
  const M = useProject((s) => s.project.manufacturing);
  const update = useProject((s) => s.update);
  const set = (fn: (x: ManufacturingParams) => void) => update((p) => fn(p.manufacturing));
  const bed = PRINT_BEDS.find((b) => b.w === M.print.bedW && b.h === M.print.bedH)?.id ?? 'custom';
  return (
    <Section title="Making">
      <Segmented<Process>
        ariaLabel="Manufacturing process"
        value={M.process}
        onChange={(v) =>
          update((p) => {
            p.manufacturing.process = v;
            // Printing in steel or plywood makes no sense: switch to a printable stock.
            const pla = MATERIAL_PRESETS.find((m) => m.preset === 'pla-2');
            if (v === 'print3d' && pla && p.material.look !== 'plastic') p.material = { ...pla };
          })
        }
        options={[
          { value: 'laser', label: 'Laser', icon: <Flame size={13} aria-hidden /> },
          { value: 'cnc', label: 'CNC', icon: <Drill size={13} aria-hidden /> },
          { value: 'print3d', label: '3D print', icon: <Printer size={13} aria-hidden /> },
        ]}
      />
      <p className="muted small">{PROCESS_TEXT[M.process]}</p>
      {M.process === 'laser' && (
        <>
          <SliderField label="Passes" value={M.laser.passes} min={1} max={10} step={1} onChange={(v) => set((x) => void (x.laser.passes = v))} />
          <NumberField label="Engrave speed" value={M.laser.engraveSpeed} min={1} max={2000} step={1} unit="mm/s" onChange={(v) => set((x) => void (x.laser.engraveSpeed = v))} />
          <SliderField label="Holding bridges" hint="Small uncut gaps per outline keep parts in the sheet. 0 = cut free." value={M.laser.bridges} min={0} max={8} step={1} onChange={(v) => set((x) => void (x.laser.bridges = v))} />
          {M.laser.bridges > 0 && <SliderField label="Bridge width" value={M.laser.bridgeWidth} min={0.1} max={3} step={0.05} unit="len" onChange={(v) => set((x) => void (x.laser.bridgeWidth = v))} />}
        </>
      )}
      {M.process === 'cnc' && (
        <>
          <SliderField label="Tool diameter" value={M.cnc.toolDiameter} min={0.5} max={12.7} step={0.005} unit="len" onChange={(v) => set((x) => void (x.cnc.toolDiameter = v))} />
          <SwitchField label="Corner reliefs" hint="Cuts a little past every inside corner so square tabs seat fully." checked={M.cnc.dogbones} onChange={(v) => set((x) => void (x.cnc.dogbones = v))} />
          {M.cnc.dogbones && (
            <Segmented
              ariaLabel="Relief style"
              size="sm"
              value={M.cnc.dogboneStyle}
              onChange={(v) => set((x) => void (x.cnc.dogboneStyle = v))}
              options={[
                { value: 'dogbone', label: 'Dog-bone' },
                { value: 'tbone', label: 'T-bone' },
              ]}
            />
          )}
          <SliderField label="Holding tabs" hint="Per outline, left on the last pass." value={M.cnc.tabs} min={0} max={8} step={1} onChange={(v) => set((x) => void (x.cnc.tabs = v))} />
          {M.cnc.tabs > 0 && <SliderField label="Tab width" value={M.cnc.tabWidth} min={1} max={20} step={0.5} unit="len" onChange={(v) => set((x) => void (x.cnc.tabWidth = v))} />}
          <NumberField label="Feed" value={M.cnc.feed} min={50} max={20000} step={10} unit="mm/min" onChange={(v) => set((x) => void (x.cnc.feed = v))} />
          <SliderField label="Depth per pass" value={M.cnc.depthPerPass} min={0.1} max={12} step={0.1} unit="len" onChange={(v) => set((x) => void (x.cnc.depthPerPass = v))} />
        </>
      )}
      {M.process === 'print3d' && (
        <>
          <SelectField
            label="Printer bed"
            value={bed}
            onChange={(id) => {
              const b = PRINT_BEDS.find((x) => x.id === id);
              if (b) set((x) => void ((x.print.bed = b.id), (x.print.bedW = b.w), (x.print.bedH = b.h)));
            }}
            options={[...PRINT_BEDS.map((b) => ({ value: b.id, label: b.label })), { value: 'custom', label: 'Custom', disabled: true }]}
          />
          <div className="field-pair">
            <NumberField label="Width" value={M.print.bedW} min={50} max={1000} step={1} unit="len" onChange={(v) => set((x) => void ((x.print.bedW = v), (x.print.bed = 'custom')))} />
            <NumberField label="Depth" value={M.print.bedH} min={50} max={1000} step={1} unit="len" onChange={(v) => set((x) => void ((x.print.bedH = v), (x.print.bed = 'custom')))} />
          </div>
          <SelectField
            label="Filament"
            value={M.print.material}
            onChange={(v) => set((x) => void ((x.print.material = v), (x.print.density = PRINT_MATERIALS[v])))}
            options={(Object.keys(PRINT_MATERIALS) as (keyof typeof PRINT_MATERIALS)[]).map((k) => ({ value: k, label: k, hint: `${PRINT_MATERIALS[k]} g/cm³` }))}
          />
          <SliderField label="Layer height" value={M.print.layerHeight} min={0.05} max={0.6} step={0.01} unit="len" onChange={(v) => set((x) => void (x.print.layerHeight = v))} />
          <SliderField label="Nozzle" value={M.print.nozzle} min={0.2} max={1.2} step={0.05} unit="len" onChange={(v) => set((x) => void (x.print.nozzle = v))} />
          <SliderField label="Infill" value={Math.round(M.print.infill * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => set((x) => void (x.print.infill = v / 100))} />
          <SliderField label="Brim" hint="Extra room left around each part on the plate." value={M.print.brim} min={0} max={10} step={0.5} unit="len" onChange={(v) => set((x) => void (x.print.brim = v))} />
          <SliderField label="Flow" hint="Volume the printer lays down per second, for the time estimate." value={M.print.speed} min={1} max={60} step={0.5} unit="mm³/s" onChange={(v) => set((x) => void (x.print.speed = v))} />
        </>
      )}
    </Section>
  );
}

function WeightReadout() {
  const parts = useResults((s) => s.method?.parts);
  const p = useProject((s) => s.project);
  const u = useUnits();
  if (!parts?.length) return null;
  const e = estimate(parts, p);
  return (
    <dl className="readout">
      <div>
        <dt>Weight</dt>
        <dd>{e.weight >= 1000 ? `${(e.weight / 1000).toFixed(2)} kg` : `${Math.round(e.weight)} g`}</dd>
      </div>
      <div>
        <dt>Volume</dt>
        <dd>{e.volume.toFixed(0)} cm³</dd>
      </div>
      {e.cutLength > 0 && (
        <div>
          <dt>Cut length</dt>
          <dd>{e.cutLength > 10000 ? `${(e.cutLength / 1000).toFixed(1)} m` : u.fmt(e.cutLength, 0)}</dd>
        </div>
      )}
    </dl>
  );
}

export function MaterialPanel() {
  const m = useProject((s) => s.project.material);
  const sh = useProject((s) => s.project.sheet);
  const method = useProject((s) => s.project.method);
  const update = useProject((s) => s.update);
  const setM = (fn: (x: MaterialParams) => void) => update((p) => fn(p.material));
  const setS = (fn: (x: SheetParams) => void) => update((p) => fn(p.sheet));
  const sheetPreset = SHEET_PRESETS.find((x) => x.w === sh.width && x.h === sh.height)?.id ?? 'custom';
  const process = useProject((s) => s.project.manufacturing.process);
  return (
    <>
      <ManufacturingSection />
      <Section title="Material">
        <SelectField
          label="Stock"
          value={MATERIAL_PRESETS.some((x) => x.preset === m.preset) ? m.preset : 'custom'}
          onChange={(id) => {
            const preset = MATERIAL_PRESETS.find((x) => x.preset === id);
            if (preset) update((p) => void (p.material = { ...preset }));
          }}
          options={[...MATERIAL_PRESETS.map((x) => ({ value: x.preset, label: x.name })), { value: 'custom', label: 'Custom', disabled: true }]}
        />
        <SliderField label="Thickness" value={m.thickness} min={0.1} max={25} step={0.05} unit="len" onChange={(v) => setM((x) => void ((x.thickness = v), (x.preset = 'custom')))} />
        <SliderField label="Kerf" hint="Width of material the beam or bit removes." value={m.kerf} min={0} max={3} step={0.01} unit="len" onChange={(v) => setM((x) => void (x.kerf = v))} />
        <NumberField
          label="Min bend radius"
          hint="0 means the sheet cannot bend. Lattice strips need a bendable sheet."
          value={m.minBendRadius}
          min={0}
          max={5000}
          step={1}
          unit="len"
          onChange={(v) => setM((x) => void (x.minBendRadius = v))}
        />
        <NumberField label="Density" hint="For the weight estimate." value={m.density} min={1} max={25000} step={1} unit="kg/m³" onChange={(v) => setM((x) => void (x.density = v))} />
        <WeightReadout />
        <NumberField label="Price per sheet" value={m.pricePerSheet} min={0} max={100000} step={0.5} onChange={(v) => setM((x) => void (x.pricePerSheet = v))} />
        {process === 'laser' && <NumberField label="Cut speed" hint="Used for the cut time estimate." value={m.cutSpeed} min={1} max={2000} step={1} unit="mm/s" onChange={(v) => setM((x) => void (x.cutSpeed = v))} />}
        <Field label="Render colour" inline>
          <ColorInput label="Material colour" value={m.color} onChange={(v) => setM((x) => void (x.color = v))} />
        </Field>
        {method === 'lattice' && m.minBendRadius === 0 && <Callout tone="warn">This stock does not bend. Lattice strips need thin metal, thin plywood, plastic or card.</Callout>}
      </Section>
      {process === 'print3d' ? null : (
      <Section title="Sheet">
        <SelectField
          label="Size"
          value={sheetPreset}
          onChange={(id) => {
            const p = SHEET_PRESETS.find((x) => x.id === id);
            if (p) setS((x) => void ((x.width = p.w), (x.height = p.h)));
          }}
          options={[...SHEET_PRESETS.map((x) => ({ value: x.id, label: x.label })), { value: 'custom', label: 'Custom', disabled: true }]}
        />
        <NumberField label="Width" value={sh.width} min={20} max={10000} step={1} unit="len" onChange={(v) => setS((x) => void (x.width = v))} />
        <NumberField label="Height" value={sh.height} min={20} max={10000} step={1} unit="len" onChange={(v) => setS((x) => void (x.height = v))} />
        <SliderField label="Margin" value={sh.margin} min={0} max={50} step={0.5} unit="len" onChange={(v) => setS((x) => void (x.margin = v))} />
        <SliderField label="Part spacing" value={sh.spacing} min={0} max={30} step={0.25} unit="len" onChange={(v) => setS((x) => void (x.spacing = v))} />
        <SwitchField
          label="Kerf compensation"
          hint="Offset outlines out and holes in by half the kerf in the exported files, so parts come out at true size."
          checked={sh.kerfCompensation}
          onChange={(v) => setS((x) => void (x.kerfCompensation = v))}
        />
      </Section>
      )}
    </>
  );
}
