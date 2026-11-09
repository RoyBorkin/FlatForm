/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/**
 * Sculpting on the base mesh. Strokes edit a working copy in place for
 * instant feedback; releasing the pointer commits the result as a new mesh
 * asset (so undo restores the previous one).
 */
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, Plane, Vector3, Raycaster, Vector2, type Camera, type WebGLRenderer } from 'three';
import type { MeshData } from '@/core/types';
import { useUI } from '@/state/ui';
import { useProject } from '@/state/project';
import { buildTopology, compact } from '@/core/mesh/mesh';
import { newAssetId, putAsset } from '@/state/assets';
import { uploadAsset } from '@/state/engine';
import { useCssVar } from './useCssVar';

interface Stroke {
  grab?: { idx: number[]; w: number[]; start: Float32Array; plane: Plane; from: Vector3 };
  erased: Set<number>;
}

export function SculptLayer({ base }: { base: MeshData }) {
  const brush = useUI((s) => s.brush);
  const accent = useCssVar('--accent');
  const { controls, camera, gl, invalidate } = useThree() as unknown as { controls: { enabled: boolean } | null; camera: Camera; gl: WebGLRenderer; invalidate: () => void };
  const meshRef = useRef<Mesh>(null);
  const cursor = useRef<Mesh>(null);
  const stroke = useRef<Stroke | null>(null);
  const work = useMemo(() => {
    const pos = base.positions.slice();
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setIndex(new BufferAttribute(base.indices.slice(), 1));
    g.computeVertexNormals();
    const topo = buildTopology(base);
    return { g, pos, nbr: topo.vertexNeighbors };
  }, [base]);
  useEffect(() => () => work.g.dispose(), [work]);

  // Spatial hash of vertices, rebuilt at the start of each stroke.
  const hash = useRef<{ cell: number; map: Map<string, number[]> } | null>(null);
  const buildHash = () => {
    const cell = Math.max(1, brush.radius);
    const map = new Map<string, number[]>();
    const p = work.pos;
    for (let i = 0; i < p.length / 3; i++) {
      const k = `${Math.floor(p[i * 3] / cell)},${Math.floor(p[i * 3 + 1] / cell)},${Math.floor(p[i * 3 + 2] / cell)}`;
      let a = map.get(k);
      if (!a) map.set(k, (a = []));
      a.push(i);
    }
    hash.current = { cell, map };
  };
  const near = (c: Vector3, r: number) => {
    const h = hash.current!;
    const out: number[] = [];
    const x0 = Math.floor((c.x - r) / h.cell), x1 = Math.floor((c.x + r) / h.cell);
    const y0 = Math.floor((c.y - r) / h.cell), y1 = Math.floor((c.y + r) / h.cell);
    const z0 = Math.floor((c.z - r) / h.cell), z1 = Math.floor((c.z + r) / h.cell);
    const p = work.pos;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          for (const i of h.map.get(`${x},${y},${z}`) ?? []) {
            const d = Math.hypot(p[i * 3] - c.x, p[i * 3 + 1] - c.y, p[i * 3 + 2] - c.z);
            if (d < r) out.push(i);
          }
    return out;
  };

  const apply = (hit: Vector3, n: Vector3, invert: boolean) => {
    const r = brush.radius;
    const p = work.pos;
    const normals = work.g.getAttribute('normal') as BufferAttribute;
    const centres = brush.symmetryX ? [hit, new Vector3(-hit.x, hit.y, hit.z)] : [hit];
    const normalsAt = brush.symmetryX ? [n, new Vector3(-n.x, n.y, n.z)] : [n];
    centres.forEach((c, ci) => {
      const nn = normalsAt[ci];
      const idx = near(c, r);
      const sign = invert ? -1 : 1;
      const k = brush.strength;
      for (const i of idx) {
        const d = Math.hypot(p[i * 3] - c.x, p[i * 3 + 1] - c.y, p[i * 3 + 2] - c.z) / r;
        const w = (1 - d * d) ** 2 * k;
        switch (brush.kind) {
          case 'draw':
            p[i * 3] += nn.x * w * r * 0.06 * sign;
            p[i * 3 + 1] += nn.y * w * r * 0.06 * sign;
            p[i * 3 + 2] += nn.z * w * r * 0.06 * sign;
            break;
          case 'inflate':
            p[i * 3] += normals.getX(i) * w * r * 0.05 * sign;
            p[i * 3 + 1] += normals.getY(i) * w * r * 0.05 * sign;
            p[i * 3 + 2] += normals.getZ(i) * w * r * 0.05 * sign;
            break;
          case 'smooth': {
            const nb = work.nbr[i];
            if (!nb.length) break;
            let ax = 0, ay = 0, az = 0;
            for (const j of nb) {
              ax += p[j * 3];
              ay += p[j * 3 + 1];
              az += p[j * 3 + 2];
            }
            const t = Math.min(1, w * 0.8);
            p[i * 3] += (ax / nb.length - p[i * 3]) * t;
            p[i * 3 + 1] += (ay / nb.length - p[i * 3 + 1]) * t;
            p[i * 3 + 2] += (az / nb.length - p[i * 3 + 2]) * t;
            break;
          }
          case 'flatten': {
            const dd = (p[i * 3] - c.x) * nn.x + (p[i * 3 + 1] - c.y) * nn.y + (p[i * 3 + 2] - c.z) * nn.z;
            p[i * 3] -= nn.x * dd * w * 0.5;
            p[i * 3 + 1] -= nn.y * dd * w * 0.5;
            p[i * 3 + 2] -= nn.z * dd * w * 0.5;
            break;
          }
          case 'pinch':
            p[i * 3] += (c.x - p[i * 3]) * w * 0.15 * sign;
            p[i * 3 + 1] += (c.y - p[i * 3 + 1]) * w * 0.15 * sign;
            p[i * 3 + 2] += (c.z - p[i * 3 + 2]) * w * 0.15 * sign;
            break;
        }
      }
    });
    (work.g.getAttribute('position') as BufferAttribute).needsUpdate = true;
    work.g.computeVertexNormals();
    invalidate();
  };

  const erase = (hit: Vector3) => {
    const s = stroke.current!;
    const r = brush.radius;
    const idx = work.g.getIndex()!;
    const p = work.pos;
    const centres = brush.symmetryX ? [hit, new Vector3(-hit.x, hit.y, hit.z)] : [hit];
    for (let t = 0; t < idx.count / 3; t++) {
      if (s.erased.has(t)) continue;
      const a = idx.getX(t * 3), b = idx.getX(t * 3 + 1), c = idx.getX(t * 3 + 2);
      const cx = (p[a * 3] + p[b * 3] + p[c * 3]) / 3, cy = (p[a * 3 + 1] + p[b * 3 + 1] + p[c * 3 + 1]) / 3, cz = (p[a * 3 + 2] + p[b * 3 + 2] + p[c * 3 + 2]) / 3;
      for (const ce of centres) if (Math.hypot(cx - ce.x, cy - ce.y, cz - ce.z) < r) s.erased.add(t);
    }
    // Hide erased triangles by collapsing them visually.
    const arr = idx.array as Uint32Array;
    for (const t of s.erased) arr[t * 3 + 1] = arr[t * 3 + 2] = arr[t * 3];
    idx.needsUpdate = true;
    invalidate();
  };

  const commit = async () => {
    const idx = work.g.getIndex()!.array as Uint32Array;
    const keep: number[] = [];
    for (let t = 0; t < idx.length; t += 3) if (!(idx[t] === idx[t + 1] && idx[t] === idx[t + 2])) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    const mesh = compact({ positions: work.pos.slice(), indices: Uint32Array.from(keep) });
    const id = newAssetId();
    await putAsset(id, mesh);
    await uploadAsset(id, mesh);
    useProject.getState().update((pp) => {
      pp.shape.source = 'mesh';
      pp.shape.meshAsset = id;
      pp.shape.importUnits = 'mm';
      if (!pp.shape.meshName) pp.shape.meshName = 'Sculpted shape';
    });
  };

  const down = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (controls) controls.enabled = false;
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    buildHash();
    stroke.current = { erased: new Set() };
    const n = e.face?.normal.clone().transformDirection(e.object.matrixWorld) ?? new Vector3(0, 0, 1);
    if (brush.kind === 'grab') {
      const idx = near(e.point, brush.radius);
      const w = idx.map((i) => {
        const d = Math.hypot(work.pos[i * 3] - e.point.x, work.pos[i * 3 + 1] - e.point.y, work.pos[i * 3 + 2] - e.point.z) / brush.radius;
        return (1 - d * d) ** 2;
      });
      const viewDir = new Vector3();
      camera.getWorldDirection(viewDir);
      stroke.current.grab = { idx, w, start: work.pos.slice(), plane: new Plane().setFromNormalAndCoplanarPoint(viewDir, e.point), from: e.point.clone() };
    } else if (brush.kind === 'erase') erase(e.point);
    else apply(e.point, n, e.altKey);
    window.addEventListener('pointerup', up, { once: true });
  };

  const ray = useMemo(() => new Raycaster(), []);
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (cursor.current) {
      cursor.current.position.copy(e.point);
      const n = e.face?.normal.clone().transformDirection(e.object.matrixWorld);
      if (n) cursor.current.lookAt(e.point.clone().add(n));
      cursor.current.visible = true;
      invalidate();
    }
    const s = stroke.current;
    if (!s) return;
    e.stopPropagation();
    if (s.grab) {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new Vector2(((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1, -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const to = new Vector3();
      if (!ray.ray.intersectPlane(s.grab.plane, to)) return;
      const d = to.sub(s.grab.from);
      const p = work.pos;
      s.grab.idx.forEach((i, k) => {
        const w = s.grab!.w[k] * brush.strength * 1.6;
        p[i * 3] = s.grab!.start[i * 3] + d.x * w;
        p[i * 3 + 1] = s.grab!.start[i * 3 + 1] + d.y * w;
        p[i * 3 + 2] = s.grab!.start[i * 3 + 2] + d.z * w;
      });
      (work.g.getAttribute('position') as BufferAttribute).needsUpdate = true;
      work.g.computeVertexNormals();
      invalidate();
    } else if (brush.kind === 'erase') erase(e.point);
    else {
      const n = e.face?.normal.clone().transformDirection(e.object.matrixWorld) ?? new Vector3(0, 0, 1);
      apply(e.point, n, e.altKey);
    }
  };

  const up = () => {
    if (controls) controls.enabled = true;
    if (stroke.current) {
      stroke.current = null;
      commit();
    }
  };

  return (
    <group>
      <mesh ref={meshRef} geometry={work.g} castShadow receiveShadow onPointerDown={down} onPointerMove={move} onPointerOut={() => cursor.current && (cursor.current.visible = false)}>
        <meshStandardMaterial color="#c9c2b6" roughness={0.6} side={DoubleSide} />
      </mesh>
      <mesh ref={cursor} visible={false} renderOrder={10}>
        <ringGeometry args={[brush.radius * 0.94, brush.radius, 48]} />
        <meshBasicMaterial color={accent} depthTest={false} transparent opacity={0.9} side={DoubleSide} />
      </mesh>
    </group>
  );
}
