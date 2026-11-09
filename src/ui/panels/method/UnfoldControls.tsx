/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { Shuffle } from 'lucide-react';
import { useProject } from '@/state/project';
import type { FlexHingeParams, MinimalParams, PapercraftParams } from '@/core/params';
import { Callout, IconButton, NumberField, Section, SegmentedField, SelectField, SliderField, SwitchField } from '../../components/controls';

export function PapercraftControls() {
  const P = useProject((s) => s.project.papercraft);
  const join = useProject((s) => s.project.joinery.kind);
  const update = useProject((s) => s.update);
  const set = (fn: (x: PapercraftParams) => void) => update((p) => fn(p.papercraft));
  return (
    <>
      <Section title="Pieces">
        <SliderField label="Faces" hint="Fewer faces = a lower-poly look and less gluing." value={P.targetFaces} min={20} max={3000} step={10} onChange={(v) => set((x) => void (x.targetFaces = v))} />
        <SelectField
          label="Unfold by"
          value={P.strategy}
          onChange={(v) => set((x) => void (x.strategy = v))}
          options={[
            { value: 'flattest', label: 'Flattest folds first', hint: 'Cuts land on the sharpest creases' },
            { value: 'longest', label: 'Longest edges first', hint: 'Fewer, longer glue edges' },
            { value: 'bfs', label: 'Breadth first', hint: 'Compact, round pieces' },
          ]}
        />
        <SliderField label="Max faces per piece" value={P.maxPieceFaces} min={1} max={600} step={1} onChange={(v) => set((x) => void (x.maxPieceFaces = v))} />
        <SwitchField label="Split on overlap" hint="A piece that would overlap itself once flat is split in two." checked={P.autoSplit} onChange={(v) => set((x) => void (x.autoSplit = v))} />
      </Section>
      <Section title="Flaps">
        {join === 'latches' || join === 'wire' ? (
          <Callout>Flaps are replaced by {join === 'latches' ? 'latches' : 'lacing holes'} from the Joinery step.</Callout>
        ) : (
          <>
            <SelectField
              label="Glue flaps on"
              value={P.flaps}
              onChange={(v) => set((x) => void (x.flaps = v))}
              options={[
                { value: 'alternate', label: 'Alternate sides', hint: 'Like Pepakura: one flap per edge, balanced' },
                { value: 'oneSide', label: 'One side', hint: 'Always on the lower-numbered piece' },
                { value: 'both', label: 'Both sides', hint: 'Half-width flaps on both, for strength' },
                { value: 'none', label: 'None', hint: 'Edge to edge, taped from behind' },
              ]}
            />
            {P.flaps !== 'none' && (
              <>
                <SegmentedField
                  label="Flap shape"
                  value={P.flapShape}
                  onChange={(v) => set((x) => void (x.flapShape = v))}
                  options={[
                    { value: 'trapezoid', label: 'Trapezoid' },
                    { value: 'rounded', label: 'Rounded' },
                    { value: 'triangle', label: 'Triangle' },
                  ]}
                />
                <SliderField label="Flap width" value={P.flapWidth} min={2} max={30} step={0.5} unit="len" onChange={(v) => set((x) => void (x.flapWidth = v))} />
                {P.flapShape === 'trapezoid' && <SliderField label="Shoulder angle" value={P.flapAngle} min={15} max={80} step={1} unit="°" onChange={(v) => set((x) => void (x.flapAngle = v))} />}
              </>
            )}
          </>
        )}
      </Section>
      <Section title="Folds & labels">
        <SegmentedField
          label="Fold lines"
          hint="Mountain folds as dash-dot, valley folds as dashes (scored on a cutter, printed on paper)."
          value={P.foldStyle}
          onChange={(v) => set((x) => void (x.foldStyle = v))}
          options={[
            { value: 'lines', label: 'Show' },
            { value: 'none', label: 'Hide' },
          ]}
        />
        {P.foldStyle === 'lines' && <SliderField label="Skip folds flatter than" value={P.flatThreshold} min={0} max={30} step={0.5} unit="°" onChange={(v) => set((x) => void (x.flatThreshold = v))} />}
        <SwitchField label="Number matching edges" checked={P.edgeNumbers} onChange={(v) => set((x) => void (x.edgeNumbers = v))} />
        <SwitchField label="Name pieces" checked={P.pieceLabels} onChange={(v) => set((x) => void (x.pieceLabels = v))} />
        <SliderField label="Text height" value={P.textHeight} min={0.8} max={12} step={0.1} unit="len" onChange={(v) => set((x) => void (x.textHeight = v))} />
      </Section>
    </>
  );
}

function PieceControls<T extends MinimalParams>({ P, set, note }: { P: T; set: (fn: (x: T) => void) => void; note: string }) {
  return (
    <Section title="Pieces">
      <p className="muted small">{note}</p>
      <SliderField label="Pieces" hint="How many large pieces to aim for. Tubes and rings are split until each piece lies flat." value={P.pieces} min={1} max={40} step={1} onChange={(v) => set((x) => void (x.pieces = v))} />
      <SliderField label="Resolution" hint="Faces used to follow the shape." value={P.targetFaces} min={100} max={4000} step={20} onChange={(v) => set((x) => void (x.targetFaces = v))} />
      <div className="seed-row">
        <NumberField label="Seed" value={P.seed} min={0} max={99999} step={1} onChange={(v) => set((x) => void (x.seed = Math.round(v)))} />
        <IconButton label="New random seed" onClick={() => set((x) => void (x.seed = Math.floor(Math.random() * 99999)))}>
          <Shuffle size={14} aria-hidden />
        </IconButton>
      </div>
      <SwitchField label="Split on overlap" checked={P.autoSplit} onChange={(v) => set((x) => void (x.autoSplit = v))} />
      <SwitchField label="Number seams" checked={P.numberSeams} onChange={(v) => set((x) => void (x.numberSeams = v))} />
      <SwitchField label="Alignment ticks" hint="Small marks across each seam to line pieces up while lacing." checked={P.seamMarks} onChange={(v) => set((x) => void (x.seamMarks = v))} />
      <SliderField label="Text height" value={P.textHeight} min={0.8} max={16} step={0.1} unit="len" onChange={(v) => set((x) => void (x.textHeight = v))} />
    </Section>
  );
}

export function MinimalControls() {
  const P = useProject((s) => s.project.minimal);
  const update = useProject((s) => s.update);
  return <PieceControls P={P} set={(fn) => update((p) => fn(p.minimal))} note="For flexible sheet only: felt, fabric, leather, paper, thin plastic. Pieces may stretch a little to lie flat in one piece." />;
}

export function FlexHingeControls() {
  const P = useProject((s) => s.project.flexhinge);
  const update = useProject((s) => s.update);
  const set = (fn: (x: FlexHingeParams) => void) => update((p) => fn(p.flexhinge));
  return (
    <>
      <PieceControls P={P} set={set} note="For rigid sheet: plywood, MDF, acrylic. Every fold that bends gets a band of slits so the board can follow the curve." />
      <Section title="Living hinge">
        <SegmentedField
          label="Pattern"
          value={P.pattern}
          onChange={(v) => set((x) => void (x.pattern = v))}
          options={[
            { value: 'straight', label: 'Straight' },
            { value: 'wave', label: 'Wave' },
            { value: 'zigzag', label: 'Zig-zag' },
          ]}
        />
        <SliderField label="Slit length" value={P.cutLength} min={3} max={80} step={0.5} unit="len" onChange={(v) => set((x) => void (x.cutLength = v))} />
        <SliderField label="Bridge" hint="Uncut material between slits. Smaller bends easier and breaks sooner." value={P.bridge} min={0.5} max={20} step={0.1} unit="len" onChange={(v) => set((x) => void (x.bridge = v))} />
        <SliderField label="Row spacing" hint="About the sheet thickness or a little less." value={P.spacing} min={0.4} max={10} step={0.05} unit="len" onChange={(v) => set((x) => void (x.spacing = v))} />
        <SliderField label="Hinge folds above" value={P.minAngle} min={0} max={60} step={0.5} unit="°" onChange={(v) => set((x) => void (x.minAngle = v))} />
        <SliderField label="Bend radius" hint="Band width grows with the fold angle times this radius." value={P.bendRadius} min={2} max={120} step={0.5} unit="len" onChange={(v) => set((x) => void (x.bendRadius = v))} />
      </Section>
    </>
  );
}
