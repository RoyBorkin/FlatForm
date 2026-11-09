/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Assembly guide PDF: cover render, how-to steps for the chosen method, every
 * sheet with its part labels, and a catalogue page for each part showing its
 * flat outline next to a render that highlights where it goes.
 */
import { APP_NAME, AUTHOR, AUTHOR_EMAIL, AUTHOR_URL, COPYRIGHT, COPYRIGHT_LINE } from '@/brand';
import { METHOD_NAME, PROCESS_LABEL } from '@/ui/labels';
import { effectiveSheet, estimate } from '@/core/manufacturing/manufacturing';
import { jsPDF } from 'jspdf';
import {
  AmbientLight,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  BufferAttribute,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useProject } from '@/state/project';
import { useResults } from '@/state/results';
import { useUI } from '@/state/ui';
import { sheetDrawings } from '@/core/export/sheetGeometry';
import { cutLength } from '@/core/parts';
import { pinHoleDiameter } from '@/core/joinery/holes';
import { stripMatrices, unitBox, unitDisc, partExtrusion } from '@/viewport/geometry';
import type { MethodResult, Part2D, Path2 } from '@/core/types';

const STEPS: Record<string, string[]> = {
  lattice: [
    'Cut every sheet. Keep the parts of each layer together: they are on separate sheets and carry their layer letter (A, B, …).',
    'Every hole has a number. The same number appears on exactly one hole in each layer: that is where one pin goes through all layers.',
    'Lay out layer A first. Bend each strip gently to follow the surface; the part pages show where it sits.',
    'Lay layer B over layer A. Its strips run across the seams of layer A, which locks the shell together.',
    'Push a pin, screw or rivet through every pair of matching numbers. Work outward from one area so the strips settle evenly.',
  ],
  slices: [
    'Cut every sheet. Slices are numbered from the bottom of the stack.',
    'Put the dowels upright and thread slice 1 onto them, then 2, 3 and so on.',
    'Each slice carries the engraved outline of the next one. Use it to check orientation before you glue or clamp.',
  ],
  waffle: [
    'Cut every sheet. Ribs of family A have slots from the bottom; ribs of family B have slots from the top.',
    'The label beside each slot names the rib that goes into it.',
    'Stand the A ribs up in order, then lower each B rib onto them, slot into slot. Do not force: tap gently with a soft mallet.',
  ],
  folded: [
    'Cut every sheet. Score or perforated lines are folds; solid outlines are cuts.',
    'Fold along every fold line: solid score lines are mountain folds, dashed score lines are valley folds.',
    'Edges with the same number meet. Join each pair with its latch, glue tab, screws or printed bracket.',
    'Build outward from the largest part so the shape keeps its stiffness as it closes.',
  ],
  papercraft: [
    'Print or cut every sheet. Solid outlines are cuts; dash-dot lines are mountain folds, dashed lines are valley folds.',
    'Score every fold line lightly with a blunt point and a ruler, then pre-fold each piece.',
    'Edges with the same number meet. Glue each flap under the matching edge; with lacing or latches, join them instead.',
    'Start from the largest piece and close the shape last, from the inside where you can still reach.',
  ],
  minimal: [
    'Cut every piece from felt, fabric, leather or thin plastic. Pieces are flattened in one go, so some stretch a little when they wrap the shape.',
    'Seams with the same number meet. Line up the small ticks across each seam first.',
    'Lace each seam through its holes or slots: cross stitches alternate sides; whip stitches wrap over the edge.',
    'Close the largest seams first and finish with the short ones.',
  ],
  flexhinge: [
    'Cut every piece. The bands of fine slits are living hinges: handle those areas gently until assembled.',
    'Flex each hinge band slowly in the direction of the bend. Warming MDF or plywood slightly helps.',
    'Seams with the same number meet. Join them with lacing, finger joints, latches or screws as chosen.',
    'Close the shape last, easing the hinges into their final curve.',
  ],
  layers: [
    'Cut every layer. Layers are numbered in order along the stack or the curve.',
    'Slide layer 1 onto the rods (or the spine), then a printed spacer on every rod, then layer 2, and so on.',
    'The engraved circles mark where each spacer sits; the engraved outline shows the next layer.',
    'Tighten the rod ends once every layer is on. Curved stacks use a bendable rod or wire along the spine.',
  ],
  meshlines: [
    'Cut every bar. Each bar carries its length type and number; the holes at the ends are labelled with node numbers.',
    'Bars that share a node number meet at that node. Join them with a bolt, lashing or a printed node hub.',
    'Build one ring of triangles first, then grow outward; the frame becomes rigid as each triangle closes.',
  ],
  triangles: [
    'Cut every panel. Panels of the same type (T1, T2, …) are identical, so you can cut them in batches.',
    'Edges with the same number meet. Join them with lacing, finger joints, screws or printed connectors.',
    'Start from one panel and add neighbours around it; check each panel’s edge numbers against its neighbours.',
  ],
  classic: [
    'Cut every sheet. Each slot is labelled with the part that slides into it.',
    'Every pair of parts slides together in one direction: one slot from each side, meeting in the middle.',
    'Revolved models: stand the rings on their profiles, then slide each profile in from the outside. Curved models: thread the ribs onto the spine in order.',
    'Do not force a slot. If it is tight, increase the fit clearance and cut again.',
  ],
};

function partGeometries(method: MethodResult): Map<string, BufferGeometry> {
  const out = new Map<string, BufferGeometry>();
  const A = method.assembly;
  if (A.kind === 'lattice' && A.strips) {
    const box = unitBox().toNonIndexed(), disc = unitDisc().toNonIndexed();
    for (const s of A.strips) {
      const part = method.parts[s.partIndex];
      if (!part) continue;
      const { boxes, discs } = stripMatrices(s, A.stripWidth ?? 8, A.thickness);
      const list = [...boxes.map((m) => box.clone().applyMatrix4(m)), ...discs.map((m) => disc.clone().applyMatrix4(m))];
      const g = list.length ? mergeGeometries(list, false) : null;
      if (g) out.set(part.id, g);
    }
  } else if (A.kind === 'planar') {
    for (const p of method.parts) {
      if (!p.planar) continue;
      const g = partExtrusion(p, A.thickness);
      if (g) out.set(p.id, g.applyMatrix4(new Matrix4().fromArray(p.planar.matrix)));
    }
  } else if (A.kind === 'panels' && A.panels) {
    const { positions, island } = A.panels;
    const byIsland = new Map<number, number[]>();
    for (let f = 0; f < island.length; f++) {
      const list = byIsland.get(island[f]) ?? [];
      for (let k = 0; k < 9; k++) list.push(positions[f * 9 + k]);
      byIsland.set(island[f], list);
    }
    for (const [i, pos] of byIsland) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      g.computeVertexNormals();
      out.set(method.parts[i]?.id ?? `P${i}`, g);
    }
  }
  return out;
}

class Renderer {
  renderer: WebGLRenderer;
  scene = new Scene();
  camera = new PerspectiveCamera(32, 4 / 3, 1, 1e6);
  meshes = new Map<string, Mesh>();
  center = new Vector3();
  home = new Vector3();
  size = 1;
  constructor(geoms: Map<string, BufferGeometry>, w: number, h: number) {
    const canvas = document.createElement('canvas');
    this.renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0xffffff, 1);
    this.camera.aspect = w / h;
    this.camera.up.set(0, 0, 1);
    this.scene.add(new AmbientLight(0xffffff, 1.4));
    const d = new DirectionalLight(0xffffff, 2.2);
    d.position.set(1, -2, 3);
    this.scene.add(d);
    const group = new Group();
    for (const [id, g] of geoms) {
      const m = new Mesh(g, new MeshStandardMaterial({ color: 0xd6d3cd, roughness: 0.7 }));
      group.add(m);
      this.meshes.set(id, m);
    }
    this.scene.add(group);
    const box = new Box3().setFromObject(group);
    const c = box.getCenter(new Vector3()), size = box.getSize(new Vector3()).length();
    this.camera.position.copy(c).add(new Vector3(0.9, -1.4, 0.8).normalize().multiplyScalar(size * 1.45));
    this.camera.lookAt(c);
    this.center.copy(c);
    this.home.copy(this.camera.position);
    this.size = size;
    this.camera.near = size / 100;
    this.camera.far = size * 10;
    this.camera.updateProjectionMatrix();
  }
  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  shot(highlight: string | null, color: string, colors?: (id: string) => string): string {
    // Close-up on the highlighted part, seen from outside the model.
    if (highlight && this.meshes.has(highlight)) {
      const pb = new Box3().setFromObject(this.meshes.get(highlight)!);
      const pc = pb.getCenter(new Vector3());
      const ps = Math.max(pb.getSize(new Vector3()).length(), this.size * 0.12);
      const out = pc.clone().sub(this.center).setZ(0).normalize().add(new Vector3(0, 0, 0.6)).normalize();
      this.camera.position.copy(pc).addScaledVector(out, ps * 2.6);
      this.camera.lookAt(pc);
    } else {
      this.camera.position.copy(this.home);
      this.camera.lookAt(this.center);
    }
    for (const [id, m] of this.meshes) {
      const mat = m.material as MeshStandardMaterial;
      if (highlight) {
        mat.color.set(id === highlight ? color : '#dcd9d4');
        mat.transparent = id !== highlight;
        mat.opacity = id === highlight ? 1 : 0.55;
      } else {
        mat.color.set(colors ? colors(id) : '#d6d3cd');
        mat.transparent = false;
        mat.opacity = 1;
      }
    }
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/jpeg', 0.82);
  }
  dispose() {
    for (const m of this.meshes.values()) {
      m.geometry.dispose();
      (m.material as MeshStandardMaterial).dispose();
    }
    this.renderer.dispose();
  }
}

function drawOutline(doc: jsPDF, part: Part2D, x: number, y: number, w: number, h: number, color: string) {
  const pw = part.bbox.maxX - part.bbox.minX || 1, ph = part.bbox.maxY - part.bbox.minY || 1;
  const s = Math.min(w / pw, h / ph);
  const ox = x + (w - pw * s) / 2, oy = y + (h + ph * s) / 2;
  const P = (p: Path2) => p.map(([px, py]) => [ox + (px - part.bbox.minX) * s, oy - (py - part.bbox.minY) * s]);
  const line = (pts: number[][], closed: boolean) => {
    if (pts.length < 2) return;
    const segs = pts.slice(1).map((q, i) => [q[0] - pts[i][0], q[1] - pts[i][1]]);
    doc.lines(segs, pts[0][0], pts[0][1], [1, 1], 'S', closed);
  };
  const c = new Color(color);
  doc.setDrawColor(Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255));
  doc.setLineWidth(0.25);
  for (const p of part.cut) line(P(p), true);
  doc.setLineWidth(0.12);
  for (const h of part.holes) doc.circle(ox + (h.x - part.bbox.minX) * s, oy - (h.y - part.bbox.minY) * s, Math.max(0.15, h.r * s), 'S');
  doc.setDrawColor(90, 90, 90);
  if (s > 0.25) for (const e of part.engrave) line(P(e.pts), false);
  return s;
}

export async function buildAssemblyGuide(onProgress?: (f: number) => void): Promise<Blob> {
  const p = useProject.getState().project;
  const r = useResults.getState();
  const ui = useUI.getState();
  const colors = ui.settings.layerColors[ui.settings.world];
  if (!r.method || !r.nest) throw new Error('Nothing to document yet.');
  const method = r.method;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
  doc.setProperties({ title: `${p.name} · assembly guide`, creator: APP_NAME, author: `${AUTHOR} (${AUTHOR_EMAIL})`, subject: COPYRIGHT_LINE, keywords: 'FlatForm, assembly guide' });
  const W = 297, H = 210, M = 14;
  const geoms = partGeometries(method);
  const R = new Renderer(geoms, 960, 720);
  const groupColor = (part: Part2D) => colors[part.group % colors.length];
  const byId = new Map(method.parts.map((x) => [x.id, x]));

  // --- cover
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(p.name, M, M + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text('Assembly guide · made with FlatForm', M, M + 15);
  const cover = R.shot(null, '', (id) => groupColor(byId.get(id) ?? method.parts[0]));
  R.resize(400, 300); // part locators are small; keep them cheap
  doc.addImage(cover, 'JPEG', M, M + 22, 160, 120);
  const totalCut = method.parts.reduce((s, x) => s + cutLength(x), 0);
  const facts: [string, string][] = [
    ['Method', METHOD_NAME[p.method]],
    ['Making', PROCESS_LABEL[p.manufacturing.process]],
    ['Material', `${p.material.name}`],
    ['Thickness', `${p.material.thickness} mm`],
    [p.manufacturing.process === 'print3d' ? 'Print bed' : 'Sheet', `${effectiveSheet(p).width} × ${effectiveSheet(p).height} mm`],
    ['Sheets', String(r.nest.sheets.length)],
    ['Parts', String(method.parts.length)],
    ['Hole diameter', pinHoleDiameter(p.joinery) && method.parts.some((x) => x.holes.length) ? `${pinHoleDiameter(p.joinery).toFixed(2)} mm` : '—'],
    ['Connectors', String(method.connectorData?.pinCount ?? 0)],
    ['Total cut length', `${(totalCut / 1000).toFixed(1)} m`],
    ['Weight', (() => {
      const g = estimate(method.parts, p).weight;
      return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`;
    })()],
  ];
  doc.setTextColor(30);
  facts.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(110);
    doc.text(k, 186, M + 30 + i * 9);
    doc.setTextColor(20);
    doc.setFont('helvetica', 'bold');
    doc.text(v, 230, M + 30 + i * 9);
  });

  // --- steps
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text('How to assemble', M, M + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  let y = M + 18;
  (STEPS[p.method] ?? []).forEach((s, i) => {
    const lines = doc.splitTextToSize(s, W - 2 * M - 12);
    doc.setFont('helvetica', 'bold');
    doc.text(String(i + 1), M, y);
    doc.setFont('helvetica', 'normal');
    doc.text(lines, M + 10, y);
    y += lines.length * 5.5 + 5;
  });

  // --- sheets
  const drawings = sheetDrawings(r.nest, r.partIndex, effectiveSheet(p), 0);
  for (const s of drawings) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text(`Sheet ${s.index + 1} of ${drawings.length}`, M, M + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`${s.width} × ${s.height} mm · ${Math.round(s.utilisation * 100)}% used`, M, M + 10);
    const scale = Math.min((W - 2 * M) / s.width, (H - 2 * M - 16) / s.height);
    const ox = M, oy = M + 16 + s.height * scale;
    const P = (pts: Path2) => pts.map(([x, yy]) => [ox + x * scale, oy - yy * scale]);
    const line = (pts: number[][], closed: boolean) => {
      if (pts.length < 2) return;
      doc.lines(pts.slice(1).map((q, i) => [q[0] - pts[i][0], q[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'S', closed);
    };
    doc.setDrawColor(170);
    doc.setLineWidth(0.2);
    doc.rect(ox, oy - s.height * scale, s.width * scale, s.height * scale, 'S');
    const c = new Color(colors[s.group % colors.length]);
    doc.setDrawColor(Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255));
    for (const o of s.cutOuter) line(P(o), true);
    doc.setFontSize(Math.max(4, Math.min(8, 30 * scale)));
    doc.setTextColor(30);
    for (const l of s.labels) doc.text(l.id, ox + l.x * scale, oy - l.y * scale, { align: 'center', baseline: 'middle' });
  }

  // --- part catalogue: 6 per page
  const per = 6;
  const sheetOf = new Map<string, number>();
  for (const s of r.nest.sheets) for (const pl of s.placements) sheetOf.set(pl.partId, s.index + 1);
  const cols = 3, rows = 2;
  const tw = (W - 2 * M) / cols, th = (H - 2 * M - 8) / rows;
  for (let i = 0; i < method.parts.length; i += per) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text('Parts', M, M + 3);
    method.parts.slice(i, i + per).forEach((part, k) => {
      const cx = M + (k % cols) * tw, cy = M + 8 + Math.floor(k / cols) * th;
      doc.setDrawColor(220);
      doc.setLineWidth(0.2);
      doc.rect(cx + 1, cy + 1, tw - 2, th - 2, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(20);
      doc.text(part.id, cx + 4, cy + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(110);
      const w = (part.bbox.maxX - part.bbox.minX).toFixed(0), hh = (part.bbox.maxY - part.bbox.minY).toFixed(0);
      doc.text(`${part.groupName} · ${w} × ${hh} mm · sheet ${sheetOf.get(part.id) ?? '—'}${part.holes.length ? ` · ${part.holes.length} holes` : ''}`, cx + 4, cy + 11.5);
      const imgW = tw * 0.46, imgH = imgW * 0.75;
      const shot = geoms.has(part.id) ? R.shot(part.id, groupColor(part)) : null;
      if (shot) doc.addImage(shot, 'JPEG', cx + tw - imgW - 3, cy + 14, imgW, imgH, undefined, 'FAST');
      drawOutline(doc, part, cx + 4, cy + 15, tw - imgW - 10, th - 20, groupColor(part));
      if (part.holes.length && part.holes.length <= 40) {
        doc.setFontSize(6.5);
        doc.setTextColor(90);
        const nums = part.holes.map((h) => h.label).filter(Boolean).join(' · ');
        doc.text(doc.splitTextToSize(`Pins: ${nums}`, imgW), cx + tw - imgW - 3, cy + 16 + imgH + 3);
      }
    });
    onProgress?.(Math.min(1, (i + per) / method.parts.length));
    await new Promise((res) => setTimeout(res, 0)); // keep the UI responsive
  }
  R.dispose();
  // Footer with authorship on every page.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140);
    doc.text(`${COPYRIGHT} · ${AUTHOR_EMAIL} · ${AUTHOR_URL}`, M, H - 6);
    doc.text(`${i} / ${pages}`, W - M, H - 6, { align: 'right' });
  }
  return doc.output('blob');
}
