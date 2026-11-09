/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { lazy, Suspense } from 'react';
import { useProject } from '@/state/project';
import { JOINERY_SUPPORT, pinHoleDiameter } from '@/core/joinery/holes';
import { SCREW_PRESETS } from '@/core/presets';
import type { ConnectorKind, JoineryKind, JoineryParams, LatchKind } from '@/core/params';
import { Callout, Section, SegmentedField, SelectField, SliderField, useUnits } from '../components/controls';
import { LatchGlyph } from '../components/glyphs';
import { JointPreview } from '../components/JointPreview';
import { JOIN_LABEL, JOIN_TEXT } from '../labels';
import { fingers, flaticulationFold, wireStitches } from '@/core/joinery/edgeFeatures';
import { lessThanPattern, greaterThanPattern } from '@/core/joinery/flaticulation';
import { WIRE_PRESETS } from '@/core/presets';

const ALL_KINDS: JoineryKind[] = ['screws', 'printed', 'none', 'latches', 'wire', 'fingers', 'flaticulation'];

const ConnectorPreview = lazy(() => import('@/viewport/ConnectorPreview'));

const CONNECTORS: { id: ConnectorKind; label: string; text: string }[] = [
  { id: 'snapPin', label: 'Snap pin', text: 'Push-through pin with a split, barbed tip.' },
  { id: 'hollowScrew', label: 'Hollow screw', text: 'Threaded sleeve and nut with an open centre.' },
  { id: 'spacer', label: 'Spacer', text: 'Tube that holds two layers apart.' },
  { id: 'nodeHub', label: 'Node hub', text: 'Unique hub per node; arms follow the strips at their real angles.' },
  { id: 'angleBracket', label: 'Angle bracket', text: 'Joins two panels at their exact angle. Cross clips for waffles.' },
];
const LATCHES: { id: LatchKind; label: string; text: string }[] = [
  { id: 'tabSlot', label: 'Tab & slot', text: 'A tab folds through a slot on the next panel.' },
  { id: 'arrow', label: 'Arrowhead', text: 'Barbed arrow squeezes through and locks.' },
  { id: 'hook', label: 'Hook', text: 'One-sided barb hooks behind the slot.' },
  { id: 'puzzle', label: 'Dovetail', text: 'In-plane puzzle key; no folding tab.' },
];

export function JoineryPanel() {
  const j = useProject((s) => s.project.joinery);
  const method = useProject((s) => s.project.method);
  const update = useProject((s) => s.update);
  const u = useUnits();
  const set = (fn: (x: JoineryParams) => void) => update((p) => fn(p.joinery));
  const support = JOINERY_SUPPORT[method];
  const allowed = support.kinds.includes(j.kind);
  const t = useProject((s) => s.project.material.thickness);
  return (
    <>
      <div className="panel-intro">
        <p>{support.note}</p>
      </div>
      <div className="join-grid" role="radiogroup" aria-label="Joinery">
        {ALL_KINDS.filter((k) => support.kinds.includes(k)).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={j.kind === k} className="option-card" onClick={() => set((x) => void (x.kind = k))}>
            <span className="option-card__title">{JOIN_LABEL[k]}</span>
            <span className="option-card__text">{JOIN_TEXT[k]}</span>
          </button>
        ))}
      </div>
      {!allowed && (
        <div className="panel-pad">
          <Callout tone="warn">{JOIN_LABEL[j.kind]} does not apply to this method. Pick one of the options above.</Callout>
        </div>
      )}
      {j.kind === 'screws' && (
        <Section title="Screws">
          <SelectField
            label="Screw"
            value={j.screw.preset}
            onChange={(v) => set((x) => void (x.screw.preset = v))}
            options={SCREW_PRESETS.map((s) => ({ value: s.id, label: s.label, hint: s.id === 'custom' ? undefined : `Ø ${s.normal} mm` }))}
          />
          {j.screw.preset === 'custom' ? (
            <SliderField label="Hole diameter" value={j.screw.diameter} min={0.5} max={20} step={0.05} unit="len" onChange={(v) => set((x) => void (x.screw.diameter = v))} />
          ) : (
            <SegmentedField
              label="Fit"
              hint="ISO 273 clearance holes: close, normal (medium) or loose."
              value={j.screw.fit}
              onChange={(v) => set((x) => void (x.screw.fit = v))}
              options={[
                { value: 'close', label: 'Close' },
                { value: 'normal', label: 'Normal' },
                { value: 'loose', label: 'Loose' },
              ]}
            />
          )}
          <p className="muted small">Hole: Ø {u.fmt(pinHoleDiameter(j), 2)}</p>
        </Section>
      )}
      {j.kind === 'none' && ['lattice', 'slices', 'layers', 'meshlines', 'triangles'].includes(method) && (
        <Section title="Holes">
          <SliderField label="Hole diameter" hint="0 removes the holes." value={j.noneHoleDiameter} min={0} max={20} step={0.05} unit="len" onChange={(v) => set((x) => void (x.noneHoleDiameter = v))} />
        </Section>
      )}
      {j.kind === 'printed' && (
        <>
          <Section title="Connector">
            <div className="card-list" role="radiogroup" aria-label="Connector">
              {CONNECTORS.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={j.printed.connector === c.id} className="option-card" onClick={() => set((x) => void (x.printed.connector = c.id))}>
                  <span className="option-card__title">{c.label}</span>
                  <span className="option-card__text">{c.text}</span>
                </button>
              ))}
            </div>
            <Suspense fallback={<div className="connector-preview connector-preview--loading">Loading preview…</div>}>
              <ConnectorPreview />
            </Suspense>
          </Section>
          <Section title="Dimensions">
            <SliderField label={j.printed.connector === 'hollowScrew' ? 'Thread diameter' : 'Pin diameter'} value={j.printed.pinDiameter} min={1} max={20} step={0.1} unit="len" onChange={(v) => set((x) => void (x.printed.pinDiameter = v))} />
            <SliderField label="Head diameter" value={j.printed.headDiameter} min={2} max={40} step={0.1} unit="len" onChange={(v) => set((x) => void (x.printed.headDiameter = v))} />
            <SliderField label="Print clearance" hint="Gap between printed parts and the sheet, per side." value={j.printed.clearance} min={0} max={1} step={0.01} unit="len" onChange={(v) => set((x) => void (x.printed.clearance = v))} />
            <SliderField label="Wall" value={j.printed.wall} min={0.4} max={6} step={0.1} unit="len" onChange={(v) => set((x) => void (x.printed.wall = v))} />
            {j.printed.connector === 'hollowScrew' && (
              <>
                <SliderField label="Thread pitch" value={j.printed.threadPitch} min={0.5} max={4} step={0.05} unit="len" onChange={(v) => set((x) => void (x.printed.threadPitch = v))} />
                <SliderField label="Open bore" hint="Diameter of the open centre." value={j.printed.bore} min={0} max={18} step={0.1} unit="len" onChange={(v) => set((x) => void (x.printed.bore = v))} />
              </>
            )}
            {j.printed.connector === 'spacer' && <SliderField label="Gap" value={j.printed.spacerGap} min={0.5} max={60} step={0.5} unit="len" onChange={(v) => set((x) => void (x.printed.spacerGap = v))} />}
            {(j.printed.connector === 'nodeHub' || j.printed.connector === 'angleBracket') && (
              <SliderField label="Arm length" value={j.printed.armLength} min={4} max={80} step={0.5} unit="len" onChange={(v) => set((x) => void (x.printed.armLength = v))} />
            )}
            <p className="muted small">Sheet holes: Ø {u.fmt(pinHoleDiameter(j), 2)}</p>
          </Section>
        </>
      )}
      {j.kind === 'latches' && (
        <>
          <Section title="Latch">
            <div className="latch-grid" role="radiogroup" aria-label="Latch type">
              {LATCHES.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={j.latch.kind === l.id} className="latch-card" onClick={() => set((x) => void (x.latch.kind = l.id))}>
                  <LatchGlyph kind={l.id} width={j.latch.width} depth={j.latch.depth} angle={j.latch.angle} clearance={j.latch.clearance} />
                  <span className="option-card__title">{l.label}</span>
                  <span className="option-card__text">{l.text}</span>
                </button>
              ))}
            </div>
          </Section>
          <Section title="Dimensions">
            <SliderField label="Width" value={j.latch.width} min={2} max={60} step={0.5} unit="len" onChange={(v) => set((x) => void (x.latch.width = v))} />
            <SliderField label="Depth" value={j.latch.depth} min={1} max={60} step={0.5} unit="len" onChange={(v) => set((x) => void (x.latch.depth = v))} />
            <SliderField label="Clearance" value={j.latch.clearance} min={0} max={2} step={0.01} unit="len" onChange={(v) => set((x) => void (x.latch.clearance = v))} />
            <SliderField label="Flare angle" value={j.latch.angle} min={5} max={60} step={1} unit="°" onChange={(v) => set((x) => void (x.latch.angle = v))} />
            <SliderField label="Per edge" hint="0 picks a count from the edge length." value={j.latch.perEdge} min={0} max={6} step={1} onChange={(v) => set((x) => void (x.latch.perEdge = v))} />
          </Section>
        </>
      )}
      {j.kind === 'wire' && (
        <>
          <Section title="Lacing">
            <SelectField
              label="Lace with"
              hint="Sets sensible holes and spacing; adjust them below."
              value={j.wire.preset}
              onChange={(v) =>
                set((x) => {
                  const pr = WIRE_PRESETS[v];
                  x.wire = { ...x.wire, preset: v, holeDiameter: pr.holeDiameter, slotLength: pr.slotLength, pitch: pr.pitch, edgeOffset: pr.edgeOffset, stitch: pr.stitch as JoineryParams['wire']['stitch'] };
                })
              }
              options={(Object.keys(WIRE_PRESETS) as (keyof typeof WIRE_PRESETS)[]).map((k) => ({ value: k, label: WIRE_PRESETS[k].label }))}
            />
            <SegmentedField
              label="Stitch"
              hint="Cross stitches offset the holes on the two sides; notches suit rubber bands."
              value={j.wire.stitch}
              onChange={(v) => set((x) => void (x.wire.stitch = v))}
              options={[
                { value: 'running', label: 'Running' },
                { value: 'cross', label: 'Cross' },
                { value: 'whip', label: 'Whip' },
                { value: 'notch', label: 'Notch' },
              ]}
            />
            <JointPreview label="Lacing preview: both sides of a seam" length={Math.min(200, Math.max(30, j.wire.pitch * 5))} thickness={t} draw={(c, f) => wireStitches(c, f, j.wire)} />
          </Section>
          <Section title="Dimensions">
            <SliderField label="Hole diameter" value={j.wire.holeDiameter} min={0.4} max={12} step={0.05} unit="len" onChange={(v) => set((x) => void (x.wire.holeDiameter = v))} />
            <SliderField label="Slot length" hint="0 for round holes. Longer slots take flat ribbon, fabric or zip ties." value={j.wire.slotLength} min={0} max={30} step={0.1} unit="len" onChange={(v) => set((x) => void (x.wire.slotLength = v))} />
            <SliderField label="Pitch" value={j.wire.pitch} min={2} max={80} step={0.5} unit="len" onChange={(v) => set((x) => void (x.wire.pitch = v))} />
            <SliderField label="Edge distance" value={j.wire.edgeOffset} min={1} max={30} step={0.1} unit="len" onChange={(v) => set((x) => void (x.wire.edgeOffset = v))} />
          </Section>
        </>
      )}
      {j.kind === 'fingers' && (
        <>
          <Section title="Finger joints">
            <SegmentedField
              label="Pattern"
              hint="Unique gives every seam its own code so only the right parts fit (FoolProofJoint, CHI ’22). Symmetric also fits turned end for end."
              value={j.fingers.pattern}
              onChange={(v) => set((x) => void (x.fingers.pattern = v))}
              options={[
                { value: 'classic', label: 'Classic' },
                { value: 'unique', label: 'Unique' },
                { value: 'symmetric', label: 'Symmetric' },
              ]}
            />
            <JointPreview label="Finger joint preview: both sides of a seam" length={Math.min(160, Math.max(30, j.fingers.width * 9))} thickness={t} draw={(c, f) => fingers(c, f, j.fingers)} />
          </Section>
          <Section title="Dimensions">
            <SliderField label="Finger width" value={j.fingers.width} min={2} max={60} step={0.5} unit="len" onChange={(v) => set((x) => void (x.fingers.width = v))} />
            <SegmentedField
              label="Depth"
              hint="Auto uses the sheet thickness, deepened for the real angle between the parts."
              value={j.fingers.depthMode}
              onChange={(v) => set((x) => void (x.fingers.depthMode = v))}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            {j.fingers.depthMode === 'custom' && <SliderField label="Depth" value={j.fingers.depth} min={0.5} max={40} step={0.1} unit="len" onChange={(v) => set((x) => void (x.fingers.depth = v))} />}
            <SliderField label="Clearance" hint="Per side. Account for kerf: 0.05–0.15 mm on a laser." value={j.fingers.clearance} min={0} max={1} step={0.01} unit="len" onChange={(v) => set((x) => void (x.fingers.clearance = v))} />
          </Section>
        </>
      )}
      {j.kind === 'flaticulation' && <FlaticulationControls />}
    </>
  );
}

function FlaticulationControls() {
  const F = useProject((s) => s.project.joinery.flaticulation);
  const t = useProject((s) => s.project.material.thickness);
  const update = useProject((s) => s.update);
  const u = useUnits();
  const set = (fn: (x: JoineryParams['flaticulation']) => void) => update((p) => fn(p.joinery.flaticulation));
  const input = { T: t, theta: Math.PI / 2, K: F.kerfOffset, alpha: (F.kerfAngle * Math.PI) / 180, mountain: true, stiffness: F.stiffness };
  const less = lessThanPattern(input), more = greaterThanPattern(input);
  return (
    <>
      <Section title="Flaticulation">
        <p className="muted small">Folds are cut right through, and small T-shaped patterns along each fold clutch the two sides at their exact angle once folded (Zheng et al., UIST ’22). Seams between separate parts use latches.</p>
        <SegmentedField
          label="Joint"
          hint="Articulated holds the angle firmly; detent snaps between flat and folded."
          value={F.joint}
          onChange={(v) => set((x) => void (x.joint = v))}
          options={[
            { value: 'articulated', label: 'Articulated' },
            { value: 'detent', label: 'Detent' },
          ]}
        />
        <JointPreview fold label="Flaticulation preview at 90°" length={Math.min(120, Math.max(24, ((F.headWidth + 2.5 * t) * 2.2) / Math.max(0.2, F.occupancy)))} thickness={t} draw={(c, f) => void flaticulationFold(c, f, F)} />
        <p className="muted small">
          At 90°: &lt;θ pattern L {u.fmt(less.L, 2)}, X {u.fmt(less.X, 2)} · &gt;θ pattern L {u.fmt(more.L, 2)}, X {u.fmt(more.X, 2)}
        </p>
      </Section>
      <Section title="Pattern">
        <SliderField label="Neck width" value={F.neckWidth} min={0.6} max={10} step={0.1} unit="len" onChange={(v) => set((x) => void (x.neckWidth = v))} />
        <SliderField label="Head width" value={F.headWidth} min={2} max={30} step={0.1} unit="len" onChange={(v) => set((x) => void (x.headWidth = v))} />
        <SliderField label="Edge filled" hint="Share of each fold covered by patterns." value={Math.round(F.occupancy * 100)} min={10} max={95} step={1} unit="%" onChange={(v) => set((x) => void (x.occupancy = v / 100))} />
        <SliderField label="Stiffness" hint="Scales the extra interference that holds the angle." value={Math.round(F.stiffness * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => set((x) => void (x.stiffness = v / 100))} />
        <SliderField label="Breakaway bridges" hint="Tiny uncut bridges keep folds in the sheet while cutting. 0 = none." value={F.breakTab} min={0} max={2} step={0.05} unit="len" onChange={(v) => set((x) => void (x.breakTab = v))} />
      </Section>
      <Section title="Kerf calibration" defaultOpen={false}>
        <p className="muted small">From the paper’s Table A.1 for 3 mm MDF. Cut a test strip and adjust if joints are loose or crack.</p>
        <SliderField label="Kerf offset K" value={F.kerfOffset} min={0} max={0.5} step={0.005} unit="len" onChange={(v) => set((x) => void (x.kerfOffset = v))} />
        <SliderField label="Kerf angle α" value={F.kerfAngle} min={0} max={6} step={0.05} unit="°" onChange={(v) => set((x) => void (x.kerfAngle = v))} />
      </Section>
    </>
  );
}
