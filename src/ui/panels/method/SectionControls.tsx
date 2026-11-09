/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { useProject } from '@/state/project';
import type { ClassicParams, CurveParams, LayersParams } from '@/core/params';
import { Section, SegmentedField, SliderField, SwitchField } from '../../components/controls';
import { CurveField } from './CurveField';

export function LayersControls() {
  const L = useProject((s) => s.project.layers);
  const t = useProject((s) => s.project.material.thickness);
  const update = useProject((s) => s.update);
  const set = (fn: (x: LayersParams) => void) => update((p) => fn(p.layers));
  return (
    <>
      <Section title="Direction">
        <SegmentedField
          label="Layers follow"
          value={L.mode}
          onChange={(v) => set((x) => void (x.mode = v))}
          options={[
            { value: 'direction', label: 'A direction' },
            { value: 'curve', label: 'A curve' },
          ]}
        />
        {L.mode === 'direction' ? (
          <>
            <SliderField label="Turn (azimuth)" hint="Rotation around the vertical axis." value={L.azimuth} min={-180} max={180} step={1} unit="°" onChange={(v) => set((x) => void (x.azimuth = v))} />
            <SliderField label="Tilt (elevation)" hint="90° stacks horizontal layers; 0° stands them up." value={L.elevation} min={-90} max={90} step={1} unit="°" onChange={(v) => set((x) => void (x.elevation = v))} />
          </>
        ) : (
          <CurveField label="Guide curve" value={L.curve} onChange={(fn: (c: CurveParams) => void) => set((x) => fn(x.curve))} />
        )}
        <SliderField label="Spacing" hint="Centre to centre. The gap between layers is spacing minus sheet thickness." value={L.pitch} min={t} max={200} step={0.5} unit="len" onChange={(v) => set((x) => void (x.pitch = v))} />
        <SwitchField label="Hollow" hint="Keep a ring of material, with a hub and spokes around every rod." checked={L.hollow} onChange={(v) => set((x) => void (x.hollow = v))} />
        <SliderField label={L.hollow ? 'Wall' : 'Band (open surfaces)'} value={L.wall} min={2} max={150} step={0.5} unit="len" onChange={(v) => set((x) => void (x.wall = v))} />
      </Section>
      <Section title="Rods & spacers">
        <SliderField
          label={L.mode === 'curve' ? 'Spine rod' : 'Rods'}
          hint={L.mode === 'curve' ? 'A bendable rod or wire along the curve.' : 'Each rod runs through the longest run of layers it can.'}
          value={L.mode === 'curve' ? Math.min(1, L.rods) : L.rods}
          min={0}
          max={L.mode === 'curve' ? 1 : 4}
          step={1}
          onChange={(v) => set((x) => void (x.rods = v))}
        />
        <SwitchField label="3D-printed spacers" hint="Printed between layers on every rod, to hold the gap. Exported from the Export step." checked={L.spacer.enabled} onChange={(v) => set((x) => void (x.spacer.enabled = v))} />
        {L.spacer.enabled && (
          <>
            <SegmentedField
              label="Spacer shape"
              value={L.spacer.shape}
              onChange={(v) => set((x) => void (x.spacer.shape = v))}
              options={[
                { value: 'round', label: 'Round' },
                { value: 'square', label: 'Square' },
                { value: 'hex', label: 'Hex' },
                { value: 'star', label: 'Star' },
              ]}
            />
            <SliderField label="Spacer size" value={L.spacer.size} min={4} max={60} step={0.5} unit="len" onChange={(v) => set((x) => void (x.spacer.size = v))} />
          </>
        )}
        <SwitchField label="Engrave guides" hint="The next layer's outline and each spacer's footprint." checked={L.registration} onChange={(v) => set((x) => void (x.registration = v))} />
        <SwitchField label="Number layers" checked={L.labelParts} onChange={(v) => set((x) => void (x.labelParts = v))} />
        <SliderField label="Text height" value={L.textHeight} min={1} max={30} step={0.5} unit="len" onChange={(v) => set((x) => void (x.textHeight = v))} />
      </Section>
    </>
  );
}

export function ClassicControls() {
  const C = useProject((s) => s.project.classic);
  const update = useProject((s) => s.update);
  const set = (fn: (x: ClassicParams) => void) => update((p) => fn(p.classic));
  return (
    <>
      <Section title="Style">
        <SegmentedField
          label="Style"
          value={C.style}
          onChange={(v) => set((x) => void (x.style = v))}
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'revolve', label: 'Revolve' },
            { value: 'curve', label: 'Along curve' },
          ]}
        />
        {C.style === 'grid' && (
          <>
            <SegmentedField
              label="Rib families"
              hint="The plane the grid is seen in. Slots run square to it."
              value={C.grid.plane}
              onChange={(v) => set((x) => void (x.grid.plane = v))}
              options={[
                { value: 'xy', label: 'Top (XY)' },
                { value: 'xz', label: 'Front (XZ)' },
                { value: 'yz', label: 'Side (YZ)' },
              ]}
            />
            <SliderField label="Ribs A" value={C.grid.countA} min={1} max={60} step={1} onChange={(v) => set((x) => void (x.grid.countA = v))} />
            <SliderField label="Ribs B" value={C.grid.countB} min={1} max={60} step={1} onChange={(v) => set((x) => void (x.grid.countB = v))} />
            <SliderField label="Rotate grid" value={C.grid.rotate} min={-90} max={90} step={1} unit="°" onChange={(v) => set((x) => void (x.grid.rotate = v))} />
            <SliderField label="Edge inset" value={Math.round(C.grid.inset * 100)} min={0} max={40} step={1} unit="%" onChange={(v) => set((x) => void (x.grid.inset = v / 100))} />
          </>
        )}
        {C.style === 'revolve' && (
          <>
            <SliderField label="Profiles" hint="Full profiles through the vertical axis. Each is cut as two halves that slide into the rings." value={C.revolve.profiles} min={2} max={12} step={1} onChange={(v) => set((x) => void (x.revolve.profiles = v))} />
            <SliderField label="Rings" value={C.revolve.rings} min={1} max={40} step={1} onChange={(v) => set((x) => void (x.revolve.rings = v))} />
            <SliderField label="Turn profiles" value={C.revolve.twist} min={-90} max={90} step={1} unit="°" onChange={(v) => set((x) => void (x.revolve.twist = v))} />
            <SliderField label="End inset" value={Math.round(C.revolve.inset * 100)} min={0} max={40} step={1} unit="%" onChange={(v) => set((x) => void (x.revolve.inset = v / 100))} />
          </>
        )}
        {C.style === 'curve' && (
          <>
            <CurveField label="Spine curve" value={C.curve.curve} onChange={(fn: (c: CurveParams) => void) => set((x) => fn(x.curve.curve))} />
            <SliderField label="Ribs" value={C.curve.ribs} min={2} max={80} step={1} onChange={(v) => set((x) => void (x.curve.ribs = v))} />
            <SliderField label="Spines" value={C.curve.spines} min={1} max={3} step={1} onChange={(v) => set((x) => void (x.curve.spines = v))} />
            {C.curve.spines > 1 && <SliderField label="Spine spread" value={C.curve.spineGap} min={2} max={400} step={1} unit="len" onChange={(v) => set((x) => void (x.curve.spineGap = v))} />}
            <SliderField label="End inset" value={Math.round(C.curve.inset * 100)} min={0} max={40} step={1} unit="%" onChange={(v) => set((x) => void (x.curve.inset = v / 100))} />
          </>
        )}
        <SwitchField label="Hollow" hint="Cut out the middle of each profile, keeping a frame and a post at every slot." checked={C.hollow} onChange={(v) => set((x) => void (x.hollow = v))} />
        <SliderField label={C.hollow ? 'Frame width' : 'Band (open surfaces)'} value={C.frame} min={3} max={120} step={0.5} unit="len" onChange={(v) => set((x) => void (x.frame = v))} />
      </Section>
      <Section title="Slots">
        <SliderField label="Fit clearance" hint="Added to the sheet thickness. About 0.1 mm tight, 0.3 mm loose." value={C.slotClearance} min={-0.2} max={1.5} step={0.01} unit="len" onChange={(v) => set((x) => void (x.slotClearance = v))} />
        <SliderField label="Lead-in" value={C.slotLeadIn} min={0} max={4} step={0.1} unit="len" onChange={(v) => set((x) => void (x.slotLeadIn = v))} />
        <SwitchField label="Label parts and slots" checked={C.labelParts} onChange={(v) => set((x) => void (x.labelParts = v))} />
        <SliderField label="Text height" value={C.textHeight} min={1} max={30} step={0.5} unit="len" onChange={(v) => set((x) => void (x.textHeight = v))} />
      </Section>
    </>
  );
}

