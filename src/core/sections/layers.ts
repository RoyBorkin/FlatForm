/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Layers: parallel or fanned sections with gaps between them, held on rods
 * and spaced by 3D-printed spacers. The stacking direction is free
 * (azimuth / elevation), or the layers follow a guide curve and fan out
 * around it.
 */
import type { MeshData, MethodResult, Part2D, Path2, Polyline2, Circle2 } from '../types';
import type { JoineryParams, LayersParams, MaterialParams } from '../params';
import { projectRange, slicePlane, type PlaneFrame } from '../mesh/slice';
import { sectionRegion } from '../slices/section';
import { circlePath, clipOpenPaths, difference, intersection, offsetPolygons, pointInRegion, strokePaths, union } from '../polygon/polygon';
import { pinHoleDiameter } from '../joinery/holes';
import { stackTabs } from '../joinery/bendTabs';
import { dot3, type V2, type V3 } from '../math/vec';
import { curvePolyline, frameFromNormal, guideSegments, sampleCurve } from './curve';
import { sectionParts, type IdCounter } from './parts';

export function layerNormal(azimuthDeg: number, elevationDeg: number): V3 {
  const az = (azimuthDeg * Math.PI) / 180, el = (elevationDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
}

interface Layer {
  frame: PlaneFrame;
  d: number;
  /** Filled section (rods are placed in this). */
  solid: Path2[];
  region: Path2[];
  /** Spine point (curve mode) in 2D. */
  spine?: V2;
  origin: V3;
}

function hollowOut(solid: Path2[], hollow: boolean, wall: number): Path2[] {
  if (!hollow || !solid.length) return solid;
  const inner = offsetPolygons(solid, -wall);
  return inner.length ? difference(solid, inner) : solid;
}

const to3 = (f: PlaneFrame, d: number, p: V2): V3 => [
  f.u[0] * p[0] + f.v[0] * p[1] + f.n[0] * d,
  f.u[1] * p[0] + f.v[1] * p[1] + f.n[1] * d,
  f.u[2] * p[0] + f.v[2] * p[1] + f.n[2] * d,
];

export function buildLayers(surface: MeshData, P: LayersParams, joinery: JoineryParams, material: MaterialParams, onProgress?: (f: number, s: string) => void): MethodResult {
  const warnings: string[] = [];
  const t = material.thickness;
  const pitch = Math.max(t, P.pitch);
  const gap = pitch - t;
  const layers: Layer[] = [];
  const hollow = P.hollow;

  if (P.mode === 'direction') {
    const f = frameFromNormal(layerNormal(P.azimuth, P.elevation), Math.abs(P.elevation) > 80 ? [1, 0, 0] : [0, 0, 1]);
    const [lo, hi] = projectRange(surface, f.n);
    const count = Math.floor((hi - lo) / pitch);
    if (count < 1) return { parts: [], assembly: { kind: 'planar', thickness: t }, overlays: {}, stats: {}, warnings: ['The shape is thinner than one layer.'] };
    if (count > 400) warnings.push(`${count} layers is a lot of cutting. Increase the spacing.`);
    const first = lo + (hi - lo - (count - 1) * pitch) / 2;
    for (let i = 0; i < count; i++) {
      const d = first + i * pitch;
      const s = slicePlane(surface, f, d);
      const solid = sectionRegion(s.closed, s.open, P.wall, false);
      layers.push({ frame: f, d, solid, region: hollowOut(solid, hollow, P.wall), origin: [0, 0, 0] });
      if (i % 10 === 0) onProgress?.((0.5 * i) / count, 'Slicing');
    }
  } else {
    const { samples, length } = sampleCurve(surface, P.curve, { spacing: pitch });
    if (samples.length < 2) return { parts: [], assembly: { kind: 'planar', thickness: t }, overlays: {}, stats: {}, warnings: ['The guide curve is shorter than two layers.'] };
    samples.forEach((smp, i) => {
      const f = frameFromNormal(smp.t, [0, 0, 1]);
      const d = dot3(f.n, smp.p);
      const s = slicePlane(surface, f, d);
      let solid = sectionRegion(s.closed, s.open, P.wall, false);
      const spine: V2 = [dot3(f.u, smp.p), dot3(f.v, smp.p)];
      // Neighbouring planes meet at pitch / bend angle from the curve; keep each layer inside that radius.
      const tn = (j: number) => samples[Math.max(0, Math.min(samples.length - 1, j))].t;
      const bend = Math.max(Math.acos(Math.min(1, dot3(tn(i - 1), smp.t))), Math.acos(Math.min(1, dot3(tn(i + 1), smp.t))));
      if (bend > 1e-3) {
        const R = (pitch / bend) * 0.95;
        solid = intersection(solid, [circlePath(spine[0], spine[1], R, 96)]);
      }
      layers.push({ frame: f, d, solid, region: hollowOut(solid, hollow, P.wall), spine, origin: smp.p });
      if (i % 10 === 0) onProgress?.((0.5 * i) / samples.length, 'Slicing');
    });
    if (length / pitch > 400) warnings.push('That many layers is a lot of cutting. Increase the spacing.');
  }

  // Rods: through every layer (direction mode) or along the spine (curve mode).
  const holeD = Math.max(0.5, pinHoleDiameter(joinery));
  const rodPoints: V2[] = [];
  if (P.rods > 0) {
    if (P.mode === 'direction') {
      // Rods go through the longest unbroken run of layers they can; they need not pass through all of them.
      const clear = P.spacer.enabled ? P.spacer.size / 2 + 1 : holeD / 2 + Math.max(2, holeD);
      const safe = layers.map((l) => (l.solid.length ? offsetPolygons(l.solid, -clear) : []));
      const all = safe.flat();
      if (all.length) {
        const xs = all.flat().map((q) => q[0]), ys = all.flat().map((q) => q[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const cands: { p: V2; run: number }[] = [];
        const N = 32;
        for (let i = 0; i <= N; i++)
          for (let j = 0; j <= N; j++) {
            const q: V2 = [minX + ((maxX - minX) * i) / N, minY + ((maxY - minY) * j) / N];
            let run = 0, best = 0;
            for (const sv of safe) {
              run = sv.length && pointInRegion(q, sv) ? run + 1 : 0;
              best = Math.max(best, run);
            }
            if (best >= 2) cands.push({ p: q, run: best });
          }
        cands.sort((x, y) => y.run - x.run);
        const minRun = Math.max(2, Math.ceil(layers.length * 0.3));
        const gapMin = Math.max(holeD * 3, P.spacer.size * 1.5, Math.hypot(maxX - minX, maxY - minY) * 0.12);
        for (const c of cands) {
          if (rodPoints.length >= P.rods || c.run < minRun) break;
          if (rodPoints.every((q) => Math.hypot(q[0] - c.p[0], q[1] - c.p[1]) >= gapMin)) rodPoints.push(c.p);
        }
      }
      if (!rodPoints.length) warnings.push('No spot runs through enough layers for a rod. Change the direction, make the walls thicker or turn hollow off.');
    }
  }
  // Hollow layers keep a hub around each rod, tied to the wall by spokes.
  const hubR = Math.max(P.spacer.enabled ? P.spacer.size / 2 + 1.5 : 0, holeD * 1.6, holeD / 2 + 3);
  if (hollow && P.rods > 0)
    for (const l of layers) {
      const pts = (P.mode === 'curve' && l.spine ? [l.spine] : rodPoints).filter((p) => pointInRegion(p, l.solid));
      if (!pts.length) continue;
      const spokeW = Math.max(holeD * 2, Math.min(P.wall, hubR * 1.2));
      const add: Path2[] = [];
      for (const p of pts) {
        add.push(circlePath(p[0], p[1], hubR, 40));
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as V2[])
          add.push(...strokePaths([[p, [p[0] + dx * 1e4, p[1] + dy * 1e4]]], spokeW / 2, 'round', 'butt'));
      }
      l.region = union([...l.region, ...intersection(union(add), l.solid)]);
    }
  const holesOf = (l: Layer): Circle2[] => {
    if (P.rods <= 0) return [];
    const pts = P.mode === 'curve' && l.spine ? [l.spine] : rodPoints;
    return pts.filter((p) => pointInRegion(p, l.region) && pointInRegion(p, l.solid)).map((p, j) => ({ x: p[0], y: p[1], r: holeD / 2, label: `R${j + 1}` }));
  };

  // Spacers between neighbouring layers, at every rod both layers carry.
  const spacerData: number[] = [];
  const lengths = new Map<number, number>();
  const spacerOn = P.spacer.enabled && P.rods > 0 && gap > 0.3;
  if (P.spacer.enabled && P.rods > 0 && gap <= 0.3) warnings.push('The layers touch (spacing = sheet thickness), so no spacers are needed.');
  const holeSets = layers.map(holesOf);
  if (spacerOn)
    for (let i = 0; i + 1 < layers.length; i++) {
      const a = layers[i], b = layers[i + 1];
      for (const h of holeSets[i]) {
        const pa = to3(a.frame, a.d + t / 2, [h.x, h.y]);
        // Matching hole in the next layer: same 2D point (direction) or its spine (curve).
        const hb = P.mode === 'curve' ? holeSets[i + 1][0] : holeSets[i + 1].find((q) => Math.hypot(q.x - h.x, q.y - h.y) < 1e-3);
        if (!hb) continue;
        const pb = to3(b.frame, b.d - t / 2, [hb.x, hb.y]);
        const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
        if (len < 0.3) continue;
        spacerData.push(...pa, ...pb);
        const key = Math.round(len * 10) / 10;
        lengths.set(key, (lengths.get(key) ?? 0) + 1);
      }
    }

  // Bend tabs bridge the gap between parallel layers (direction mode only: the layers must share a frame).
  const tabScores: Polyline2[][] = layers.map(() => []);
  let tabs = 0;
  if (joinery.kind === 'bendtabs') {
    if (P.mode === 'direction') {
      const res = stackTabs(
        layers.map((l) => l.region),
        t,
        gap,
        joinery.bendtabs,
      );
      res.features.forEach((F, k) => {
        if (F.add.length) layers[k].region = union([...layers[k].region, ...F.add]);
        if (F.sub.length) layers[k].region = difference(layers[k].region, F.sub);
        tabScores[k].push(...F.score);
      });
      tabs = res.count;
      if (gap > t * 8) warnings.push('The gap between layers is wide for bend tabs; long tabs are floppy. Reduce the spacing or use spacers.');
    } else warnings.push('Bend tabs need parallel layers. Along a curve, use rods and spacers.');
  }
  onProgress?.(0.6, 'Building layers');
  const parts: Part2D[] = [];
  const ids: IdCounter = new Map();
  layers.forEach((l, i) => {
    if (!l.region.length) return;
    const engrave: Polyline2[] = [];
    const next = layers[i + 1];
    if (P.registration && next && next.frame === l.frame && next.region.length)
      for (const line of clipOpenPaths(
        next.region.map((p) => [...p, p[0]]),
        l.region,
      ))
        engrave.push({ pts: line, kind: 'registration' });
    if (P.registration && spacerOn)
      for (const h of holeSets[i]) {
        const r = P.spacer.size / 2;
        engrave.push({ pts: [...circlePath(h.x, h.y, r, 24), circlePath(h.x, h.y, r, 24)[0]], kind: 'registration' });
      }
    parts.push(
      ...sectionParts(
        {
          frame: l.frame,
          d: l.d,
          thickness: t,
          region: l.region,
          group: 0,
          groupName: 'Layers',
          label: String(i + 1),
          holes: holeSets[i],
          engrave,
          score: tabScores[i],
          labelParts: P.labelParts,
          textHeight: P.textHeight,
          meta: { layer: i + 1 },
        },
        ids,
      ),
    );
  });
  const spacerList = [...lengths.entries()].sort((a, b) => a[0] - b[0]).map(([length, count]) => ({ length, count }));
  if (spacerList.length > 12) warnings.push(`The spacers come in ${spacerList.length} lengths. A gentler curve or a straight direction keeps them uniform.`);
  return {
    parts,
    assembly: {
      kind: 'planar',
      thickness: t,
      spacers: spacerData.length ? { data: new Float32Array(spacerData), size: P.spacer.size, shape: P.spacer.shape } : undefined,
    },
    overlays: P.mode === 'curve' ? { guide: guideSegments(curvePolyline(surface, P.curve, 120)) } : {},
    stats: { layers: parts.length ? layers.filter((l) => l.region.length).length : 0, pitch, gap: Math.round(gap * 10) / 10, rods: P.mode === 'curve' ? (P.rods > 0 ? 1 : 0) : rodPoints.length, spacers: spacerData.length / 6, tabs },
    warnings,
    connectorData: {
      pinCount: P.mode === 'curve' ? 0 : rodPoints.length,
      gripLength: (layers.length - 1) * pitch + t,
      spacers: spacerList,
      spacerShape: P.spacer.shape,
      spacerSize: P.spacer.size,
      spacerBore: holeD,
      collars: joinery.kind === 'crossing' ? { bore: holeD, count: parts.reduce((n, q) => n + q.holes.length, 0) * 2 } : undefined,
    },
  };
}
