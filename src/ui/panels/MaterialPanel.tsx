import { useProject } from '@/state/project';
import { MATERIAL_PRESETS, SHEET_PRESETS } from '@/core/presets';
import type { MaterialParams, SheetParams } from '@/core/params';
import { Callout, ColorInput, Field, NumberField, Section, SelectField, SliderField, SwitchField } from '../components/controls';

export function MaterialPanel() {
  const m = useProject((s) => s.project.material);
  const sh = useProject((s) => s.project.sheet);
  const method = useProject((s) => s.project.method);
  const update = useProject((s) => s.update);
  const setM = (fn: (x: MaterialParams) => void) => update((p) => fn(p.material));
  const setS = (fn: (x: SheetParams) => void) => update((p) => fn(p.sheet));
  const sheetPreset = SHEET_PRESETS.find((x) => x.w === sh.width && x.h === sh.height)?.id ?? 'custom';
  return (
    <>
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
        <NumberField label="Price per sheet" value={m.pricePerSheet} min={0} max={100000} step={0.5} onChange={(v) => setM((x) => void (x.pricePerSheet = v))} />
        <NumberField label="Cut speed" hint="Used for the cut time estimate." value={m.cutSpeed} min={1} max={2000} step={1} unit="mm/s" onChange={(v) => setM((x) => void (x.cutSpeed = v))} />
        <Field label="Render colour" inline>
          <ColorInput label="Material colour" value={m.color} onChange={(v) => setM((x) => void (x.color = v))} />
        </Field>
        {method === 'lattice' && m.minBendRadius === 0 && <Callout tone="warn">This stock does not bend. Lattice strips need thin metal, thin plywood, plastic or card.</Callout>}
      </Section>
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
    </>
  );
}
