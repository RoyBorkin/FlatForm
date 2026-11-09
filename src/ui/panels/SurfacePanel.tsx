/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { Lock, LockOpen, Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useProject } from '@/state/project';
import { useResults } from '@/state/results';
import { bbox, transformMesh } from '@/core/mesh/mesh';
import type { CutPlane, SurfaceParams } from '@/core/params';
import { Button, Callout, Field, IconButton, NumberInput, Section, SegmentedField, Select, SliderField, SwitchField } from '../components/controls';

export function SurfacePanel() {
  const s = useProject((x) => x.project.surface);
  const update = useProject((x) => x.update);
  const base = useResults((x) => x.base);
  const warnings = useResults((x) => x.warnings);
  const set = (fn: (x: SurfaceParams) => void) => update((p) => fn(p.surface));
  // Dimensions of the rotated, unscaled base → lets W/D/H edits set the scale.
  const native = useMemo(() => (base ? bbox(transformMesh(base, [1, 1, 1], s.rotation)).size : null), [base, s.rotation]);
  const dims = native ? native.map((d, i) => d * s.scale[i]) : [0, 0, 0];
  const setDim = (i: number, v: number) =>
    set((x) => {
      if (!native || native[i] <= 0) return;
      const k = v / native[i];
      if (x.lockProportions) {
        const r = k / x.scale[i];
        x.scale = x.scale.map((q) => q * r) as typeof x.scale;
      } else x.scale[i] = k;
    });
  return (
    <>
      <div className="panel-intro">
        <p>Size and place the shape, open it where it should be open, then even out the triangles. The pattern grows on this mesh.</p>
      </div>
      {warnings.map((w) => (
        <div className="panel-pad" key={w}>
          <Callout tone="warn">{w}</Callout>
        </div>
      ))}
      <Section title="Size">
        <Field label="Width · Depth · Height">
          <div className="xyz">
            {['W', 'D', 'H'].map((ax, i) => (
              <NumberInput key={ax} ariaLabel={ax} value={dims[i]} min={1} step={1} unit="len" onChange={(v) => setDim(i, v)} />
            ))}
            <IconButton label={s.lockProportions ? 'Proportions locked' : 'Proportions free'} active={s.lockProportions} onClick={() => set((x) => void (x.lockProportions = !x.lockProportions))}>
              {s.lockProportions ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />}
            </IconButton>
          </div>
        </Field>
        <SliderField
          label="Scale"
          value={Math.round(s.scale[0] * 1000) / 10}
          min={5}
          max={500}
          step={1}
          unit="%"
          onChange={(v) =>
            set((x) => {
              const r = v / 100 / x.scale[0];
              x.scale = x.scale.map((q) => q * r) as typeof x.scale;
            })
          }
        />
        <Field label="Rotation X · Y · Z">
          <div className="xyz">
            {[0, 1, 2].map((i) => (
              <NumberInput key={i} ariaLabel={`Rotation ${'XYZ'[i]}`} value={s.rotation[i]} step={5} unit="°" onChange={(v) => set((x) => void (x.rotation[i] = v))} />
            ))}
          </div>
        </Field>
        <SwitchField label="Sit on the floor" checked={s.dropToFloor} onChange={(v) => set((x) => void (x.dropToFloor = v))} />
      </Section>
      <Section title="Openings">
        <p className="muted small">Cut the shape flat to open it. Skeleton tube ends are opened on the Shape step.</p>
        {s.cutPlanes.map((c, i) => (
          <CutRow key={c.id} c={c} onChange={(fn) => set((x) => fn(x.cutPlanes[i]))} onRemove={() => set((x) => void x.cutPlanes.splice(i, 1))} />
        ))}
        <Button
          size="sm"
          icon={<Plus size={14} aria-hidden />}
          onClick={() => set((x) => void x.cutPlanes.push({ id: Date.now(), axis: 'z', offset: 0.9, enabled: true }))}
        >
          Add cut
        </Button>
      </Section>
      <Section title="Remesh">
        <SwitchField label="Even out triangles" hint="Isotropic remeshing: every triangle about the same size. Pattern cells follow these triangles." checked={s.remesh} onChange={(v) => set((x) => void (x.remesh = v))} />
        {s.remesh && (
          <>
            <SliderField label="Triangles" hint="Roughly how many triangles the working surface has. In the reference, 2,010." value={s.targetTriangles} min={100} max={12000} step={10} onChange={(v) => set((x) => void (x.targetTriangles = v))} />
            <SliderField label="Iterations" value={s.remeshIterations} min={1} max={12} step={1} onChange={(v) => set((x) => void (x.remeshIterations = v))} />
          </>
        )}
      </Section>
      <Section title="Relax">
        <SegmentedField
          label="Mode"
          hint="Minimal surface pulls the skin tight between open rims, like a soap film (Kangaroo). Smooth removes bumps without shrinking."
          value={s.relax}
          onChange={(v) => set((x) => void (x.relax = v))}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'minimal', label: 'Minimal' },
            { value: 'smooth', label: 'Smooth' },
          ]}
        />
        {s.relax !== 'off' && (
          <>
            <SliderField label="Iterations" value={s.relaxIterations} min={1} max={300} step={1} onChange={(v) => set((x) => void (x.relaxIterations = v))} />
            <SliderField label="Strength" value={s.relaxStrength} min={0} max={1} step={0.01} onChange={(v) => set((x) => void (x.relaxStrength = v))} />
          </>
        )}
      </Section>
    </>
  );
}

function CutRow({ c, onChange, onRemove }: { c: CutPlane; onChange: (fn: (c: CutPlane) => void) => void; onRemove: () => void }) {
  return (
    <div className="cut-row">
      <Select<CutPlane['axis']>
        ariaLabel="Keep side"
        value={c.axis}
        onChange={(v) => onChange((x) => void (x.axis = v))}
        options={[
          { value: 'z', label: 'Keep below Z' },
          { value: '-z', label: 'Keep above Z' },
          { value: 'x', label: 'Keep left of X' },
          { value: '-x', label: 'Keep right of X' },
          { value: 'y', label: 'Keep front of Y' },
          { value: '-y', label: 'Keep back of Y' },
        ]}
      />
      <SliderField label="At" value={Math.round(c.offset * 100)} min={1} max={99} step={1} unit="%" onChange={(v) => onChange((x) => void (x.offset = v / 100))} />
      <IconButton label="Remove cut" onClick={onRemove}>
        <Trash2 size={14} aria-hidden />
      </IconButton>
    </div>
  );
}
