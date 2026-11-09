/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { Shuffle } from 'lucide-react';
import { useMemo } from 'react';
import { useProject } from '@/state/project';
import { useResults } from '@/state/results';
import type { BrickSize, BricksParams, StackParams, SticksParams } from '@/core/params';
import { LEGO_COLORS, LEGO_PARTS, STICK_PRESETS } from '@/core/presets';
import { brickKind } from '@/core/bricks/catalog';
import { Callout, IconButton, NumberField, Section, SegmentedField, SelectField, SliderField, SwitchField, useUnits } from '../../components/controls';

// ------------------------------------------------------------------ sticks

export function SticksControls() {
  const S = useProject((s) => s.project.sticks);
  const join = useProject((s) => s.project.joinery.kind);
  const update = useProject((s) => s.update);
  const set = (fn: (x: SticksParams) => void) => update((p) => fn(p.sticks));
  return (
    <>
      <Section title="Sticks">
        <SliderField label="Faces" hint="0 keeps the surface mesh from the Surface step. Fewer faces = fewer, longer sticks." value={S.targetFaces} min={0} max={2000} step={10} onChange={(v) => set((x) => void (x.targetFaces = v))} />
        <SelectField
          label="Stock"
          value={S.preset}
          onChange={(id) =>
            set((x) => {
              const pr = STICK_PRESETS.find((q) => q.id === id);
              x.preset = id;
              if (pr) {
                x.profile = pr.profile;
                x.size = pr.size;
                if (pr.inner) x.inner = pr.inner;
                if (pr.stock) x.stockLength = pr.stock;
              }
            })
          }
          options={[...STICK_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: 'Custom' }]}
        />
        <SegmentedField
          label="Profile"
          hint="Flat strips are laser-cut from the sheet; the others are bought and cut to length."
          value={S.profile}
          onChange={(v) => set((x) => void ((x.profile = v), (x.preset = 'custom')))}
          options={[
            { value: 'round', label: 'Round' },
            { value: 'tube', label: 'Tube' },
            { value: 'square', label: 'Square' },
            { value: 'flat', label: 'Flat strip' },
          ]}
        />
        <SliderField label={S.profile === 'flat' ? 'Strip width' : S.profile === 'square' ? 'Side' : 'Diameter'} value={S.size} min={1} max={40} step={0.1} unit="len" onChange={(v) => set((x) => void ((x.size = v), (x.preset = 'custom')))} />
        {S.profile === 'tube' && <SliderField label="Inner diameter" value={S.inner} min={0.5} max={Math.max(1, S.size - 0.5)} step={0.1} unit="len" onChange={(v) => set((x) => void (x.inner = v))} />}
        {S.profile !== 'flat' && <NumberField label="Stock length" hint="One bought stick, for the shopping count." value={S.stockLength} min={10} max={6000} step={1} unit="len" onChange={(v) => set((x) => void (x.stockLength = v))} />}
        <SliderField label="Length step" hint="Cut lengths are rounded to this, so equal sticks can be cut together." value={S.lengthStep} min={0.1} max={20} step={0.1} unit="len" onChange={(v) => set((x) => void (x.lengthStep = v))} />
        {S.profile === 'flat' && (
          <>
            <SwitchField label="Label strips" checked={S.labelSticks} onChange={(v) => set((x) => void (x.labelSticks = v))} />
            <SliderField label="Text height" value={S.textHeight} min={0.8} max={10} step={0.1} unit="len" onChange={(v) => set((x) => void (x.textHeight = v))} />
          </>
        )}
        {join !== 'junction' && <Callout>Sticks are measured centre to centre. Choose Junction hubs in the Joinery step for printed connectors at every node.</Callout>}
      </Section>
      <CutList />
    </>
  );
}

export function CutList() {
  const kit = useResults((s) => s.method?.kit);
  const u = useUnits();
  if (!kit?.sticks?.length) return null;
  const total = kit.sticks.reduce((s, r) => s + r.length * r.count, 0);
  const count = kit.sticks.reduce((s, r) => s + r.count, 0);
  return (
    <Section title="Cut list">
      <p className="muted small">
        {count} sticks, {kit.stickProfile}, {u.fmt(total / 1000 * u.k * (u.unit === 'm' ? 1 : 1), 2).replace(/ \w+$/, '')} total
        {kit.stickStock?.pieces ? ` · buy ${kit.stickStock.pieces} × ${u.fmt(kit.stickStock.length, 0)}` : ''}
      </p>
      <table className="kit-table">
        <thead>
          <tr>
            <th>Mark</th>
            <th>Length</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          {kit.sticks.slice(0, 80).map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{u.fmt(r.length)}</td>
              <td>{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {kit.sticks.length > 80 && <p className="muted small">…and {kit.sticks.length - 80} more lengths (full list in the parts list export).</p>}
    </Section>
  );
}

// ------------------------------------------------------------------ LEGO

const SIZES: BrickSize[] = ['1x1', '1x2', '1x3', '1x4', '1x6', '1x8', '1x10', '1x12', '2x2', '2x3', '2x4', '2x6', '2x8', '2x10', '4x4', '4x6', '4x8'];

export function BricksControls() {
  const B = useProject((s) => s.project.bricks);
  const update = useProject((s) => s.update);
  const set = (fn: (x: BricksParams) => void) => update((p) => fn(p.bricks));
  const stats = useResults((s) => s.method?.stats);
  return (
    <>
      <Section title="Bricks">
        <p className="muted small">Built at real size on the LEGO grid: 8 mm studs. Set the size of the model in the Surface step.</p>
        <SegmentedField
          label="Build in"
          value={B.unit}
          onChange={(v) => set((x) => void (x.unit = v))}
          options={[
            { value: 'brick', label: 'Bricks (9.6 mm)' },
            { value: 'plate', label: 'Plates (3.2 mm)' },
          ]}
        />
        <SwitchField label="Hollow" hint="Saves bricks: only a shell of the given thickness is built." checked={B.hollow} onChange={(v) => set((x) => void (x.hollow = v))} />
        {B.hollow && <SliderField label="Shell" value={B.shell} min={1} max={6} step={1} unit=" studs" onChange={(v) => set((x) => void (x.shell = v))} />}
        <SwitchField label="Stagger joints" hint="Turn the bricks every other layer so the joints overlap, like a brick wall." checked={B.stagger} onChange={(v) => set((x) => void (x.stagger = v))} />
        <fieldset className="chip-set">
          <legend>Brick sizes to use</legend>
          {SIZES.map((sz) => (
            <label key={sz} className="chip">
              <input
                type="checkbox"
                checked={B.sizes.includes(sz) && (B.unit === 'plate' || !!LEGO_PARTS[sz]?.brick)}
                disabled={sz === '1x1' || (B.unit === 'brick' && !LEGO_PARTS[sz]?.brick)}
                onChange={(e) =>
                  set((x) => {
                    x.sizes = e.target.checked ? [...new Set([...x.sizes, sz])] : x.sizes.filter((q) => q !== sz);
                  })
                }
              />
              <span>{sz.replace('x', '×')}</span>
            </label>
          ))}
        </fieldset>
        {B.unit === 'brick' && <p className="muted small">4×4 and 4×8 come only as plates.</p>}
      </Section>
      <Section title="Variety">
        <SwitchField label="Corner pieces" hint="L-shaped 2×2 corners (3 studs) where they fit. They tie walls together at turns." checked={B.corners} onChange={(v) => set((x) => void (x.corners = v))} />
        <SliderField label="Round pieces" hint="Share of 1×1 and 2×2 squares swapped, at random, for round 1×1 and round 2×2 pieces." value={Math.round(B.round * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => set((x) => void (x.round = v / 100))} />
        <SliderField label="Size mix" hint="How often a smaller piece is used where a bigger one fits. More mix = more kinds of pieces and a busier look." value={Math.round(B.mix * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => set((x) => void (x.mix = v / 100))} />
        {(B.round > 0 || B.mix > 0) && (
          <div className="seed-row">
            <NumberField label="Random seed" value={B.seed} min={1} max={9999} step={1} onChange={(v) => set((x) => void (x.seed = Math.round(v)))} />
            <IconButton label="New random mix" onClick={() => set((x) => void (x.seed = 1 + Math.floor(Math.random() * 9999)))}>
              <Shuffle size={14} aria-hidden />
            </IconButton>
          </div>
        )}
      </Section>
      <Section title="Colours">
        <SegmentedField
          label="Colour by"
          value={B.colorMode}
          onChange={(v) => set((x) => void (x.colorMode = v))}
          options={[
            { value: 'single', label: 'One colour' },
            { value: 'layers', label: 'Layers' },
            { value: 'height', label: 'Height bands' },
          ]}
        />
        {B.colorMode === 'single' ? (
          <SelectField label="Colour" value={String(B.color)} onChange={(v) => set((x) => void (x.color = Number(v)))} options={LEGO_COLORS.map((c) => ({ value: String(c.code), label: c.name }))} />
        ) : (
          <fieldset className="swatch-set">
            <legend>Palette</legend>
            {LEGO_COLORS.map((c) => {
              const on = B.palette.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  className="swatch"
                  aria-pressed={on}
                  title={c.name}
                  style={{ background: c.hex }}
                  onClick={() =>
                    set((x) => {
                      x.palette = on ? (x.palette.length > 1 ? x.palette.filter((q) => q !== c.code) : x.palette) : [...x.palette, c.code];
                    })
                  }
                >
                  <span className="sr-only">{c.name}</span>
                </button>
              );
            })}
          </fieldset>
        )}
      </Section>
      {stats && <BrickList />}
    </>
  );
}

export function BrickList() {
  const kit = useResults((s) => s.method?.kit);
  const rows = useMemo(() => {
    if (!kit?.bricks) return [];
    const plate = kit.brickUnit === 'plate';
    const map = new Map<string, { size: string; part: string; color: number; count: number }>();
    for (const b of kit.bricks) {
      const k = brickKind(b, plate);
      const key = `${k.key}|${b.color}`;
      const r = map.get(key) ?? { size: k.label, part: k.part, color: b.color, count: 0 };
      r.count++;
      map.set(key, r);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [kit]);
  if (!rows.length) return null;
  const plate = kit?.brickUnit === 'plate';
  return (
    <Section title="Brick list">
      <p className="muted small">
        {kit!.bricks!.length} {plate ? 'plates' : 'bricks'} · LDraw part numbers for BrickLink and LEGO Pick a Brick
      </p>
      <table className="kit-table">
        <thead>
          <tr>
            <th>Part</th>
            <th>Colour</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const c = LEGO_COLORS.find((x) => x.code === r.color);
            return (
              <tr key={`${r.size}${r.color}`}>
                <td>
                  {r.size} <span className="muted">{r.part}</span>
                </td>
                <td>
                  <span className="dot" style={{ background: c?.hex }} aria-hidden /> {c?.name ?? r.color}
                </td>
                <td>{r.count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

// ------------------------------------------------------------------ stacked layers

const MODE_TEXT: Record<StackParams['mode'], string> = {
  relief: 'What you see of the shape from one side, as outlines at several depths, stacked flat. Shadow-box and topographic style.',
  solid: 'Touching sections straight through the shape, held by bend tabs or rods. A solid, stepped object.',
  laminate: 'The surface built from several thin sheets laid face to face, each cut with different seams so the joints overlap.',
  shells: 'Offset copies of the shape, one inside the other, each an unfolded shell of panels.',
};

export function StackControls() {
  const S = useProject((s) => s.project.stack);
  const t = useProject((s) => s.project.material.thickness);
  const update = useProject((s) => s.update);
  const set = (fn: (x: StackParams) => void) => update((p) => fn(p.stack));
  const flat = S.mode === 'relief' || S.mode === 'solid';
  return (
    <>
      <Section title="Stack">
        <SelectField
          label="Kind"
          value={S.mode}
          onChange={(v) => set((x) => void (x.mode = v))}
          options={[
            { value: 'relief', label: 'Layered relief' },
            { value: 'solid', label: 'Solid stack' },
            { value: 'laminate', label: 'Laminated skins' },
            { value: 'shells', label: 'Nested shells' },
          ]}
        />
        <p className="muted small">{MODE_TEXT[S.mode]}</p>
        {S.mode !== 'solid' && <SliderField label={S.mode === 'shells' ? 'Shells' : 'Layers'} value={S.count} min={2} max={S.mode === 'relief' ? 60 : 8} step={1} onChange={(v) => set((x) => void (x.count = v))} />}
        {S.mode === 'solid' && <p className="muted small">One layer per sheet thickness ({t} mm), touching.</p>}
        {flat && (
          <>
            <SliderField label={S.mode === 'relief' ? 'View from (turn)' : 'Turn (azimuth)'} value={S.azimuth} min={-180} max={180} step={1} unit="°" onChange={(v) => set((x) => void (x.azimuth = v))} />
            <SliderField label={S.mode === 'relief' ? 'View from (tilt)' : 'Tilt (elevation)'} hint={S.mode === 'relief' ? '0° looks from the side; 90° looks down from the top.' : '90° stacks horizontal layers.'} value={S.elevation} min={-90} max={90} step={1} unit="°" onChange={(v) => set((x) => void (x.elevation = v))} />
          </>
        )}
        {S.mode === 'relief' && (
          <>
            <SliderField label="Depth curve" hint="1 spaces the layers evenly through the depth; higher puts more layers near the front." value={S.depthCurve} min={0.4} max={3} step={0.05} onChange={(v) => set((x) => void (x.depthCurve = v))} />
            <SwitchField label="Backing board" checked={S.backing} onChange={(v) => set((x) => void (x.backing = v))} />
            {S.backing && <SliderField label="Margin" value={S.margin} min={0} max={80} step={0.5} unit="len" onChange={(v) => set((x) => void (x.margin = v))} />}
          </>
        )}
        {S.mode === 'solid' && <SliderField label="Band (open surfaces)" value={S.margin} min={2} max={80} step={0.5} unit="len" onChange={(v) => set((x) => void (x.margin = v))} />}
        {(S.mode === 'laminate' || S.mode === 'shells') && <SliderField label="Faces" value={S.targetFaces} min={100} max={4000} step={20} onChange={(v) => set((x) => void (x.targetFaces = v))} />}
        {S.mode === 'laminate' && (
          <>
            <SliderField label="Pieces per layer" value={S.pieces} min={1} max={40} step={1} onChange={(v) => set((x) => void (x.pieces = v))} />
            <SliderField label="Pin spacing" value={S.pinSpacing} min={10} max={300} step={1} unit="len" onChange={(v) => set((x) => void (x.pinSpacing = v))} />
            <NumberField label="Seed" value={S.seed} min={0} max={99999} step={1} onChange={(v) => set((x) => void (x.seed = Math.round(v)))} />
          </>
        )}
        {S.mode === 'shells' && <SliderField label="Gap between shells" value={S.shellGap} min={1} max={200} step={0.5} unit="len" onChange={(v) => set((x) => void (x.shellGap = v))} />}
      </Section>
      <Section title="Labels & rods">
        {flat && <SliderField label="Rods" hint="Through the stack, when the joinery uses holes." value={S.rods} min={0} max={4} step={1} onChange={(v) => set((x) => void (x.rods = v))} />}
        {flat && <SwitchField label="Engrave guides" hint="Each layer shows where the next one sits." checked={S.registration} onChange={(v) => set((x) => void (x.registration = v))} />}
        <SwitchField label="Label parts" checked={S.labelParts} onChange={(v) => set((x) => void (x.labelParts = v))} />
        <SliderField label="Text height" value={S.textHeight} min={0.8} max={20} step={0.1} unit="len" onChange={(v) => set((x) => void (x.textHeight = v))} />
      </Section>
    </>
  );
}
