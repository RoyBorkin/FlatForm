/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { useProject } from '@/state/project';
import { useResults } from '@/state/results';
import type { MeshLinesParams, TrianglesParams } from '@/core/params';
import { Section, SegmentedField, SliderField, SwitchField } from '../../components/controls';

export function MeshLinesControls() {
  const M = useProject((s) => s.project.meshlines);
  const update = useProject((s) => s.update);
  const stats = useResults((s) => s.method?.stats);
  const set = (fn: (x: MeshLinesParams) => void) => update((p) => fn(p.meshlines));
  return (
    <>
      <Section title="Bars">
        <SliderField label="Faces" hint="0 keeps the surface mesh from the Surface step." value={M.targetFaces} min={0} max={3000} step={10} onChange={(v) => set((x) => void (x.targetFaces = v))} />
        <SegmentedField
          label="Bars stand"
          hint="Radial bars stand on edge like a matchstick frame; flat bars lie in the surface."
          value={M.orientation}
          onChange={(v) => set((x) => void (x.orientation = v))}
          options={[
            { value: 'radial', label: 'On edge' },
            { value: 'flat', label: 'Flat' },
          ]}
        />
        <SliderField label="Bar width" value={M.barWidth} min={2} max={60} step={0.5} unit="len" onChange={(v) => set((x) => void (x.barWidth = v))} />
        <SegmentedField
          label="Ends"
          value={M.endStyle}
          onChange={(v) => set((x) => void (x.endStyle = v))}
          options={[
            { value: 'round', label: 'Round' },
            { value: 'square', label: 'Square' },
          ]}
        />
        <SliderField label="Node clearance" hint="Cut back from each node, room for a hub or a lashing." value={M.nodeClearance} min={0} max={40} step={0.5} unit="len" onChange={(v) => set((x) => void (x.nodeClearance = v))} />
        <SliderField label="Length step" hint="Bars are rounded to this, so equal bars can be batch-cut." value={M.lengthStep} min={0.1} max={20} step={0.1} unit="len" onChange={(v) => set((x) => void (x.lengthStep = v))} />
        {stats && <p className="muted small">{stats.lengths} bar lengths · {stats.nodes} nodes</p>}
      </Section>
      <Section title="Labels">
        <SwitchField label="Label bars" hint="Length class and bar number." checked={M.labelBars} onChange={(v) => set((x) => void (x.labelBars = v))} />
        <SliderField label="Text height" value={M.textHeight} min={0.8} max={12} step={0.1} unit="len" onChange={(v) => set((x) => void (x.textHeight = v))} />
      </Section>
    </>
  );
}

export function TrianglesControls() {
  const T = useProject((s) => s.project.triangles);
  const update = useProject((s) => s.update);
  const stats = useResults((s) => s.method?.stats);
  const set = (fn: (x: TrianglesParams) => void) => update((p) => fn(p.triangles));
  return (
    <>
      <Section title="Triangles">
        <SliderField label="Faces" value={T.targetFaces} min={20} max={2000} step={10} onChange={(v) => set((x) => void (x.targetFaces = v))} />
        <SliderField label="Edge lengths" hint="How many distinct edge lengths. Fewer = more identical triangles, rougher fit." value={T.lengthClasses} min={1} max={8} step={1} onChange={(v) => set((x) => void (x.lengthClasses = v))} />
        <SliderField label="Relax iterations" value={T.iterations} min={0} max={2000} step={10} onChange={(v) => set((x) => void (x.iterations = v))} />
        {stats && (
          <p className="muted small">
            {stats.types} triangle types · edges {stats.meanError}% off on average, {stats.worstError}% at worst
          </p>
        )}
      </Section>
      <Section title="Panels">
        <SegmentedField
          label="Style"
          value={T.style}
          onChange={(v) => set((x) => void (x.style = v))}
          options={[
            { value: 'panel', label: 'Solid panel' },
            { value: 'frame', label: 'Open frame' },
          ]}
        />
        {T.style === 'frame' && <SliderField label="Frame width" value={T.frameWidth} min={2} max={60} step={0.5} unit="len" onChange={(v) => set((x) => void (x.frameWidth = v))} />}
        <SliderField label="Gap" hint="Between neighbouring panels." value={T.gap} min={0} max={10} step={0.1} unit="len" onChange={(v) => set((x) => void (x.gap = v))} />
        <SliderField label="Corner trim" value={T.cornerTrim} min={0} max={20} step={0.5} unit="len" onChange={(v) => set((x) => void (x.cornerTrim = v))} />
        <SwitchField label="Label types and seams" checked={T.labelParts} onChange={(v) => set((x) => void (x.labelParts = v))} />
        <SliderField label="Text height" value={T.textHeight} min={0.8} max={16} step={0.1} unit="len" onChange={(v) => set((x) => void (x.textHeight = v))} />
      </Section>
    </>
  );
}
