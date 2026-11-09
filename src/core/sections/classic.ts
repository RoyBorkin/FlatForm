/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Classic laser-cut 3D models: flat profiles that slot into each other.
 *  - grid: two crossing families of ribs (any of three planes, any rotation),
 *  - revolve: profiles fanned around the vertical axis, held by rings,
 *  - curve: ribs standing square to a guide curve, threaded on a spine.
 */
import type { MeshData, MethodResult, Part2D, Path2 } from '../types';
import type { ClassicParams, JoineryParams, MaterialParams } from '../params';
import { AngleCounter } from '../joinery/seams';
import { bbox } from '../mesh/mesh';
import { projectRange } from '../mesh/slice';
import { circlePath, difference, intersection, offsetPolygons } from '../polygon/polygon';
import { dot3, type V3 } from '../math/vec';
import { curvePolyline, frameFromNormal, guideSegments, planeNormalOf, sampleCurve } from './curve';
import { finishSection, interlock, makeSection, type Section } from './interlock';
import { sectionParts, type IdCounter } from './parts';

const rotZ = (v: V3, a: number, axis: V3): V3 => {
  // Rodrigues rotation of v about a unit axis.
  const c = Math.cos(a), s = Math.sin(a);
  const d = dot3(axis, v);
  const cr: V3 = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]];
  return [v[0] * c + cr[0] * s + axis[0] * d * (1 - c), v[1] * c + cr[1] * s + axis[1] * d * (1 - c), v[2] * c + cr[2] * s + axis[2] * d * (1 - c)];
};

function evenly(lo: number, hi: number, inset: number, count: number): number[] {
  const span = hi - lo;
  const a = lo + span * inset, b = hi - span * inset;
  return Array.from({ length: Math.max(1, count) }, (_, i) => a + ((i + 0.5) * (b - a)) / Math.max(1, count));
}

const BIG = 1e5;

export function buildClassic(surface: MeshData, P: ClassicParams, material: MaterialParams, onProgress?: (f: number, s: string) => void, J?: JoineryParams): MethodResult {
  const warnings: string[] = [];
  const t = material.thickness;
  const slotW = t + P.slotClearance;
  const band = Math.max(P.frame, t * 2);
  const families: { name: string; sections: Section[]; hollow: boolean }[] = [];
  let joints = 0;
  const clipAngles = new AngleCounter(2);
  /** Interlock two sections and count a crossing clip for each end of every joint. */
  const join = (a: Section, b: Section, prefer: 0 | 1 | -1) => {
    const n = interlock(a, b, slotW, P.slotLeadIn, tx, prefer);
    if (n) clipAngles.add((Math.acos(Math.min(1, Math.abs(dot3(a.frame.n, b.frame.n)))) * 180) / Math.PI, n * 2);
    return n;
  };
  const tx = P.labelParts ? P.textHeight : 0;

  if (P.style === 'grid') {
    const g = P.grid;
    const axis = planeNormalOf(g.plane === 'xy' ? 'xy' : g.plane === 'xz' ? 'xz' : 'yz');
    const [ea, eb]: [V3, V3] = g.plane === 'xy' ? [[1, 0, 0], [0, 1, 0]] : g.plane === 'xz' ? [[1, 0, 0], [0, 0, 1]] : [[0, 1, 0], [0, 0, 1]];
    const rot = (g.rotate * Math.PI) / 180;
    const nA = rotZ(ea, rot, axis), nB = rotZ(eb, rot, axis);
    const fam = (n: V3, count: number, prefix: string, fi: number) => {
      const f = frameFromNormal(n, axis);
      const [lo, hi] = projectRange(surface, n);
      return evenly(lo, hi, g.inset, count).map((d, i) => makeSection(surface, f, d, fi, `${prefix}${i + 1}`, band));
    };
    const A = fam(nA, g.countA, 'A', 0);
    onProgress?.(0.3, 'Ribs');
    const B = fam(nB, g.countB, 'B', 1);
    onProgress?.(0.5, 'Slots');
    for (const a of A) for (const b of B) joints += join(a, b, 1);
    families.push({ name: 'Ribs A', sections: A, hollow: P.hollow }, { name: 'Ribs B', sections: B, hollow: P.hollow });
  } else if (P.style === 'revolve') {
    const r = P.revolve;
    const b = bbox(surface);
    const c: V3 = [b.center[0], b.center[1], 0];
    const nFins = Math.max(2, Math.round(r.profiles)) * 2;
    const twist = (r.twist * Math.PI) / 180;
    // Fins meet at the axis; stop each one where it would collide with its neighbours.
    const core = slotW / 2 / Math.tan(Math.PI / nFins) + 0.3;
    const fins: Section[] = [];
    for (let k = 0; k < nFins; k++) {
      const th = twist + (k * 2 * Math.PI) / nFins;
      const n: V3 = [Math.sin(th), -Math.cos(th), 0];
      const f = frameFromNormal(n, [0, 0, 1]); // u points out along the fin (cos θ, sin θ)
      const d = dot3(n, c);
      const u0 = dot3(f.u, c) + core;
      const clip: Path2[] = [[[u0, -BIG], [BIG, -BIG], [BIG, BIG], [u0, BIG]]];
      fins.push(makeSection(surface, f, d, 0, `P${k + 1}`, band, clip));
    }
    onProgress?.(0.3, 'Profiles');
    const [lo, hi] = projectRange(surface, [0, 0, 1]);
    const ringFrame = frameFromNormal([0, 0, 1], [0, 1, 0]);
    const rings = evenly(lo, hi, r.inset, r.rings).map((z, i) => {
      const s = makeSection(surface, ringFrame, z, 1, `R${i + 1}`, band);
      // Rings are open in the middle so each profile can slide in from outside.
      const inner = offsetPolygons(s.solid, -band);
      const cx = dot3(ringFrame.u, c), cy = dot3(ringFrame.v, c);
      const hub = circlePath(cx, cy, core + slotW, 48);
      s.solid = difference(s.solid, inner.length ? inner : [hub]);
      return s;
    });
    onProgress?.(0.5, 'Slots');
    for (const fin of fins) for (const ring of rings) joints += join(fin, ring, -1); // profiles slide in from outside
    families.push({ name: 'Profiles', sections: fins, hollow: P.hollow }, { name: 'Rings', sections: rings, hollow: false });
  } else {
    const cv = P.curve;
    const { samples } = sampleCurve(surface, cv.curve, { count: Math.max(1, cv.ribs), from: cv.inset, to: 1 - cv.inset });
    const nS = planeNormalOf(cv.curve.plane);
    const b = bbox(surface);
    const mid = dot3(nS, b.center);
    const nSp = Math.max(1, Math.round(cv.spines));
    const spineFrame = frameFromNormal(nS, cv.curve.plane === 'xy' ? [0, 1, 0] : [0, 0, 1]);
    const spines = Array.from({ length: nSp }, (_, i) => {
      const off = nSp === 1 ? 0 : (i - (nSp - 1) / 2) * (cv.spineGap / Math.max(1, nSp - 1)) * (nSp > 1 ? 1 : 0);
      return makeSection(surface, spineFrame, mid + off, 1, `S${i + 1}`, band);
    });
    const ribs = samples.map((smp, i) => {
      const f = frameFromNormal(smp.t, nS);
      const d = dot3(f.n, smp.p);
      const s = makeSection(surface, f, d, 0, `r${i + 1}`, band);
      // Keep each rib inside the radius where it would meet its neighbour.
      const tn = (j: number) => samples[Math.max(0, Math.min(samples.length - 1, j))];
      const gap = Math.min(Math.abs(tn(i + 1).s - smp.s) || Infinity, Math.abs(smp.s - tn(i - 1).s) || Infinity);
      const bend = Math.max(Math.acos(Math.min(1, dot3(tn(i - 1).t, smp.t))), Math.acos(Math.min(1, dot3(tn(i + 1).t, smp.t))));
      if (bend > 1e-3 && Number.isFinite(gap)) {
        const R = (gap / bend) * 0.95;
        s.solid = intersection(s.solid, [circlePath(dot3(f.u, smp.p), dot3(f.v, smp.p), R, 96)]);
      }
      return s;
    });
    onProgress?.(0.5, 'Slots');
    for (const rib of ribs) for (const sp of spines) joints += join(rib, sp, 1);
    families.push({ name: 'Ribs', sections: ribs, hollow: P.hollow }, { name: 'Spine', sections: spines, hollow: P.hollow });
  }

  onProgress?.(0.75, 'Parts');
  const parts: Part2D[] = [];
  const ids: IdCounter = new Map();
  families.forEach((fam, gi) => {
    for (const s of fam.sections) {
      const region = finishSection(s, fam.hollow, P.frame, slotW);
      if (!region.length) continue;
      parts.push(
        ...sectionParts(
          { frame: s.frame, d: s.d, thickness: t, region, group: gi, groupName: fam.name, label: s.label, engrave: s.marks, labelParts: P.labelParts, textHeight: P.textHeight, meta: { section: s.label } },
          ids,
        ),
      );
    }
  });
  const orphan = families.flatMap((f) => f.sections).filter((s) => s.solid.length && !s.slots.length).length;
  if (orphan) warnings.push(`${orphan} section${orphan > 1 ? 's do' : ' does'} not cross any other and will not hold. Change the counts or the inset.`);
  return {
    parts,
    assembly: { kind: 'planar', thickness: t },
    overlays: P.style === 'curve' ? { guide: guideSegments(curvePolyline(surface, P.curve.curve, 120)) } : {},
    stats: { sections: families.reduce((n, f) => n + f.sections.length, 0), joints },
    warnings,
    connectorData: { pinCount: 0, gripLength: t, crossings: joints, crossClips: J?.kind === 'crossing' && clipAngles.total ? clipAngles.list() : undefined },
  };
}
