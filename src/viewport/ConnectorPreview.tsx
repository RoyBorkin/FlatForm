import { Canvas } from '@react-three/fiber';
import { OrbitControls, Bounds, useBounds } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { useProject } from '@/state/project';
import { useResults } from '@/state/results';
import { geometry } from '@/state/engine';
import type { ConnectorPart } from '@/core/connectors/connectors';
import { meshDataToGeometry } from './geometry';
import { useCssVar } from './useCssVar';

/** Live preview of the printed connector, built by Manifold in the worker. */
export default function ConnectorPreview() {
  const j = useProject((s) => s.project.joinery);
  const t = useProject((s) => s.project.material.thickness);
  const method = useProject((s) => s.project.method);
  const layers = useProject((s) => s.project.lattice.layers.filter((l) => l.enabled).length);
  const stripWidth = useProject((s) => s.project.lattice.stripWidth);
  const data = useResults((s) => s.method?.connectorData);
  const [parts, setParts] = useState<ConnectorPart[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const bg = useCssVar('--bg-sunken');
  const accent = useCssVar('--layer-0');
  useEffect(() => {
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const r = await geometry().connectors(
          { kind: j.printed.connector, printed: j.printed, thickness: t, layers: method === 'lattice' ? layers : 1, stripWidth },
          data ? { ...data, hubs: data.hubs?.slice(0, 1), bracketAngles: data.bracketAngles?.slice(0, 50) } : undefined,
          1,
        );
        if (alive) {
          setParts(r);
          setErr(null);
        }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [j.printed, t, method, layers, stripWidth, data]);
  const geos = useMemo(() => (parts ?? []).slice(0, 2).map((p) => meshDataToGeometry(p.mesh)), [parts]);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  if (err) return <div className="connector-preview connector-preview--loading">Preview failed: {err}</div>;
  const total = parts?.reduce((s, p) => s + p.count, 0) ?? 0;
  return (
    <figure className="connector-preview">
      <div className="connector-preview__canvas">
        <Canvas frameloop="demand" camera={{ position: [30, -40, 30], fov: 30, up: [0, 0, 1] }} dpr={[1, 2]}>
          <color attach="background" args={[bg]} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[20, -30, 40]} intensity={2} />
          <Bounds fit clip observe margin={1.3}>
            <Refit token={geos} />
            {geos.map((g, i) => (
              <mesh key={i} geometry={g} position={[i * (g.boundingSphere?.radius ?? 5) * 2.4, 0, 0]}>
                <meshStandardMaterial color={accent} roughness={0.55} />
              </mesh>
            ))}
          </Bounds>
          <OrbitControls makeDefault enablePan={false} />
        </Canvas>
      </div>
      <figcaption className="muted small">
        {parts ? `${parts.length > 1 && parts[0].count === 1 ? `${parts.length} unique pieces` : `${total} to print`} · drag to rotate` : 'Building preview…'}
      </figcaption>
    </figure>
  );
}

/** Re-frame whenever the connector geometry changes. */
function Refit({ token }: { token: unknown }) {
  const api = useBounds();
  useEffect(() => {
    const id = requestAnimationFrame(() => api.refresh().clip().fit());
    return () => cancelAnimationFrame(id);
  }, [token, api]);
  return null;
}
