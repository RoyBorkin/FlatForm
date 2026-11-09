import { TransformControls } from '@react-three/drei';
import { useMemo, useRef, useState } from 'react';
import { Mesh } from 'three';
import { useProject } from '@/state/project';
import { useUI } from '@/state/ui';
import { useCssVar } from './useCssVar';

/** Skeleton nodes and lines over the body; click a node, drag the gizmo to move it. */
export function SkeletonEditor3D() {
  const sk = useProject((s) => s.project.shape.skeleton);
  const update = useProject((s) => s.update);
  const sel = useUI((s) => s.selectedNode);
  const accent = useCssVar('--accent');
  const text = useCssVar('--text');
  const line = useCssVar('--layer-0');
  const [target, setTarget] = useState<Mesh | null>(null);
  const dragging = useRef(false);
  const size = useMemo(() => {
    let max = 0;
    for (const n of sk.nodes) max = Math.max(max, Math.abs(n.p[0]), Math.abs(n.p[1]), Math.abs(n.p[2]));
    return Math.max(4, max * 0.018);
  }, [sk.nodes]);
  const byId = new Map(sk.nodes.map((n) => [n.id, n]));
  const positions = useMemo(() => {
    const arr: number[] = [];
    for (const e of sk.edges) {
      const a = byId.get(e.a), b = byId.get(e.b);
      if (a && b) arr.push(...a.p, ...b.p);
    }
    return new Float32Array(arr);
  }, [sk]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      <lineSegments renderOrder={5}>
        <bufferGeometry key={positions.length}>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={line} depthTest={false} transparent opacity={0.95} />
      </lineSegments>
      {sk.nodes.map((n) => (
        <mesh
          key={n.id}
          position={n.p}
          renderOrder={6}
          ref={sel === n.id ? setTarget : undefined}
          onClick={(e) => {
            e.stopPropagation();
            if (!dragging.current) useUI.getState().set({ selectedNode: n.id });
          }}
        >
          <sphereGeometry args={[sel === n.id ? size * 1.35 : size, 20, 14]} />
          <meshBasicMaterial color={sel === n.id ? accent : text} depthTest={false} transparent opacity={0.95} />
        </mesh>
      ))}
      {sel != null && target && (
        <TransformControls
          object={target}
          mode="translate"
          size={0.8}
          onMouseDown={() => (dragging.current = true)}
          onMouseUp={() => {
            const p = target.position;
            update((pp) => {
              const node = pp.shape.skeleton.nodes.find((x) => x.id === sel);
              if (node) node.p = [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.z * 10) / 10];
            });
            setTimeout(() => (dragging.current = false), 0);
          }}
        />
      )}
    </group>
  );
}
