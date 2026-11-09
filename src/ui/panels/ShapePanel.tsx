import { useRef, useState } from 'react';
import { Plus, Trash2, Upload, Wand2, Eraser, Hand, Paintbrush, CircleDot, Minus, Waves, ArrowDownToLine } from 'lucide-react';
import { useProject } from '@/state/project';
import { useUI, type SculptBrush } from '@/state/ui';
import { useResults } from '@/state/results';
import { PRIMITIVES } from '@/core/presets';
import { SKELETON_PRESETS } from '@/core/modeling/skeletonPresets';
import { nodeDegrees } from '@/core/modeling/skeleton';
import type { PrimitiveKind, ShapeParams } from '@/core/params';
import { importMeshFile, IMPORT_ACCEPT } from '@/io/importMesh';
import { newAssetId, putAsset } from '@/state/assets';
import { uploadAsset, geometry } from '@/state/engine';
import { surfaceArea } from '@/core/mesh/mesh';
import { Button, Callout, NumberField, Section, Segmented, SegmentedField, SelectField, SliderField, SwitchField, NumberInput, Field } from '../components/controls';

export function ShapePanel() {
  const source = useProject((s) => s.project.shape.source);
  const update = useProject((s) => s.update);
  const tool = useUI((s) => s.shapeTool);
  const setUI = useUI((s) => s.set);
  return (
    <>
      <div className="panel-intro">
        <p>Model the form here, or bring in your own. The next step turns it into a clean working surface.</p>
      </div>
      <div className="panel-pad">
        <Segmented<ShapeParams['source']>
          ariaLabel="Shape source"
          value={source}
          onChange={(v) => update((p) => void (p.shape.source = v))}
          options={[
            { value: 'skeleton', label: 'Skeleton' },
            { value: 'primitive', label: 'Primitive' },
            { value: 'mesh', label: 'Import' },
          ]}
        />
      </div>
      {source === 'skeleton' && <SkeletonEditor />}
      {source === 'primitive' && <PrimitiveEditor />}
      {source === 'mesh' && <ImportEditor />}
      <Section title="Sculpt" defaultOpen={tool === 'sculpt'}>
        <SwitchField
          label="Sculpt mode"
          hint="Brush directly on the shape in the 3D view. Your first stroke turns the shape into an editable mesh."
          checked={tool === 'sculpt'}
          onChange={(v) => setUI({ shapeTool: v ? 'sculpt' : 'build', view: '3d' })}
        />
        {tool === 'sculpt' && <SculptControls />}
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ skeleton

function SkeletonEditor() {
  const sk = useProject((s) => s.project.shape.skeleton);
  const update = useProject((s) => s.update);
  const sel = useUI((s) => s.selectedNode);
  const setUI = useUI((s) => s.set);
  const node = sk.nodes.find((n) => n.id === sel) ?? null;
  const deg = nodeDegrees(sk);
  const addBranch = () =>
    update((p) => {
      const s = p.shape.skeleton;
      const from = s.nodes.find((n) => n.id === sel) ?? s.nodes[s.nodes.length - 1];
      const id = Math.max(-1, ...s.nodes.map((n) => n.id)) + 1;
      const pos: [number, number, number] = from ? [from.p[0] + 120, from.p[1], from.p[2] + 80] : [0, 0, 0];
      s.nodes.push({ id, p: pos, r: from?.r ?? 80, open: true });
      if (from) s.edges.push({ a: from.id, b: id });
      setUI({ selectedNode: id });
    });
  const remove = () =>
    update((p) => {
      const s = p.shape.skeleton;
      if (sel == null || s.nodes.length <= 2) return;
      s.nodes = s.nodes.filter((n) => n.id !== sel);
      s.edges = s.edges.filter((e) => e.a !== sel && e.b !== sel);
      setUI({ selectedNode: null });
    });
  return (
    <>
      <Section title="Skeleton">
        <SelectField
          label="Start from"
          value={'custom' as string}
          options={[{ value: 'custom', label: 'Current skeleton' }, ...SKELETON_PRESETS.map((x) => ({ value: x.id, label: x.label }))]}
          onChange={(id) => {
            const preset = SKELETON_PRESETS.find((x) => x.id === id);
            if (preset) update((p) => void (p.shape.skeleton = preset.make()));
          }}
        />
        <p className="muted small">Click a node in the 3D view to select it, then drag the arrows to move it.</p>
        <div className="btn-row">
          <Button icon={<Plus size={14} aria-hidden />} onClick={addBranch} size="sm">
            {node ? 'Branch from node' : 'Add node'}
          </Button>
          <Button icon={<Trash2 size={14} aria-hidden />} onClick={remove} size="sm" variant="ghost" disabled={!node || sk.nodes.length <= 2}>
            Delete node
          </Button>
        </div>
        <SliderField label="Blend radius" hint="How softly tubes merge where lines meet." value={sk.blend} min={0} max={200} step={1} unit="len" onChange={(v) => update((p) => void (p.shape.skeleton.blend = v))} />
        <SliderField label="Resolution" hint="Cells along the longest side when building the body. Higher is smoother but slower." value={sk.resolution} min={32} max={200} step={4} onChange={(v) => update((p) => void (p.shape.skeleton.resolution = v))} />
      </Section>
      {node && (
        <Section title={`Node ${node.id}`}>
          <Field label="Position">
            <div className="xyz">
              {(['X', 'Y', 'Z'] as const).map((ax, i) => (
                <NumberInput
                  key={ax}
                  ariaLabel={`Node ${ax}`}
                  value={node.p[i]}
                  step={1}
                  unit="len"
                  onChange={(v) =>
                    update((p) => {
                      const n = p.shape.skeleton.nodes.find((x) => x.id === node.id)!;
                      n.p[i] = v;
                    })
                  }
                />
              ))}
            </div>
          </Field>
          <SliderField
            label="Tube radius"
            value={node.r}
            min={5}
            max={400}
            step={1}
            unit="len"
            onChange={(v) => update((p) => void (p.shape.skeleton.nodes.find((x) => x.id === node.id)!.r = v))}
          />
          {deg.get(node.id) === 1 && (
            <SwitchField
              label="Open end"
              hint="Cut the tube flat at this node, leaving an opening."
              checked={node.open}
              onChange={(v) => update((p) => void (p.shape.skeleton.nodes.find((x) => x.id === node.id)!.open = v))}
            />
          )}
        </Section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ primitive

function PrimitiveEditor() {
  const pr = useProject((s) => s.project.shape.primitive);
  const update = useProject((s) => s.update);
  const info = PRIMITIVES.find((x) => x.kind === pr.kind)!;
  const set = (fn: (x: typeof pr) => void) => update((p) => fn(p.shape.primitive));
  return (
    <Section title="Primitive">
      <div className="chip-grid" role="radiogroup" aria-label="Primitive">
        {PRIMITIVES.map((x) => (
          <button key={x.kind} type="button" role="radio" aria-checked={pr.kind === x.kind} className="chip" onClick={() => set((p) => void (p.kind = x.kind as PrimitiveKind))}>
            {x.label}
          </button>
        ))}
      </div>
      <SliderField label="Size" value={pr.size} min={40} max={2000} step={5} unit="len" onChange={(v) => set((p) => void (p.size = v))} />
      <SliderField label={info.a} value={pr.a} min={0} max={1} step={0.01} onChange={(v) => set((p) => void (p.a = v))} />
      <SliderField label={info.b} value={pr.b} min={0} max={1} step={0.01} onChange={(v) => set((p) => void (p.b = v))} />
      <SliderField label={info.c} value={pr.c} min={0} max={1} step={0.01} onChange={(v) => set((p) => void (p.c = v))} />
      {pr.kind === 'blob' || pr.kind === 'sphere' ? (
        <NumberField label="Seed" value={pr.seed} min={0} max={99999} step={1} onChange={(v) => set((p) => void (p.seed = Math.round(v)))} />
      ) : null}
      {pr.kind !== 'saddle' && pr.kind !== 'knot' && pr.kind !== 'torus' && (
        <>
          <SwitchField label="Open top" checked={pr.openTop} onChange={(v) => set((p) => void (p.openTop = v))} />
          <SwitchField label="Open bottom" checked={pr.openBottom} onChange={(v) => set((p) => void (p.openBottom = v))} />
        </>
      )}
      <SliderField label="Resolution" value={pr.resolution} min={16} max={180} step={2} onChange={(v) => set((p) => void (p.resolution = v))} />
    </Section>
  );
}

// ------------------------------------------------------------------ import

function ImportEditor() {
  const shape = useProject((s) => s.project.shape);
  const update = useProject((s) => s.update);
  const base = useResults((s) => s.base);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'info' | 'warn' | 'danger'; text: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const load = async (file: File) => {
    setBusy(true);
    setMsg(null);
    try {
      const { mesh, warnings } = await importMeshFile(file);
      const id = newAssetId();
      await putAsset(id, mesh);
      await uploadAsset(id, mesh);
      update((p) => {
        p.shape.source = 'mesh';
        p.shape.meshAsset = id;
        p.shape.meshName = file.name;
        p.surface.scale = [1, 1, 1];
      });
      setMsg({ tone: warnings.length ? 'warn' : 'info', text: warnings.length ? warnings.join(' ') : `Loaded ${(mesh.indices.length / 3).toLocaleString()} triangles.` });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Import a model">
      <button
        type="button"
        className="dropzone"
        data-drag={drag}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) load(f);
        }}
      >
        <Upload size={18} aria-hidden />
        <span className="dropzone__title">{busy ? 'Reading file…' : shape.meshName || 'Drop a 3D file or browse'}</span>
        <span className="dropzone__hint">STL · OBJ · PLY · GLB/GLTF · Rhino 3DM</span>
      </button>
      <input ref={input} type="file" accept={IMPORT_ACCEPT} hidden onChange={(e) => e.currentTarget.files?.[0] && load(e.currentTarget.files[0])} />
      {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
      <SegmentedField
        label="File units"
        hint="What one unit in the file means. The app works in millimetres."
        value={shape.importUnits}
        onChange={(v) => update((p) => void (p.shape.importUnits = v))}
        options={[
          { value: 'mm', label: 'mm' },
          { value: 'cm', label: 'cm' },
          { value: 'm', label: 'm' },
          { value: 'in', label: 'in' },
        ]}
      />
      {base && shape.meshAsset && (
        <p className="muted small">
          {(base.indices.length / 3).toLocaleString()} triangles · {(surfaceArea(base) / 1e6).toFixed(3)} m² surface
        </p>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ sculpt

const BRUSHES: { value: SculptBrush; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: 'draw', label: 'Draw', icon: <Paintbrush size={14} aria-hidden />, hint: 'Push out along the surface (hold Alt to push in)' },
  { value: 'inflate', label: 'Inflate', icon: <CircleDot size={14} aria-hidden />, hint: 'Swell each point along its own normal' },
  { value: 'grab', label: 'Grab', icon: <Hand size={14} aria-hidden />, hint: 'Drag a region with the pointer' },
  { value: 'smooth', label: 'Smooth', icon: <Waves size={14} aria-hidden />, hint: 'Relax bumps' },
  { value: 'flatten', label: 'Flatten', icon: <Minus size={14} aria-hidden />, hint: 'Press toward the average plane' },
  { value: 'pinch', label: 'Pinch', icon: <ArrowDownToLine size={14} aria-hidden />, hint: 'Pull points toward the brush centre' },
  { value: 'erase', label: 'Erase', icon: <Eraser size={14} aria-hidden />, hint: 'Delete faces to make an opening' },
];

function SculptControls() {
  const brush = useUI((s) => s.brush);
  const setUI = useUI((s) => s.set);
  const base = useResults((s) => s.base);
  const update = useProject((s) => s.update);
  const [busy, setBusy] = useState(false);
  const setBrush = (b: Partial<typeof brush>) => setUI({ brush: { ...brush, ...b } });
  const refine = async () => {
    if (!base) return;
    setBusy(true);
    try {
      const area = surfaceArea(base);
      const edge = Math.sqrt((4 * area) / (Math.sqrt(3) * 60000));
      const m = await geometry().remesh(base, edge, 3);
      const id = newAssetId();
      await putAsset(id, m);
      await uploadAsset(id, m);
      update((p) => {
        p.shape.source = 'mesh';
        p.shape.meshAsset = id;
        p.shape.meshName = p.shape.meshName || 'Sculpted shape';
        p.shape.importUnits = 'mm';
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="chip-grid" role="radiogroup" aria-label="Brush">
        {BRUSHES.map((b) => (
          <button key={b.value} type="button" role="radio" aria-checked={brush.kind === b.value} className="chip chip--icon" title={b.hint} onClick={() => setBrush({ kind: b.value })}>
            {b.icon}
            {b.label}
          </button>
        ))}
      </div>
      <SliderField label="Radius" value={brush.radius} min={2} max={400} step={1} unit="len" onChange={(v) => setBrush({ radius: v })} />
      <SliderField label="Strength" value={brush.strength} min={0.02} max={1} step={0.01} onChange={(v) => setBrush({ strength: v })} />
      <SwitchField label="Mirror across X" checked={brush.symmetryX} onChange={(v) => setBrush({ symmetryX: v })} />
      <Button icon={<Wand2 size={14} aria-hidden />} onClick={refine} disabled={busy || !base} full>
        {busy ? 'Refining…' : 'Refine mesh for sculpting'}
      </Button>
      <p className="muted small">Refining makes the triangles even so brushes act smoothly. Undo works on every stroke.</p>
    </>
  );
}
