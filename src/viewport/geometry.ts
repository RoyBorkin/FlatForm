/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Three.js geometry for the assembled model. Shared by the viewport (which
 * uses instancing for speed) and the 3D exporters (which bake everything into
 * real meshes).
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Path,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
  Color,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MeshData, MethodResult, Part2D, Strip3D } from '@/core/types';
import { signedArea } from '@/core/polygon/polygon';
import { LEGO_COLORS } from '@/core/presets';

export function meshDataToGeometry(m: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.positions, 3));
  g.setIndex(new BufferAttribute(m.indices, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Flat part → solid of the given thickness, in the part's own 2D frame (z from 0 to t). */
export function partExtrusion(part: Part2D, t: number): BufferGeometry | null {
  if (!part.cut.length) return null;
  const outerIdx = 0;
  const toShape = (pts: [number, number][], ccw: boolean) => (signedArea(pts) > 0 === ccw ? pts : pts.slice().reverse());
  const outer = toShape(part.cut[outerIdx] as [number, number][], true);
  const shape = new Shape(outer.map(([x, y]) => new Vector2(x, y)));
  for (let i = 1; i < part.cut.length; i++) {
    const h = toShape(part.cut[i] as [number, number][], false);
    shape.holes.push(new Path(h.map(([x, y]) => new Vector2(x, y))));
  }
  for (const c of part.holes) {
    const path = new Path();
    path.absarc(c.x, c.y, c.r, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  try {
    const g = new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 12 });
    return g;
  } catch {
    return null;
  }
}

const UP = new Vector3(0, 1, 0);
const tmpQ = new Quaternion();

/** Instance matrices for lattice strips: unit boxes per segment, unit discs per node. */
export function stripMatrices(strip: Strip3D, width: number, t: number): { boxes: Matrix4[]; discs: Matrix4[] } {
  const boxes: Matrix4[] = [];
  const s = strip.segments;
  const a = new Vector3(), b = new Vector3(), n = new Vector3(), dir = new Vector3(), side = new Vector3();
  for (let i = 0; i < s.length; i += 9) {
    a.set(s[i], s[i + 1], s[i + 2]);
    b.set(s[i + 3], s[i + 4], s[i + 5]);
    n.set(s[i + 6], s[i + 7], s[i + 8]).normalize();
    dir.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-6) continue;
    dir.divideScalar(len);
    side.crossVectors(n, dir).normalize();
    const nn = new Vector3().crossVectors(dir, side);
    const m = new Matrix4().makeBasis(dir, side, nn);
    m.scale(new Vector3(len, width, t));
    m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    boxes.push(m);
  }
  const discs: Matrix4[] = [];
  const d = strip.nodes;
  for (let i = 0; i < d.length; i += 6) {
    n.set(d[i + 3], d[i + 4], d[i + 5]).normalize();
    tmpQ.setFromUnitVectors(UP, n);
    const m = new Matrix4().compose(new Vector3(d[i], d[i + 1], d[i + 2]), tmpQ, new Vector3(width / 2, t, width / 2));
    discs.push(m);
  }
  return { boxes, discs };
}

export function pinMatrices(pins: NonNullable<MethodResult['assembly']['pins']>): Matrix4[] {
  const out: Matrix4[] = [];
  const d = pins.data;
  const n = new Vector3();
  for (let i = 0; i < d.length; i += 6) {
    n.set(d[i + 3], d[i + 4], d[i + 5]).normalize();
    tmpQ.setFromUnitVectors(UP, n);
    out.push(new Matrix4().compose(new Vector3(d[i], d[i + 1], d[i + 2]), tmpQ, new Vector3(pins.radius, pins.length, pins.radius)));
  }
  return out;
}

export const unitBox = () => new BoxGeometry(1, 1, 1);
export const unitDisc = () => new CylinderGeometry(1, 1, 1, 20, 1);
export const unitPin = () => new CylinderGeometry(1, 1, 1, 10, 1);

/** Folded panels thickened along their normals (one closed prism per facet). */
export function panelsGeometry(p: NonNullable<MethodResult['assembly']['panels']>, t: number): BufferGeometry {
  const nt = p.positions.length / 9;
  const pos = new Float32Array(nt * 8 * 9);
  let k = 0;
  const put = (x: number, y: number, z: number) => {
    pos[k++] = x;
    pos[k++] = y;
    pos[k++] = z;
  };
  for (let f = 0; f < nt; f++) {
    const v = [0, 1, 2].map((i) => [p.positions[f * 9 + i * 3], p.positions[f * 9 + i * 3 + 1], p.positions[f * 9 + i * 3 + 2]]);
    const nx = p.normals[f * 9], ny = p.normals[f * 9 + 1], nz = p.normals[f * 9 + 2];
    const top = v.map(([x, y, z]) => [x + nx * t, y + ny * t, z + nz * t]);
    put(...(v[0] as [number, number, number])); put(...(v[2] as [number, number, number])); put(...(v[1] as [number, number, number]));
    put(...(top[0] as [number, number, number])); put(...(top[1] as [number, number, number])); put(...(top[2] as [number, number, number]));
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3], A = top[e], B = top[(e + 1) % 3];
      put(...(a as [number, number, number])); put(...(b as [number, number, number])); put(...(B as [number, number, number]));
      put(...(a as [number, number, number])); put(...(B as [number, number, number])); put(...(A as [number, number, number]));
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos.subarray(0, k), 3));
  g.computeVertexNormals();
  return g;
}

/** Bake the assembled model into a group of plain meshes (for STL/OBJ/GLB/3MF). */
export function bakeAssembly(method: MethodResult, colors: string[]): Group {
  const group = new Group();
  const A = method.assembly;
  const mat = (c: string) => new MeshStandardMaterial({ color: new Color(c), roughness: 0.5, metalness: 0.2 });
  if (A.kind === 'lattice' && A.strips) {
    const byGroup = new Map<number, BufferGeometry[]>();
    const box = unitBox(), disc = unitDisc();
    for (const s of A.strips) {
      const { boxes, discs } = stripMatrices(s, A.stripWidth ?? 8, A.thickness);
      const list = byGroup.get(s.group) ?? [];
      for (const m of boxes) list.push(box.clone().applyMatrix4(m));
      for (const m of discs) list.push(disc.clone().applyMatrix4(m));
      byGroup.set(s.group, list);
    }
    for (const [g, list] of byGroup) {
      const merged = mergeGeometries(list.map((x) => x.toNonIndexed()), false);
      if (merged) {
        const mesh = new Mesh(merged, mat(colors[g % colors.length]));
        mesh.name = `layer-${String.fromCharCode(65 + g)}`;
        group.add(mesh);
      }
    }
    if (A.pins) {
      const pin = unitPin();
      const list = pinMatrices(A.pins).map((m) => pin.clone().applyMatrix4(m).toNonIndexed());
      const merged = list.length ? mergeGeometries(list, false) : null;
      if (merged) {
        const mesh = new Mesh(merged, mat('#c9c9c9'));
        mesh.name = 'pins';
        group.add(mesh);
      }
    }
  } else if (A.kind === 'planar') {
    for (const part of method.parts) {
      if (!part.planar) continue;
      const g = partExtrusion(part, A.thickness);
      if (!g) continue;
      g.applyMatrix4(new Matrix4().fromArray(part.planar.matrix));
      const mesh = new Mesh(g, mat(colors[part.group % colors.length]));
      mesh.name = part.id;
      group.add(mesh);
    }
  } else if (A.kind === 'panels' && A.panels) {
    const mesh = new Mesh(panelsGeometry(A.panels, A.thickness), mat(colors[0]));
    mesh.name = 'panels';
    group.add(mesh);
  }
  const bake = (name: string, proto: BufferGeometry, ms: Matrix4[], color: string) => {
    if (!ms.length) return;
    const merged = mergeGeometries(ms.map((m) => proto.clone().applyMatrix4(m).toNonIndexed()), false);
    if (!merged) return;
    const mesh = new Mesh(merged, mat(color));
    mesh.name = name;
    group.add(mesh);
  };
  if (A.rods) bake('sticks', A.rods.profile === 'square' ? new BoxGeometry(1, 1, 1) : unitRod(), rodMatrices(A.rods), '#c8a26b');
  if (A.hubs) bake('junction-hubs', unitSphere(), hubMatrices(A.hubs), '#faaf40');
  if (A.bricks) {
    const B = brickMatrices(method);
    const byColor = new Map<string, { boxes: Matrix4[]; studs: Matrix4[] }>();
    B.boxes.forEach((m, i) => {
      const e = byColor.get(B.boxColors[i]) ?? { boxes: [], studs: [] };
      e.boxes.push(m);
      byColor.set(B.boxColors[i], e);
    });
    B.studs.forEach((m, i) => byColor.get(B.studColors[i])?.studs.push(m));
    for (const [c, e] of byColor) {
      bake(`bricks-${c.slice(1)}`, new BoxGeometry(1, 1, 1), e.boxes, c);
      bake(`studs-${c.slice(1)}`, studGeometry(), e.studs, c);
    }
  }
  return group;
}

export const unitSphere = () => new SphereGeometry(1, 16, 12);
export const unitRod = () => new CylinderGeometry(1, 1, 1, 14, 1);
/** Stud: Ø4.8 × 1.7 with its base at y = 0 (axis on y, like all cylinders). */
export const studGeometry = () => new CylinderGeometry(2.4, 2.4, 1.7, 16, 1).translate(0, 0.85, 0);

const Y = new Vector3(0, 1, 0);

/** Sticks: one matrix per rod for a unit cylinder or box on the y axis. */
export function rodMatrices(rods: NonNullable<MethodResult['assembly']['rods']>): Matrix4[] {
  const out: Matrix4[] = [];
  const d = rods.data;
  const a = new Vector3(), b = new Vector3(), dir = new Vector3(), q = new Quaternion();
  const r = rods.profile === 'square' ? rods.size : rods.size / 2;
  for (let i = 0; i + 5 < d.length; i += 6) {
    a.set(d[i], d[i + 1], d[i + 2]);
    b.set(d[i + 3], d[i + 4], d[i + 5]);
    dir.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-6) continue;
    q.setFromUnitVectors(Y, dir.clone().normalize());
    out.push(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q.clone(), new Vector3(r, len, r)));
  }
  return out;
}

/** Junction hubs: centre + radius (4 floats) each → sphere matrices. */
export function hubMatrices(hubs: Float32Array): Matrix4[] {
  const out: Matrix4[] = [];
  for (let i = 0; i + 3 < hubs.length; i += 4) out.push(new Matrix4().compose(new Vector3(hubs[i], hubs[i + 1], hubs[i + 2]), new Quaternion(), new Vector3(hubs[i + 3], hubs[i + 3], hubs[i + 3])));
  return out;
}

/** LEGO build: a box per brick and a stud on every cell not covered by the layer above. */
export function brickMatrices(method: MethodResult) {
  const list = method.kit?.bricks ?? [];
  const g = method.assembly.bricks;
  const boxes: Matrix4[] = [], boxColors: string[] = [], studs: Matrix4[] = [], studColors: string[] = [];
  if (!g || !list.length) return { boxes, boxColors, studs, studColors };
  const P = 8, H = g.unit, [x0, y0, z0] = g.origin;
  const hex = new Map(LEGO_COLORS.map((c) => [c.code, c.hex]));
  const key = (i: number, j: number, k: number) => `${i},${j},${k}`;
  const filled = new Set<string>();
  for (const b of list) for (let i = 0; i < b.w; i++) for (let j = 0; j < b.d; j++) filled.add(key(b.x + i, b.y + j, b.z));
  const up = new Quaternion().setFromUnitVectors(Y, new Vector3(0, 0, 1));
  for (const b of list) {
    const c = hex.get(b.color) ?? '#c91a09';
    boxes.push(new Matrix4().compose(new Vector3(x0 + (b.x + b.w / 2) * P, y0 + (b.y + b.d / 2) * P, z0 + (b.z + 0.5) * H), new Quaternion(), new Vector3(b.w * P - 0.2, b.d * P - 0.2, H - 0.04)));
    boxColors.push(c);
    for (let i = 0; i < b.w; i++)
      for (let j = 0; j < b.d; j++) {
        if (filled.has(key(b.x + i, b.y + j, b.z + 1))) continue;
        studs.push(new Matrix4().compose(new Vector3(x0 + (b.x + i + 0.5) * P, y0 + (b.y + j + 0.5) * P, z0 + (b.z + 1) * H), up, new Vector3(1, 1, 1)));
        studColors.push(c);
      }
  }
  return { boxes, boxColors, studs, studColors };
}

/** Unit-height prism (z from 0 to 1) in the spacer's cross-section, bored for the rod. */
export function spacerGeometry(shape: 'round' | 'square' | 'hex' | 'star', size: number): BufferGeometry {
  const sh = new Shape();
  const r = size / 2;
  if (shape === 'round' || shape === 'hex') {
    const n = shape === 'round' ? 40 : 6;
    const rr = shape === 'hex' ? r / Math.cos(Math.PI / 6) : r;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
  } else if (shape === 'square') {
    sh.moveTo(-r, -r);
    sh.lineTo(r, -r);
    sh.lineTo(r, r);
    sh.lineTo(-r, r);
  } else {
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.6 : r;
      const a = (i * Math.PI) / 5 + Math.PI / 2;
      if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
  }
  sh.closePath();
  const g = new ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 4 });
  g.computeVertexNormals();
  return g;
}
