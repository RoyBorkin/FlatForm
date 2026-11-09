/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { Shuffle } from 'lucide-react';
import { useProject } from '@/state/project';
import { useResults } from '@/state/results';
import { useLayerColors } from '@/state/ui';
import type { LatticeLayer, LatticeParams, MethodKind, SlicesParams, WaffleParams, FoldedParams } from '@/core/params';
import { GROUP_LETTERS } from '@/core/parts';
import { Callout, IconButton, NumberField, Section, SegmentedField, SelectField, SliderField, SwitchField } from '../components/controls';
import { MethodGlyph } from '../components/glyphs';
import { METHODS } from '../labels';
import { JOINERY_SUPPORT } from '@/core/joinery/holes';
import { FlexHingeControls, MinimalControls, PapercraftControls } from './method/UnfoldControls';
import { ClassicControls, LayersControls } from './method/SectionControls';
import { MeshLinesControls, TrianglesControls } from './method/FrameControls';

const FAMILIES = ['Surface', 'Frames', 'Sections', 'Folded'] as const;

export function MethodPanel() {
  const method = useProject((s) => s.project.method);
  const update = useProject((s) => s.update);
  const result = useResults((s) => s.method);
  return (
    <>
      <div className="method-groups" role="radiogroup" aria-label="Construction method">
        {FAMILIES.map((fam) => (
          <div className="method-group" key={fam}>
            <h3 className="method-group__title">{fam}</h3>
            <div className="method-grid">
              {METHODS.filter((m) => m.family === fam).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={method === m.id}
                  aria-describedby={method === m.id ? 'method-desc' : undefined}
                  title={m.text}
                  className="method-card"
                  onClick={() =>
                    update((p) => {
                      p.method = m.id as MethodKind;
                      // Keep the joinery valid for the new method.
                      const ok = JOINERY_SUPPORT[p.method].kinds;
                      if (!ok.includes(p.joinery.kind)) p.joinery.kind = ok[0];
                    })
                  }
                >
                  <MethodGlyph kind={m.id} />
                  <span className="method-card__title">{m.title}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="method-desc" id="method-desc">
          <strong>{METHODS.find((m) => m.id === method)?.title}.</strong> {METHODS.find((m) => m.id === method)?.text}
        </p>
      </div>
      {result?.warnings.map((w) => (
        <div className="panel-pad" key={w}>
          <Callout tone="warn">{w}</Callout>
        </div>
      ))}
      {method === 'lattice' && <LatticeControls />}
      {method === 'slices' && <SlicesControls />}
      {method === 'waffle' && <WaffleControls />}
      {method === 'folded' && <FoldedControls />}
      {method === 'papercraft' && <PapercraftControls />}
      {method === 'minimal' && <MinimalControls />}
      {method === 'flexhinge' && <FlexHingeControls />}
      {method === 'layers' && <LayersControls />}
      {method === 'classic' && <ClassicControls />}
      {method === 'meshlines' && <MeshLinesControls />}
      {method === 'triangles' && <TrianglesControls />}
    </>
  );
}

// ------------------------------------------------------------------ lattice

function LatticeControls() {
  const L = useProject((s) => s.project.lattice);
  const update = useProject((s) => s.update);
  const colors = useLayerColors();
  const set = (fn: (x: LatticeParams) => void) => update((p) => fn(p.lattice));
  return (
    <>
      <Section title="Pattern">
        <SelectField
          label="Cell pattern"
          hint="Which lines on the mesh the strips may follow."
          value={L.pattern}
          onChange={(v) => set((x) => void (x.pattern = v))}
          options={[
            { value: 'hex', label: 'Hexagonal', hint: 'Triangle centres, crossing each edge (reference)' },
            { value: 'tri', label: 'Triangular', hint: 'Along the mesh edges' },
            { value: 'quad', label: 'Square-ish', hint: 'Paired triangles' },
            { value: 'kis', label: 'Star', hint: 'Centre to corners' },
          ]}
        />
        <SliderField label="Strip width" value={L.stripWidth} min={2} max={60} step={0.5} unit="len" onChange={(v) => set((x) => void (x.stripWidth = v))} />
        <SegmentedField
          label="Corners"
          value={L.joinStyle}
          onChange={(v) => set((x) => void (x.joinStyle = v))}
          options={[
            { value: 'round', label: 'Round' },
            { value: 'miter', label: 'Mitred' },
          ]}
        />
        <SegmentedField
          label="Strip ends"
          value={L.endStyle}
          onChange={(v) => set((x) => void (x.endStyle = v))}
          options={[
            { value: 'round', label: 'Round' },
            { value: 'square', label: 'Square' },
          ]}
        />
      </Section>
      <Section title="Layers">
        <p className="muted small">Each layer grows its own maze. Different clusters in each layer bridge each other's seams, which is what makes the shell stiff.</p>
        {L.layers.map((layer, i) => (
          <LayerRow key={i} index={i} layer={layer} color={colors[i % colors.length]} onChange={(fn) => set((x) => fn(x.layers[i]))} />
        ))}
        <SegmentedField
          label="Stack"
          hint="Which way the layers build up from the surface."
          value={L.stackDirection}
          onChange={(v) => set((x) => void (x.stackDirection = v))}
          options={[
            { value: 'outward', label: 'Outward' },
            { value: 'inward', label: 'Inward' },
          ]}
        />
      </Section>
      <Section title="Pins & labels">
        <SegmentedField
          label="Pins at"
          hint="Every node pins through all layers. Junctions only uses fewer connectors."
          value={L.pins}
          onChange={(v) => set((x) => void (x.pins = v))}
          options={[
            { value: 'all', label: 'Every node' },
            { value: 'junctions', label: 'Junctions' },
            { value: 'alternate', label: 'Alternate' },
          ]}
        />
        <SwitchField label="Number every hole" checked={L.numberHoles} onChange={(v) => set((x) => void (x.numberHoles = v))} />
        <SwitchField label="Engrave part names" checked={L.labelParts} onChange={(v) => set((x) => void (x.labelParts = v))} />
        <SliderField label="Text height" value={L.textHeight} min={0.8} max={12} step={0.1} unit="len" onChange={(v) => set((x) => void (x.textHeight = v))} />
        <SwitchField label="Split overlapping parts" hint="Parts that would overlap themselves once flat, or not fit the sheet, are split in two." checked={L.autoSplit} onChange={(v) => set((x) => void (x.autoSplit = v))} />
      </Section>
    </>
  );
}

function LayerRow({ index, layer, color, onChange }: { index: number; layer: LatticeLayer; color: string; onChange: (fn: (l: LatticeLayer) => void) => void }) {
  return (
    <div className="layer" data-enabled={layer.enabled}>
      <div className="layer__head">
        <span className="layer__swatch" style={{ background: color }} aria-hidden />
        <span className="layer__name">Layer {GROUP_LETTERS[index]}</span>
        <SwitchInline label={`Layer ${GROUP_LETTERS[index]} enabled`} checked={layer.enabled} onChange={(v) => onChange((l) => void (l.enabled = v))} />
      </div>
      {layer.enabled && (
        <div className="layer__body">
          <SliderField label="Clusters (parts)" value={layer.clusters} min={1} max={600} step={1} onChange={(v) => onChange((l) => void (l.clusters = v))} />
          <SelectField
            label="Maze"
            value={layer.algorithm}
            onChange={(v) => onChange((l) => void (l.algorithm = v))}
            options={[
              { value: 'kruskal', label: 'Kruskal', hint: 'Even, many short branches (reference)' },
              { value: 'prim', label: 'Prim', hint: 'Grows outward, bushy' },
              { value: 'backtracker', label: 'Backtracker', hint: 'Long winding corridors' },
              { value: 'wilson', label: 'Wilson', hint: 'Uniform random' },
              { value: 'radial', label: 'Radial', hint: 'Coral-like, from each cluster centre' },
            ]}
          />
          <SliderField label="Grain bias" hint="Prefer strips running along an axis." value={layer.bias} min={0} max={1} step={0.05} onChange={(v) => onChange((l) => void (l.bias = v))} />
          {layer.bias > 0 && (
            <SegmentedField
              label="Grain axis"
              value={layer.biasAxis}
              onChange={(v) => onChange((l) => void (l.biasAxis = v))}
              options={[
                { value: 'x', label: 'X' },
                { value: 'y', label: 'Y' },
                { value: 'z', label: 'Z' },
              ]}
            />
          )}
          <div className="seed-row">
            <NumberField label="Seed" value={layer.seed} min={0} max={99999} step={1} onChange={(v) => onChange((l) => void (l.seed = Math.round(v)))} />
            <IconButton label="New random seed" onClick={() => onChange((l) => void (l.seed = Math.floor(Math.random() * 99999)))}>
              <Shuffle size={14} aria-hidden />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}

function SwitchInline({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch switch--sm" data-state={checked ? 'checked' : 'unchecked'} onClick={() => onChange(!checked)}>
      <span className="switch__thumb" data-state={checked ? 'checked' : 'unchecked'} />
    </button>
  );
}

// ------------------------------------------------------------------ slices

function SlicesControls() {
  const S = useProject((s) => s.project.slices);
  const t = useProject((s) => s.project.material.thickness);
  const update = useProject((s) => s.update);
  const set = (fn: (x: SlicesParams) => void) => update((p) => fn(p.slices));
  return (
    <>
      <Section title="Slicing">
        <SegmentedField
          label="Stack along"
          value={S.axis}
          onChange={(v) => set((x) => void (x.axis = v))}
          options={[
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
          ]}
        />
        <SegmentedField
          label="Spacing"
          hint="Solid stacks every sheet touching the next. Spaced leaves gaps between slices, held by the dowels."
          value={S.spacingMode}
          onChange={(v) => set((x) => void (x.spacingMode = v))}
          options={[
            { value: 'thickness', label: 'Solid' },
            { value: 'custom', label: 'Spaced' },
          ]}
        />
        {S.spacingMode === 'custom' && <SliderField label="Pitch" value={S.spacing} min={t} max={200} step={0.5} unit="len" onChange={(v) => set((x) => void (x.spacing = v))} />}
        <SwitchField label="Hollow" hint="Keep only a ring of material. Saves sheet and weight." checked={S.hollow} onChange={(v) => set((x) => void (x.hollow = v))} />
        <SliderField label={S.hollow ? 'Wall' : 'Band (open surfaces)'} value={S.wall} min={2} max={150} step={0.5} unit="len" onChange={(v) => set((x) => void (x.wall = v))} />
      </Section>
      <Section title="Alignment">
        <SliderField label="Dowels" hint="Holes through every slice for rods, screws or printed pins." value={S.alignmentHoles} min={0} max={4} step={1} onChange={(v) => set((x) => void (x.alignmentHoles = v))} />
        <SwitchField label="Engrave the next slice" hint="Etch the outline of the slice above, so stacking is foolproof." checked={S.registration} onChange={(v) => set((x) => void (x.registration = v))} />
        <SwitchField label="Number slices" checked={S.labelParts} onChange={(v) => set((x) => void (x.labelParts = v))} />
        <SliderField label="Text height" value={S.textHeight} min={1} max={30} step={0.5} unit="len" onChange={(v) => set((x) => void (x.textHeight = v))} />
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ waffle

function WaffleControls() {
  const W = useProject((s) => s.project.waffle);
  const update = useProject((s) => s.update);
  const set = (fn: (x: WaffleParams) => void) => update((p) => fn(p.waffle));
  const labels = W.plane === 'xy' ? ['X', 'Y'] : W.plane === 'xz' ? ['X', 'Z'] : ['Y', 'Z'];
  return (
    <>
      <Section title="Ribs">
        <SegmentedField
          label="Rib families"
          hint="Which two directions the ribs face. Slots run along the third axis."
          value={W.plane}
          onChange={(v) => set((x) => void (x.plane = v))}
          options={[
            { value: 'xy', label: 'X + Y' },
            { value: 'xz', label: 'X + Z' },
            { value: 'yz', label: 'Y + Z' },
          ]}
        />
        <SliderField label={`Ribs across ${labels[0]} (A)`} value={W.countA} min={1} max={60} step={1} onChange={(v) => set((x) => void (x.countA = v))} />
        <SliderField label={`Ribs across ${labels[1]} (B)`} value={W.countB} min={1} max={60} step={1} onChange={(v) => set((x) => void (x.countB = v))} />
        <SliderField label="Edge inset" hint="Keeps the outer ribs away from thin edges of the shape." value={Math.round(W.inset * 100)} min={0} max={40} step={1} unit="%" onChange={(v) => set((x) => void (x.inset = v / 100))} />
        <SwitchField label="Hollow ribs" hint="Cut out the middle of each rib, keeping a frame and a post at every slot." checked={W.hollow} onChange={(v) => set((x) => void (x.hollow = v))} />
        <SliderField label={W.hollow ? 'Frame width' : 'Band (open surfaces)'} value={W.frame} min={3} max={120} step={0.5} unit="len" onChange={(v) => set((x) => void (x.frame = v))} />
      </Section>
      <Section title="Slots">
        <SliderField label="Fit clearance" hint="Added to the sheet thickness. Tight fits need about 0.1 mm, loose 0.3 mm." value={W.slotClearance} min={-0.2} max={1.5} step={0.01} unit="len" onChange={(v) => set((x) => void (x.slotClearance = v))} />
        <SliderField label="Lead-in" hint="A small flare at the slot mouth so ribs start easily." value={W.slotLeadIn} min={0} max={4} step={0.1} unit="len" onChange={(v) => set((x) => void (x.slotLeadIn = v))} />
        <SwitchField label="Label ribs and slots" checked={W.labelParts} onChange={(v) => set((x) => void (x.labelParts = v))} />
        <SliderField label="Text height" value={W.textHeight} min={1} max={30} step={0.5} unit="len" onChange={(v) => set((x) => void (x.textHeight = v))} />
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ folded

function FoldedControls() {
  const F = useProject((s) => s.project.folded);
  const join = useProject((s) => s.project.joinery.kind);
  const update = useProject((s) => s.update);
  const set = (fn: (x: FoldedParams) => void) => update((p) => fn(p.folded));
  return (
    <>
      <Section title="Panels">
        <SliderField label="Facets" hint="How many flat triangles approximate the shape." value={F.targetFaces} min={20} max={3000} step={10} onChange={(v) => set((x) => void (x.targetFaces = v))} />
        <SelectField
          label="Unfold by"
          value={F.strategy}
          onChange={(v) => set((x) => void (x.strategy = v))}
          options={[
            { value: 'flattest', label: 'Flattest folds first', hint: 'Cuts land on sharp creases' },
            { value: 'longest', label: 'Longest edges first', hint: 'Fewer, longer cut edges' },
            { value: 'bfs', label: 'Breadth first', hint: 'Compact, round islands' },
          ]}
        />
        <SliderField label="Max facets per part" value={F.maxIslandFaces} min={1} max={500} step={1} onChange={(v) => set((x) => void (x.maxIslandFaces = v))} />
        <SwitchField label="Split on overlap" checked={F.autoSplit} onChange={(v) => set((x) => void (x.autoSplit = v))} />
      </Section>
      <Section title="Folds & edges">
        <SegmentedField
          label="Fold lines"
          hint="Score marks the surface; perforate cuts dashes through, for thick card and plastic."
          value={F.foldLine}
          onChange={(v) => set((x) => void (x.foldLine = v))}
          options={[
            { value: 'score', label: 'Score' },
            { value: 'perforate', label: 'Perforate' },
          ]}
        />
        {F.foldLine === 'perforate' && (
          <>
            <SliderField label="Dash" value={F.perforation.dash} min={0.5} max={20} step={0.5} unit="len" onChange={(v) => set((x) => void (x.perforation.dash = v))} />
            <SliderField label="Gap" value={F.perforation.gap} min={0.3} max={20} step={0.1} unit="len" onChange={(v) => set((x) => void (x.perforation.gap = v))} />
          </>
        )}
        {join === 'flaticulation' && <p className="muted small">Folds are cut as Flaticulation joints (Joinery step). Seams between parts use latches.</p>}
        {join === 'none' && (
          <>
            <SegmentedField
              label="Glue tabs"
              value={F.tabs}
              onChange={(v) => set((x) => void (x.tabs = v))}
              options={[
                { value: 'glue', label: 'On' },
                { value: 'none', label: 'Off' },
              ]}
            />
            {F.tabs === 'glue' && <SliderField label="Tab width" value={F.tabWidth} min={2} max={40} step={0.5} unit="len" onChange={(v) => set((x) => void (x.tabWidth = v))} />}
          </>
        )}
        <SwitchField label="Number matching edges" checked={F.numberEdges} onChange={(v) => set((x) => void (x.numberEdges = v))} />
        <SliderField label="Text height" value={F.textHeight} min={0.8} max={20} step={0.1} unit="len" onChange={(v) => set((x) => void (x.textHeight = v))} />
      </Section>
    </>
  );
}
