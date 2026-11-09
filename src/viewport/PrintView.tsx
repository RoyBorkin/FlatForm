/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Print view: every part that has to be 3D printed, laid out on print beds
 * ready to slice — or, with duplicates hidden, one of each with its count.
 */
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { BufferGeometry, Color, InstancedMesh, Line, LineBasicMaterial, Matrix4, MeshStandardMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Download, Loader2 } from 'lucide-react';
import { useProject } from '@/state/project';
import { useResults } from '@/state/results';
import { useLayerColors } from '@/state/ui';
import { ensurePrintItems, printLayout, usePrint, type PrintItem } from '@/state/printPlates';
import { meshDataToGeometry, partExtrusion } from './geometry';
import { useCssVar } from './useCssVar';
import { Button, Segmented } from '@/ui/components/controls';
import { exporters } from '@/io/export/exporters';

const GROUP_COLOR: Record<string, string> = {
  'Junction hubs': '#faaf40',
  'Crossing clips': '#ee4036',
  'Cardboard connectors': '#ee4036',
  'LEGO-compatible bricks': '#d9412f',
  'Printed connectors': '#faaf40',
  'Layer spacers': '#faaf40',
};

/** Identity of a method result, so the print list is rebuilt only when the build changes. */
const ids = new WeakMap<object, number>();
let nextId = 1;
const idOf = (o: object) => {
  if (!ids.has(o)) ids.set(o, nextId++);
  return ids.get(o)!;
};

export const PLATE_GAP = 40;

/** Labels render into a layer of their own (not next to the canvas), so unmounting never fights React. */
const LabelLayer = createContext<MutableRefObject<HTMLElement> | null>(null);

/** Plate k's origin (its front-left corner) in a grid of `cols` columns. */
export const plateOrigin = (k: number, cols: number, w: number, h: number): [number, number] => [(k % cols) * (w + PLATE_GAP), -Math.floor(k / cols) * (h + PLATE_GAP)];

/** Matrix for one copy: lay the mesh's min corner at (x, y), turned 90° if asked. */
export function copyMatrix(it: PrintItem, x: number, y: number, rot: boolean): Matrix4 {
  const m = new Matrix4().makeTranslation(it.offset[0], it.offset[1], it.offset[2]);
  if (rot) m.premultiply(new Matrix4().makeRotationZ(Math.PI / 2)).premultiply(new Matrix4().makeTranslation(it.d, 0, 0));
  return m.premultiply(new Matrix4().makeTranslation(x, y, 0));
}

export function usePrintLayout() {
  const p = useProject((s) => s.project);
  const method = useResults((s) => s.method);
  const nest = useResults((s) => s.nest);
  const partIndex = useResults((s) => s.partIndex);
  const { items, unique } = usePrint();
  const lay = useMemo(() => printLayout(p, nest, partIndex, items, unique), [p, nest, partIndex, items, unique]);
  return { p, method, items, unique, ...lay };
}

export function PrintView() {
  const p = useProject((s) => s.project);
  const method = useResults((s) => s.method);
  const busyBuild = useResults((s) => s.busy);
  const { busy, error, unique, set } = usePrint();
  const L = usePrintLayout();
  const bg = useCssVar('--viewport-bg');
  // Rebuild the printed parts whenever the build or the joinery changes.
  const key = method ? `${idOf(method)}|${JSON.stringify(p.joinery)}|${p.material.thickness}|${p.bricks.unit}` : '';
  useEffect(() => {
    if (method && !busyBuild) void ensurePrintItems(p, method, key);
  }, [key, busyBuild]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = L.items.reduce((s, it) => s + it.count, 0) + L.sheets.reduce((s, sp) => s + sp.parts.length, 0);
  const grams = useMemo(() => {
    const P = p.manufacturing.print;
    const fill = Math.min(1, 0.35 + P.infill * 0.65); // walls and skins are solid, the rest is infill
    return (L.items.reduce((s, it) => s + it.volume * it.count, 0) / 1000) * P.density * fill;
  }, [L.items, p.manufacturing.print]);
  const empty = !busy && !L.items.length && !L.sheets.length;
  const labels = useRef<HTMLDivElement>(null);
  return (
    <div className="print-view">
      <div className="print-view__labels" ref={labels} />
      <Canvas className="scene3d" frameloop="demand" dpr={[1, 2]} gl={{ antialias: true }} camera={{ fov: 30, near: 1, far: 200000, position: [0, -800, 900], up: [0, 0, 1] }}>
        <color attach="background" args={[bg]} />
        <hemisphereLight args={['#ffffff', '#55504a', 1.1]} />
        <directionalLight position={[400, -700, 1200]} intensity={1.8} />
        <LabelLayer.Provider value={labels as MutableRefObject<HTMLElement>}>
          <PrintScene />
        </LabelLayer.Provider>
      </Canvas>
      <div className="print-view__bar">
        <Segmented<'all' | 'unique'>
          ariaLabel="Copies"
          size="sm"
          value={unique ? 'unique' : 'all'}
          onChange={(v) => set({ unique: v === 'unique' })}
          options={[
            { value: 'all', label: 'All copies' },
            { value: 'unique', label: 'Hide duplicates' },
          ]}
        />
        <span className="print-view__stats">
          {busy ? (
            <>
              <Loader2 size={13} className="spin" aria-hidden /> Building printed parts…
            </>
          ) : (
            <>
              {total.toLocaleString()} parts · {unique ? `${L.items.length} kinds` : `${L.plates} plate${L.plates === 1 ? '' : 's'}`} · bed {L.bed.w} × {L.bed.h} mm{grams > 0 ? ` · ≈ ${grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${Math.round(grams)} g`} ${p.manufacturing.print.material}` : ''}
            </>
          )}
        </span>
        {!unique && (L.items.length > 0 || L.sheets.length > 0) && (
          <Button size="sm" icon={<Download size={13} aria-hidden />} onClick={() => exporters.printPlates('3mf')} disabled={busy}>
            Plates (3MF)
          </Button>
        )}
      </div>
      {L.pack.oversize.length > 0 && !unique && (
        <div className="print-view__warn" role="status">
          Bigger than the bed: {L.pack.oversize.slice(0, 4).join(', ')}
          {L.pack.oversize.length > 4 ? '…' : ''}. Choose a bigger bed in Material & making → 3D print, or make the parts smaller.
        </div>
      )}
      {unique && L.items.length > 0 && <PrintList items={L.items} />}
      {empty && (
        <div className="viewport__empty">
          {error
            ? `Could not build the printed parts: ${error}`
            : 'Nothing to 3D print for this build. Printed parts appear here with junction hubs, crossing clips, cardboard connectors, printed connectors, LEGO bricks, or when Material & making is set to 3D print.'}
        </div>
      )}
    </div>
  );
}

/** One of each, with the amount to print. */
function PrintList({ items }: { items: PrintItem[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, PrintItem[]>();
    for (const it of items) m.set(it.group, [...(m.get(it.group) ?? []), it]);
    return [...m.entries()];
  }, [items]);
  return (
    <aside className="print-list" aria-label="Parts to print">
      {groups.map(([g, list]) => (
        <section key={g}>
          <h3 className="print-list__head">
            {g} <span className="muted">{list.reduce((s, it) => s + it.count, 0).toLocaleString()}</span>
          </h3>
          <table className="kit-table">
            <tbody>
              {list.map((it) => (
                <tr key={it.key}>
                  <td className="print-list__name" title={it.ids?.slice(0, 30).join(' ')}>
                    {it.name}
                  </td>
                  <td>×{it.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </aside>
  );
}

function PrintScene() {
  const L = usePrintLayout();
  const portal = useContext(LabelLayer);
  const colors = useLayerColors();
  const plateColor = useCssVar('--raised');
  const lineColor = useCssVar('--line-strong');
  const accent = useCssVar('--layer-0');
  const { w: bw, h: bh } = L.bed;
  const areaW = L.unique ? L.pack.width : bw, areaH = L.unique ? L.pack.height : bh;
  const outline = useMemo(() => {
    const g = new BufferGeometry().setFromPoints([new Vector3(0, 0, 0.05), new Vector3(areaW, 0, 0.05), new Vector3(areaW, areaH, 0.05), new Vector3(0, areaH, 0.05), new Vector3(0, 0, 0.05)]);
    return new Line(g, new LineBasicMaterial({ color: lineColor }));
  }, [areaW, areaH, lineColor]);
  const origins = useMemo(() => Array.from({ length: Math.max(1, L.plates) }, (_, k) => plateOrigin(k, L.cols, areaW, areaH)), [L.plates, L.cols, areaW, areaH]);
  return (
    <group>
      {origins.map(([ox, oy], k) => (
        <group key={k} position={[ox, oy, 0]}>
          <mesh position={[areaW / 2, areaH / 2, -0.6]}>
            <boxGeometry args={[areaW, areaH, 1.2]} />
            <meshStandardMaterial color={plateColor} roughness={0.9} />
          </mesh>
          <primitive object={outline} />
          {!L.unique && (
            <Html portal={portal ?? undefined} position={[0, areaH + 6, 0]} className="print-view__plate-label" zIndexRange={[10, 0]}>
              Plate {k + 1}
            </Html>
          )}
        </group>
      ))}
      {L.sheets.map((sp, k) => (
        <SheetPlate key={`s${k}`} plate={sp} origin={origins[k] ?? [0, 0]} thickness={L.p.material.thickness} colors={colors} />
      ))}
      {L.items.map((it, i) => (
        <ItemCopies key={it.key} item={it} index={i} copies={L.pack.copies} origins={origins} color={GROUP_COLOR[it.group] ?? accent} unique={L.unique} />
      ))}
      <FitCamera w={(L.cols - 1) * (areaW + PLATE_GAP) + areaW} h={Math.ceil(Math.max(1, L.plates) / L.cols) * (areaH + PLATE_GAP)} top={areaH} list={L.unique} />
    </group>
  );
}

function ItemCopies({ item, index, copies, origins, color, unique }: { item: PrintItem; index: number; copies: { item: number; plate: number; x: number; y: number; rot: boolean }[]; origins: [number, number][]; color: string; unique: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const portal = useContext(LabelLayer);
  const invalidate = useThree((s) => s.invalidate);
  const geo = useMemo(() => meshDataToGeometry(item.mesh), [item.mesh]);
  const mat = useMemo(() => new MeshStandardMaterial({ color: new Color(color), roughness: 0.55, metalness: 0.05 }), [color]);
  const mine = useMemo(() => copies.filter((c) => c.item === index), [copies, index]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    mine.forEach((c, i) => {
      const [ox, oy] = origins[c.plate] ?? [0, 0];
      m.setMatrixAt(i, copyMatrix(item, ox + c.x, oy + c.y, c.rot));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [mine, origins, item, invalidate]);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  if (!mine.length) return null;
  const first = mine[0];
  const [fx, fy] = origins[first.plate] ?? [0, 0];
  const fw = first.rot ? item.d : item.w, fd = first.rot ? item.w : item.d;
  return (
    <>
      <instancedMesh key={mine.length} ref={ref} args={[geo, mat, mine.length]} />
      {unique && item.count > 1 && (
        <Html portal={portal ?? undefined} position={[fx + first.x + fw / 2, fy + first.y + fd / 2, item.h + 2]} center className="print-view__count" zIndexRange={[10, 0]}>
          ×{item.count}
        </Html>
      )}
    </>
  );
}

function SheetPlate({ plate, origin, thickness, colors }: { plate: { parts: { part: import('@/core/types').Part2D; x: number; y: number; rot: number }[] }; origin: [number, number]; thickness: number; colors: string[] }) {
  const geos = useMemo(() => {
    const byGroup = new Map<number, BufferGeometry[]>();
    for (const q of plate.parts) {
      const g = partExtrusion(q.part, thickness);
      if (!g) continue;
      g.applyMatrix4(new Matrix4().makeRotationZ(q.rot).premultiply(new Matrix4().makeTranslation(q.x, q.y, 0)));
      byGroup.set(q.part.group, [...(byGroup.get(q.part.group) ?? []), g.toNonIndexed()]);
    }
    return [...byGroup.entries()].map(([g, list]) => ({ g, geo: mergeGeometries(list, false) })).filter((x) => x.geo);
  }, [plate, thickness]);
  useEffect(() => () => geos.forEach((x) => x.geo?.dispose()), [geos]);
  return (
    <group position={[origin[0], origin[1], 0]}>
      {geos.map(({ g, geo }) => (
        <mesh key={g} geometry={geo!}>
          <meshStandardMaterial color={colors[g % colors.length]} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** Frame the whole layout once whenever its size changes. */
function FitCamera({ w, h, top, list }: { w: number; h: number; top: number; list: boolean }) {
  const { camera, controls, invalidate } = useThree() as unknown as { camera: import('three').PerspectiveCamera; controls: OrbitControlsImpl | null; invalidate: () => void };
  useEffect(() => {
    // With the parts list open on the right, frame the parts in the left part of the view.
    const span = Math.max(w, h) * (list ? 1.9 : 1.15);
    const cx = w / 2 + (list ? span * 0.22 : 0), cy = top - h / 2;
    const dist = span / (2 * Math.tan((camera.fov * Math.PI) / 360));
    camera.position.set(cx, cy - dist * 0.45, dist * 0.9);
    camera.lookAt(cx, cy, 0);
    if (controls) {
      controls.target.set(cx, cy, 0);
      controls.update();
    }
    invalidate();
  }, [w, h, top, list, camera, controls, invalidate]);
  return <OrbitControls makeDefault enableDamping={false} />;
}
