/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Manufacturing: what changes when the same parts are laser cut, CNC routed
 * or 3D printed flat.
 *  - CNC: a round tool cannot cut a sharp inside corner, so every corner the
 *    material wraps around gets a dog-bone (or T-bone) relief.
 *  - 3D print: the "sheet" is the print bed.
 *  - Weight and time estimates for each process.
 */
import type { MethodResult, Part2D, Path2 } from '../types';
import type { ProjectParams, SheetParams } from '../params';
import { bounds, circlePath, difference, signedArea, union } from '../polygon/polygon';
import { cutLength, partArea } from '../parts';
import type { V2 } from '../math/vec';

export function effectiveSheet(p: ProjectParams): SheetParams {
  const M = p.manufacturing;
  if (M?.process === 'print3d') {
    return { width: M.print.bedW, height: M.print.bedH, margin: Math.max(3, M.print.brim + 3), spacing: Math.max(3, p.sheet.spacing, M.print.brim * 2 + 2), kerfCompensation: false };
  }
  return p.sheet;
}

/** Corners where the material is reflex (an inside corner a round tool cannot reach). */
export function reliefCorners(path: Path2, materialLeft: boolean, minEdge: number, minTurnDeg = 25): { p: V2; empty: V2; d1: V2; d2: V2 }[] {
  const out: { p: V2; empty: V2; d1: V2; d2: V2 }[] = [];
  const n = path.length;
  const minTurn = Math.sin((minTurnDeg * Math.PI) / 180);
  for (let i = 0; i < n; i++) {
    const a = path[(i + n - 1) % n], p = path[i], b = path[(i + 1) % n];
    const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]), l2 = Math.hypot(b[0] - p[0], b[1] - p[1]);
    if (l1 < minEdge || l2 < minEdge) continue;
    const d1: V2 = [(p[0] - a[0]) / l1, (p[1] - a[1]) / l1];
    const d2: V2 = [(b[0] - p[0]) / l2, (b[1] - p[1]) / l2];
    const cr = d1[0] * d2[1] - d1[1] * d2[0];
    const reflex = materialLeft ? cr < -minTurn : cr > minTurn;
    if (!reflex) continue;
    const e: V2 = [d2[0] - d1[0], d2[1] - d1[1]];
    const el = Math.hypot(e[0], e[1]) || 1;
    out.push({ p, empty: [e[0] / el, e[1] / el], d1, d2 });
  }
  return out;
}

export function addDogbones(part: Part2D, toolD: number, style: 'dogbone' | 'tbone'): { part: Part2D; count: number } {
  const r = toolD / 2;
  const reliefs: Path2[] = [];
  part.cut.forEach((path, i) => {
    const ccw = signedArea(path) > 0;
    const materialLeft = i === 0 ? ccw : !ccw;
    for (const c of reliefCorners(path, materialLeft, r * 0.6)) {
      let dir = c.empty;
      if (style === 'tbone') {
        // Relief along the normal of the longer wall, square into the corner.
        const nIn: V2 = [-c.d2[1], c.d2[0]];
        const nOut: V2 = [c.d1[1], -c.d1[0]];
        const pick = (v: V2): V2 => (v[0] * c.empty[0] + v[1] * c.empty[1] > 0 ? v : [-v[0], -v[1]]);
        dir = pick(Math.abs(nIn[0] * c.empty[0] + nIn[1] * c.empty[1]) > Math.abs(nOut[0] * c.empty[0] + nOut[1] * c.empty[1]) ? nIn : nOut);
      }
      reliefs.push(circlePath(c.p[0] + dir[0] * r, c.p[1] + dir[1] * r, r * 1.02, 24));
    }
  });
  if (!reliefs.length) return { part, count: 0 };
  // Reliefs remove material from the part's even-odd region; keep the outline first.
  const cut = difference(union(part.cut, 'evenodd'), reliefs).sort((x, y) => Math.abs(signedArea(y)) - Math.abs(signedArea(x)));
  if (!cut.length) return { part, count: 0 };
  return { part: { ...part, cut, area: partArea(cut, part.holes), bbox: bounds(cut) }, count: reliefs.length };
}

export function applyManufacturing(r: MethodResult, p: ProjectParams): MethodResult {
  const M = p.manufacturing;
  if (!M) return r;
  const warnings = [...r.warnings];
  const stats = { ...r.stats };
  let parts = r.parts;
  if (M.process === 'cnc') {
    if (M.cnc.dogbones) {
      let total = 0;
      parts = parts.map((pt) => {
        const { part, count } = addDogbones(pt, M.cnc.toolDiameter, M.cnc.dogboneStyle);
        total += count;
        return part;
      });
      stats.dogbones = total;
    }
    const slot = p.material.thickness + (p.method === 'classic' ? p.classic.slotClearance : 0);
    if (M.cnc.toolDiameter > slot && (p.method === 'classic' || p.method === 'waffle')) warnings.push(`The ${M.cnc.toolDiameter} mm tool is wider than the ${slot.toFixed(2)} mm slots. Use a smaller end mill.`);
    const thin = p.method === 'lattice' ? p.lattice.stripWidth : p.method === 'meshlines' ? p.meshlines.barWidth : Infinity;
    if (thin < M.cnc.toolDiameter * 2) warnings.push('Some features are narrower than two tool widths and may break or burn.');
  } else if (M.process === 'print3d') {
    const bed = effectiveSheet(p);
    const big = parts.filter((q) => {
      const w = q.bbox.maxX - q.bbox.minX, h = q.bbox.maxY - q.bbox.minY;
      return !((w <= bed.width && h <= bed.height) || (w <= bed.height && h <= bed.width));
    }).length;
    if (big) warnings.push(`${big} part${big > 1 ? 's are' : ' is'} bigger than the ${bed.width} × ${bed.height} mm bed.`);
  }
  return { ...r, parts, warnings, stats };
}

export interface Estimate {
  /** Grams. */
  weight: number;
  /** Minutes of machine time. */
  minutes: number;
  /** Total length of cut, mm (laser / CNC). */
  cutLength: number;
  /** cm³ of material in the parts. */
  volume: number;
}

/** Weight and time for the current parts and process. */
export function estimate(parts: Part2D[], p: ProjectParams): Estimate {
  const t = p.material.thickness;
  const area = parts.reduce((s, q) => s + q.area, 0); // mm²
  const volume = (area * t) / 1000; // cm³
  const len = parts.reduce((s, q) => s + cutLength(q) + (q.perforations ?? []).reduce((a, l) => a + polyLen(l.pts), 0), 0);
  const M = p.manufacturing;
  if (M?.process === 'print3d') {
    // Two perimeters plus top/bottom skins are solid; the rest is infill.
    const perim = parts.reduce((s, q) => s + cutLength(q), 0);
    const shell = Math.min(volume, (perim * M.print.nozzle * 2 * t + 2 * area * Math.min(t, M.print.layerHeight * 4)) / 1000);
    const solid = shell + Math.max(0, volume - shell) * M.print.infill;
    const weight = solid * M.print.density;
    const minutes = (solid * 1000) / Math.max(1, M.print.speed) / 60;
    return { weight, minutes, cutLength: 0, volume };
  }
  const weight = (volume / 1e6) * p.material.density * 1000; // cm³ → m³ × kg/m³ → g
  if (M?.process === 'cnc') {
    const passes = Math.max(1, Math.ceil(t / Math.max(0.1, M.cnc.depthPerPass)));
    return { weight, minutes: (len * passes) / Math.max(1, M.cnc.feed), cutLength: len, volume };
  }
  const passes = M?.laser.passes ?? 1;
  return { weight, minutes: (len * passes) / Math.max(1, p.material.cutSpeed) / 60, cutLength: len, volume };
}

/**
 * Weight of the parts that are not cut from sheet: bought sticks (by profile
 * and material) and LEGO bricks (by stud count). Grams.
 */
export function kitWeight(kit: import('../types').Kit | undefined, p: ProjectParams): { weight: number; label: string } {
  if (kit?.bricks?.length) {
    const plate = kit.brickUnit === 'plate';
    const studs = kit.bricks.reduce((s, b) => s + (b.shape === 'corner' ? 3 : b.w * b.d), 0);
    // About 0.29 g per stud for bricks (a 2×4 weighs ~2.3 g), 0.2 g for plates.
    return { weight: studs * (plate ? 0.2 : 0.29), label: `${kit.bricks.length.toLocaleString()} ${plate ? 'plates' : 'bricks'}` };
  }
  if (kit?.sticks?.length) {
    const S = p.sticks;
    const len = kit.sticks.reduce((a, r) => a + r.length * r.count, 0); // mm
    const area = S.profile === 'square' ? S.size * S.size : S.profile === 'tube' ? (Math.PI / 4) * (S.size ** 2 - Math.min(S.inner, S.size - 0.2) ** 2) : (Math.PI / 4) * S.size ** 2;
    const density = /alu/.test(S.preset) ? 2.7 : /carbon/.test(S.preset) ? 1.6 : /skewer/.test(S.preset) ? 0.7 : 0.6; // g/cm³
    return { weight: ((area * len) / 1000) * density, label: `${kit.sticks.reduce((a, r) => a + r.count, 0).toLocaleString()} sticks` };
  }
  return { weight: 0, label: '' };
}

function polyLen(pts: Path2) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}
