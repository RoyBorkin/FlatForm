/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PMREMGenerator,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useResults } from '@/state/results';
import { useUI, useLayerColors } from '@/state/ui';
import { useProject } from '@/state/project';
import { meshDataToGeometry, partExtrusion, pinMatrices, stripMatrices, unitBox, unitDisc, unitPin, panelsGeometry, spacerGeometry } from './geometry';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { layerMaterial, stockMaterial } from './materials';
import { SkeletonEditor3D } from './SkeletonEditor3D';
import { SculptLayer } from './Sculpt';
import { useCssVar } from './useCssVar';
import type { MeshData, MethodResult } from '@/core/types';

Object3D.DEFAULT_UP.set(0, 0, 1);

export function Scene3D() {
  const settings = useUI((s) => s.settings);
  const bg = useCssVar('--viewport-bg');
  return (
    <Canvas
      className="scene3d"
      shadows={settings.showShadows}
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 35, near: 1, far: 100000, position: [900, -1400, 900], up: [0, 0, 1] }}
      onPointerMissed={(e) => {
        if (e.button === 0) useUI.getState().set({ selectedPart: null, selectedNode: null });
      }}
    >
      <color attach="background" args={[bg]} />
      <Environment />
      <hemisphereLight args={['#ffffff', '#55504a', 0.6]} />
      <directionalLight position={[600, -900, 1400]} intensity={1.6} castShadow={settings.showShadows} shadow-mapSize={[2048, 2048]} shadow-camera-left={-1500} shadow-camera-right={1500} shadow-camera-top={1500} shadow-camera-bottom={-1500} shadow-camera-far={6000} shadow-bias={-0.0004} />
      <Floor />
      <Content />
      <CameraRig />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.9} axisColors={['#e0675a', '#6cc287', '#5a9ee0']} />
      </GizmoHelper>
    </Canvas>
  );
}

function Environment() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const pm = new PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    invalidate();
    return () => {
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene, invalidate]);
  return null;
}

function Floor() {
  const show = useUI((s) => s.settings.showGrid);
  const shadows = useUI((s) => s.settings.showShadows);
  const cell = useCssVar('--viewport-grid');
  const section = useCssVar('--viewport-grid-strong');
  return (
    <group>
      {show && (
        <Grid
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, -0.5]}
          args={[4000, 4000]}
          cellSize={50}
          sectionSize={500}
          cellColor={cell}
          sectionColor={section}
          cellThickness={0.6}
          sectionThickness={1}
          fadeDistance={6000}
          fadeStrength={1.5}
          infiniteGrid
        />
      )}
      {shadows && (
        <mesh position={[0, 0, -0.6]} receiveShadow>
          <planeGeometry args={[8000, 8000]} />
          <shadowMaterial opacity={0.22} />
        </mesh>
      )}
    </group>
  );
}

/** Frame the model on first load and whenever the user presses F. */
function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate } = useThree();
  const surface = useResults((s) => s.surface);
  const baseKey = useResults((s) => s.keys.base);
  // Re-frame once per new shape, as soon as its working surface is ready.
  const framedFor = useRef<string | null>(null);
  const frame = (m: MeshData | null) => {
    if (!m || !controls.current) return;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(m.positions, 3));
    g.computeBoundingBox();
    const box = g.boundingBox ?? new Box3();
    const c = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3()).length() || 500;
    const dir = new Vector3(0.75, -1.25, 0.8).normalize();
    const fov = ((camera as PerspectiveCamera).fov * Math.PI) / 180;
    camera.position.copy(c).addScaledVector(dir, (size * 0.5) / Math.sin(fov / 2) * 1.02);
    (camera as PerspectiveCamera).near = size / 200;
    (camera as PerspectiveCamera).far = size * 50;
    camera.updateProjectionMatrix();
    controls.current.target.copy(c);
    controls.current.update();
    invalidate();
  };
  useEffect(() => {
    if (!surface || !baseKey || framedFor.current === baseKey) return;
    framedFor.current = baseKey;
    frame(surface);
  }, [surface, baseKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, [role="slider"]')) return;
      if (e.key === 'f' || e.key === 'F') frame(useResults.getState().surface ?? useResults.getState().base);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} />;
}

// ------------------------------------------------------------------ content

function Content() {
  const step = useUI((s) => s.step);
  const tool = useUI((s) => s.shapeTool);
  const ov = useUI((s) => s.overlays);
  const source = useProject((s) => s.project.shape.source);
  const r = useResults();
  const early = step === 'shape' || step === 'surface';
  return (
    <group>
      {step === 'shape' && r.base && (tool === 'sculpt' ? <SculptLayer base={r.base} /> : <SolidMesh mesh={r.base} />)}
      {step === 'shape' && source === 'skeleton' && tool !== 'sculpt' && <SkeletonEditor3D />}
      {step === 'surface' && r.surface && <SurfaceView mesh={r.surface} wire={ov.wire} method={null} clusters={false} />}
      {!early && r.surface && ov.base && <SurfaceView mesh={r.surface} wire={false} ghost method={r.method} clusters={ov.clusters && step === 'method'} />}
      {!early && r.method && ov.maze && step === 'method' && <MazeLines method={r.method} />}
      {!early && r.method?.overlays.guide && step === 'method' && <GuideLine data={r.method.overlays.guide} />}
      {!early && r.method && ov.parts && <Assembly method={r.method} />}
      {!early && r.method?.assembly.pins && ov.pins && <Pins method={r.method} />}
    </group>
  );
}

function SolidMesh({ mesh }: { mesh: MeshData }) {
  const geo = useMemo(() => meshDataToGeometry(mesh), [mesh]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color="#c9c2b6" roughness={0.62} metalness={0.05} side={DoubleSide} />
    </mesh>
  );
}

function SurfaceView({ mesh, wire, ghost, method, clusters }: { mesh: MeshData; wire: boolean; ghost?: boolean; method: MethodResult | null; clusters: boolean }) {
  const colors = useLayerColors();
  const lineColor = useCssVar('--text-3');
  const geo = useMemo(() => {
    const g = meshDataToGeometry(mesh).toNonIndexed();
    g.computeVertexNormals();
    return g;
  }, [mesh]);
  // Cluster colours of the first layer, as tints of its colour.
  useMemo(() => {
    const fc = clusters ? method?.overlays.clusters?.[0] : undefined;
    if (!fc) {
      geo.deleteAttribute('color');
      return;
    }
    const base = new Color(colors[fc.group % colors.length]);
    const n = fc.faceCluster.length;
    const col = new Float32Array(n * 9);
    const c = new Color();
    for (let f = 0; f < n; f++) {
      const k = fc.faceCluster[f];
      const h = ((k * 0.61803) % 1) * 0.5 + 0.5;
      c.copy(base).multiplyScalar(0.35 + h * 0.75);
      for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], f * 9 + v * 3);
    }
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  }, [geo, clusters, method, colors]);
  const edges = useMemo(() => (wire ? meshDataToGeometry(mesh) : null), [mesh, wire]);
  useEffect(() => () => geo.dispose(), [geo]);
  const hasColor = !!geo.getAttribute('color');
  return (
    <group>
      <mesh geometry={geo} castShadow={!ghost} receiveShadow renderOrder={ghost ? -1 : 0}>
        <meshStandardMaterial
          color={hasColor ? '#ffffff' : ghost ? '#8a857d' : '#bcb6ab'}
          vertexColors={hasColor}
          roughness={0.75}
          side={DoubleSide}
          transparent={ghost && !hasColor}
          opacity={ghost && !hasColor ? 0.22 : 1}
          depthWrite={!ghost || hasColor}
          polygonOffset
          polygonOffsetFactor={2}
          polygonOffsetUnits={2}
        />
      </mesh>
      {edges && (
        <mesh geometry={edges}>
          <meshBasicMaterial color={lineColor} wireframe transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  );
}

function MazeLines({ method }: { method: MethodResult }) {
  const colors = useLayerColors();
  const lines = method.overlays.treeLines ?? [];
  return (
    <group>
      {lines.map((l) => (
        <lineSegments key={l.group} renderOrder={2}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[l.lines, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={colors[l.group % colors.length]} transparent opacity={0.9} depthTest={false} />
        </lineSegments>
      ))}
    </group>
  );
}

/** The guide curve of layers and classic models, drawn through the shape. */
function GuideLine({ data }: { data: Float32Array }) {
  const color = useCssVar('--layer-2');
  return (
    <lineSegments renderOrder={3}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color || '#faaf40'} transparent opacity={0.95} depthTest={false} />
    </lineSegments>
  );
}

// ------------------------------------------------------------------ assembly

function useMaterialFor() {
  const colorBy = useUI((s) => s.settings.colorBy);
  const material = useProject((s) => s.project.material);
  const colors = useLayerColors();
  return useMemo(() => {
    const stock = stockMaterial(material);
    return (group: number) => (colorBy === 'material' ? stock : layerMaterial(colors[group % colors.length]));
  }, [colorBy, material, colors]);
}

function Assembly({ method }: { method: MethodResult }) {
  const A = method.assembly;
  if (A.kind === 'lattice') return <LatticeView method={method} />;
  if (A.kind === 'planar') return <PlanarView method={method} />;
  return <PanelsView method={method} />;
}

const tmpColor = new Color();

function LatticeView({ method }: { method: MethodResult }) {
  const A = method.assembly;
  const colors = useLayerColors();
  const colorBy = useUI((s) => s.settings.colorBy);
  const stockColor = useProject((s) => s.project.material.color);
  const selected = useUI((s) => s.selectedPart);
  const hidden = useUI((s) => s.overlays.hiddenGroups);
  const accent = useCssVar('--accent');
  const data = useMemo(() => {
    const groups = new Map<number, { boxes: Matrix4[]; discs: Matrix4[]; boxPart: number[]; discPart: number[] }>();
    for (const s of A.strips ?? []) {
      const g = groups.get(s.group) ?? { boxes: [], discs: [], boxPart: [], discPart: [] };
      const m = stripMatrices(s, A.stripWidth ?? 8, A.thickness);
      for (const b of m.boxes) {
        g.boxes.push(b);
        g.boxPart.push(s.partIndex);
      }
      for (const d of m.discs) {
        g.discs.push(d);
        g.discPart.push(s.partIndex);
      }
      groups.set(s.group, g);
    }
    return [...groups.entries()];
  }, [A]);
  const selIndex = selected ? method.parts.findIndex((p) => p.id === selected) : -1;
  return (
    <group>
      {data.map(([group, d]) =>
        hidden.includes(group) ? null : (
          <group key={group}>
            <Instanced
              geometryFactory={unitBox}
              matrices={d.boxes}
              parts={d.boxPart}
              color={colorBy === 'material' ? stockColor : colors[group % colors.length]}
              highlight={selIndex}
              highlightColor={accent}
              method={method}
              metal={colorBy === 'material'}
            />
            <Instanced
              geometryFactory={unitDisc}
              matrices={d.discs}
              parts={d.discPart}
              color={colorBy === 'material' ? stockColor : colors[group % colors.length]}
              highlight={selIndex}
              highlightColor={accent}
              method={method}
              metal={colorBy === 'material'}
            />
          </group>
        ),
      )}
    </group>
  );
}

function Instanced({
  geometryFactory,
  matrices,
  parts,
  color,
  highlight,
  highlightColor,
  method,
  metal,
}: {
  geometryFactory: () => BufferGeometry;
  matrices: Matrix4[];
  parts: number[];
  color: string;
  highlight: number;
  highlightColor: string;
  method: MethodResult;
  metal: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((st) => st.invalidate);
  const geo = useMemo(geometryFactory, [geometryFactory]);
  const material = useMemo(() => new MeshStandardMaterial({ color: '#ffffff', roughness: metal ? 0.32 : 0.5, metalness: metal ? 0.85 : 0.12 }), [metal]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    for (let i = 0; i < matrices.length; i++) m.setMatrixAt(i, matrices[i]);
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [matrices, invalidate]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const base = new Color(color);
    const hi = new Color(highlightColor);
    const dim = highlight >= 0;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === highlight) tmpColor.copy(hi);
      else tmpColor.copy(base).multiplyScalar(dim ? 0.55 : 1);
      m.setColorAt(i, tmpColor);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    invalidate();
  }, [parts, color, highlight, highlightColor, invalidate]);
  useEffect(() => () => {
    geo.dispose();
    material.dispose();
  }, [geo, material]);
  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (e.instanceId == null) return null;
    return method.parts[parts[e.instanceId]]?.id ?? null;
  };
  return (
    <instancedMesh
      ref={ref}
      args={[geo, material, matrices.length]}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        useUI.getState().set({ selectedPart: pick(e) });
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        const id = pick(e);
        if (useUI.getState().hoveredPart !== id) useUI.getState().set({ hoveredPart: id });
      }}
      onPointerOut={() => useUI.getState().set({ hoveredPart: null })}
    />
  );
}

/**
 * Flat parts placed in 3D. Parts are merged into one mesh per group (hundreds
 * of bars or ribs stay a handful of draw calls); a triangle → part table keeps
 * picking exact, and the selected part is drawn on top in the accent colour.
 */
function PlanarView({ method }: { method: MethodResult }) {
  const matFor = useMaterialFor();
  const selected = useUI((s) => s.selectedPart);
  const hidden = useUI((s) => s.overlays.hiddenGroups);
  const accent = useCssVar('--accent');
  const built = useMemo(() => {
    const byGroup = new Map<number, { geos: BufferGeometry[]; ids: string[]; triEnd: number[] }>();
    const single = new Map<string, BufferGeometry>();
    for (const p of method.parts) {
      if (!p.planar) continue;
      const g = partExtrusion(p, method.assembly.thickness);
      if (!g) continue;
      g.applyMatrix4(new Matrix4().fromArray(p.planar.matrix));
      const flat = g.index ? g.toNonIndexed() : g;
      if (flat !== g) g.dispose();
      for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
      single.set(p.id, flat);
      if (!byGroup.has(p.group)) byGroup.set(p.group, { geos: [], ids: [], triEnd: [] });
      const G = byGroup.get(p.group)!;
      const prev = G.triEnd.length ? G.triEnd[G.triEnd.length - 1] : 0;
      G.geos.push(flat);
      G.ids.push(p.id);
      G.triEnd.push(prev + flat.getAttribute('position').count / 3);
    }
    const groups = [...byGroup.entries()].map(([group, G]) => ({ group, geo: mergeGeometries(G.geos, false), ids: G.ids, triEnd: G.triEnd }));
    return { groups, single };
  }, [method]);
  useEffect(
    () => () => {
      built.groups.forEach((g) => g.geo?.dispose());
      built.single.forEach((g) => g.dispose());
    },
    [built],
  );
  const hi = useMemo(() => new MeshStandardMaterial({ color: accent, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), [accent]);
  const partAt = (G: (typeof built.groups)[number], faceIndex: number | undefined) => {
    if (faceIndex == null) return null;
    let lo = 0, hi2 = G.triEnd.length - 1;
    while (lo < hi2) {
      const mid = (lo + hi2) >> 1;
      if (G.triEnd[mid] > faceIndex) hi2 = mid;
      else lo = mid + 1;
    }
    return G.ids[lo] ?? null;
  };
  const sel = selected ? built.single.get(selected) : undefined;
  return (
    <group>
      {built.groups.map((G) =>
        hidden.includes(G.group) || !G.geo ? null : (
          <mesh
            key={G.group}
            geometry={G.geo}
            material={matFor(G.group)}
            castShadow
            receiveShadow
            onClick={(e) => {
              e.stopPropagation();
              useUI.getState().set({ selectedPart: partAt(G, e.faceIndex ?? undefined) });
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
              const id = partAt(G, e.faceIndex ?? undefined);
              if (useUI.getState().hoveredPart !== id) useUI.getState().set({ hoveredPart: id });
            }}
            onPointerOut={() => useUI.getState().set({ hoveredPart: null })}
          />
        ),
      )}
      {sel && <mesh geometry={sel} material={hi} />}
      {method.assembly.spacers && <Spacers spacers={method.assembly.spacers} />}
    </group>
  );
}

/** Printed layer spacers, instanced along each rod. */
function Spacers({ spacers }: { spacers: NonNullable<MethodResult['assembly']['spacers']> }) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((st) => st.invalidate);
  const geo = useMemo(() => spacerGeometry(spacers.shape, spacers.size), [spacers.shape, spacers.size]);
  const mats = useMemo(() => {
    const out: Matrix4[] = [];
    const d = spacers.data;
    const a = new Vector3(), b = new Vector3(), dir = new Vector3(), up = new Vector3(0, 0, 1);
    const q = new Quaternion();
    for (let i = 0; i + 5 < d.length; i += 6) {
      a.set(d[i], d[i + 1], d[i + 2]);
      b.set(d[i + 3], d[i + 4], d[i + 5]);
      dir.subVectors(b, a);
      const len = dir.length();
      if (len < 1e-6) continue;
      q.setFromUnitVectors(up, dir.normalize());
      out.push(new Matrix4().compose(a.clone(), q.clone(), new Vector3(1, 1, len)));
    }
    return out;
  }, [spacers.data]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    mats.forEach((x, i) => m.setMatrixAt(i, x));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [mats, invalidate]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, mats.length]} castShadow>
      <meshStandardMaterial color="#faaf40" roughness={0.55} metalness={0.05} />
    </instancedMesh>
  );
}

function PanelsView({ method }: { method: MethodResult }) {
  const p = method.assembly.panels;
  const colors = useLayerColors();
  const colorBy = useUI((s) => s.settings.colorBy);
  const stock = useProject((s) => s.project.material.color);
  const selected = useUI((s) => s.selectedPart);
  const accent = useCssVar('--accent');
  const invalidate = useThree((st) => st.invalidate);
  const geo = useMemo(() => (p ? panelsGeometry(p, method.assembly.thickness) : null), [p, method.assembly.thickness]);
  useEffect(() => {
    if (!geo || !p) return;
    const nt = p.island.length;
    const col = new Float32Array(geo.getAttribute('position').count * 3);
    const c = new Color();
    const selIsland = selected ? method.parts.findIndex((x) => x.id === selected) : -1;
    for (let f = 0; f < nt; f++) {
      const isl = p.island[f];
      if (isl === selIsland) c.set(accent);
      else {
        c.set(colorBy === 'material' ? stock : colors[0]);
        c.multiplyScalar(0.6 + ((isl * 0.37) % 1) * 0.5);
      }
      for (let v = 0; v < 24; v++) col.set([c.r, c.g, c.b], (f * 24 + v) * 3);
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
    invalidate();
  }, [geo, p, colors, colorBy, stock, selected, accent, method.parts, invalidate]);
  useEffect(() => () => geo?.dispose(), [geo]);
  if (!geo || !p) return null;
  const islandOf = (e: ThreeEvent<MouseEvent | PointerEvent>) => {
    const f = e.faceIndex != null ? Math.floor(e.faceIndex / 8) : -1;
    return f >= 0 ? method.parts[p.island[f]]?.id ?? null : null;
  };
  return (
    <mesh
      geometry={geo}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        useUI.getState().set({ selectedPart: islandOf(e) });
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        const id = islandOf(e);
        if (useUI.getState().hoveredPart !== id) useUI.getState().set({ hoveredPart: id });
      }}
      onPointerOut={() => useUI.getState().set({ hoveredPart: null })}
    >
      <meshStandardMaterial vertexColors roughness={0.7} side={DoubleSide} flatShading />
    </mesh>
  );
}

function Pins({ method }: { method: MethodResult }) {
  const ref = useRef<InstancedMesh>(null);
  const pins = method.assembly.pins!;
  const mats = useMemo(() => pinMatrices(pins), [pins]);
  const geo = useMemo(unitPin, []);
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    mats.forEach((x, i) => m.setMatrixAt(i, x));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [mats, invalidate]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, mats.length]} castShadow>
      <meshStandardMaterial color="#d8d4cc" metalness={0.8} roughness={0.3} />
    </instancedMesh>
  );
}

