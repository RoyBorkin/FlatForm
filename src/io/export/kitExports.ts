/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Exports for the parts that are not cut from sheet: the stick cut list, the
 * LEGO build (LDraw model, layer-by-layer instructions and printable
 * LEGO-compatible bricks) and the printed hubs, clips and cardboard connectors.
 */
import { jsPDF } from 'jspdf';
import { APP_NAME, AUTHOR, AUTHOR_EMAIL, COPYRIGHT_LINE } from '@/brand';
import { LEGO_COLORS } from '@/core/presets';
import type { BrickPlacement, MethodResult } from '@/core/types';
import { brickCells, brickKind, cornerCells } from '@/core/bricks/catalog';
import type { KitRequest } from '@/core/connectors/kit';
import type { ProjectParams } from '@/core/params';

export type KitKind = 'junction' | 'crossing' | 'cardboard';

/** Which printed kit (if any) the current method and joinery produce. */
export function printedKit(p: ProjectParams, method: MethodResult | null): KitKind | null {
  if (!method) return null;
  const d = method.connectorData;
  const k = p.joinery.kind;
  if (k === 'junction' && d?.junctions?.length) return 'junction';
  if (k === 'crossing' && (d?.crossClips?.length || d?.collars)) return 'crossing';
  if (k === 'cardboard' && d?.seamClips?.length) return 'cardboard';
  return null;
}

export function kitRequest(p: ProjectParams, method: MethodResult, kind: KitRequest['kind']): KitRequest {
  return { kind, joinery: p.joinery, thickness: p.material.thickness, data: method.connectorData, bricks: kind === 'bricks' ? brickCounts(method) : undefined };
}

/** Stick cut list as CSV: one row per length, then the stock summary. */
export function cutListCsv(method: MethodResult, units = 'mm'): string {
  const k = method.kit;
  const rows = ['label,length_mm,count'];
  for (const s of k?.sticks ?? []) rows.push(`${s.label},${s.length.toFixed(1)},${s.count}`);
  rows.push('');
  if (k?.stickProfile) rows.push(`profile,"${k.stickProfile}"`);
  if (k?.stickStock) rows.push(`stock_length_mm,${k.stickStock.length}`, `stock_pieces,${k.stickStock.pieces}`, `waste_mm,${Math.round(k.stickStock.waste)}`);
  rows.push(`total_sticks,${(k?.sticks ?? []).reduce((a, s) => a + s.count, 0)}`, `units,${units}`, `"${COPYRIGHT_LINE}"`);
  return rows.join('\n');
}


export function brickCounts(method: MethodResult) {
  const plate = method.kit?.brickUnit === 'plate';
  const m = new Map<string, { w: number; d: number; plate: boolean; shape: 'rect' | 'round' | 'corner'; count: number }>();
  for (const b of method.kit?.bricks ?? []) {
    const k = brickKind(b, plate);
    const e = m.get(k.key) ?? { w: k.w, d: k.d, plate, shape: k.shape, count: 0 };
    e.count++;
    m.set(k.key, e);
  }
  return [...m.values()].sort((a, b) => b.w * b.d - a.w * a.d);
}

/** Bill of materials: one row per part and colour, with the LDraw/BrickLink part number. */
export function brickBom(method: MethodResult) {
  const plate = method.kit?.brickUnit === 'plate';
  const m = new Map<string, { part: string; size: string; color: number; count: number }>();
  for (const b of method.kit?.bricks ?? []) {
    const k = brickKind(b, plate);
    const key = `${k.part}/${b.color}`;
    const e = m.get(key) ?? { part: k.part, size: k.label, color: b.color, count: 0 };
    e.count++;
    m.set(key, e);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

export function bomCsv(method: MethodResult): string {
  const name = new Map(LEGO_COLORS.map((c) => [c.code, c.name]));
  const rows = ['part,size,ldraw_colour,colour,count'];
  for (const r of brickBom(method)) rows.push(`${r.part},${r.size},${r.color},"${name.get(r.color) ?? r.color}",${r.count}`);
  rows.push('', `"${COPYRIGHT_LINE}"`);
  return rows.join('\n');
}

/**
 * LDraw model. LDraw is y-down, 20 LDU per stud, 24 per brick and 8 per
 * plate; parts have their long side on X and their origin at the top centre.
 * Our (x, y, up) maps to (X, Z, −Y), a proper rotation, so nothing is mirrored.
 * Each layer is one STEP, so LDraw viewers and LeoCAD show it as instructions.
 */
export function ldraw(method: MethodResult, title: string): string {
  const plate = method.kit?.brickUnit === 'plate';
  const U = plate ? 8 : 24;
  const list = [...(method.kit?.bricks ?? [])].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
  const out = [
    `0 ${title}`,
    `0 Name: ${title.replace(/[^\w.-]+/g, '_')}.ldr`,
    `0 Author: ${AUTHOR} [${APP_NAME}]`,
    `0 !LICENSE ${COPYRIGHT_LINE}`,
    `0 // ${list.length} ${plate ? 'plates' : 'bricks'}, ${list.length ? list[list.length - 1].z + 1 : 0} layers`,
    '',
  ];
  let layer = list[0]?.z ?? 0;
  for (const b of list) {
    if (b.z !== layer) {
      out.push('0 STEP');
      layer = b.z;
    }
    const k = brickKind(b, plate);
    if (k.part === '?') continue;
    const Y = -(b.z + 1) * U;
    if (k.shape === 'corner') {
      // Origin at the corner stud, arms along +X and +Z; turn about Y to match.
      const [ci, cj] = cornerCells(b.rot ?? 0)[0];
      const rots = ['1 0 0 0 1 0 0 0 1', '0 0 -1 0 1 0 1 0 0', '-1 0 0 0 1 0 0 0 -1', '0 0 1 0 1 0 -1 0 0'];
      out.push(`1 ${b.color} ${(b.x + ci + 0.5) * 20} ${Y} ${(b.y + cj + 0.5) * 20} ${rots[(b.rot ?? 0) & 3]} ${k.part}.dat`);
      continue;
    }
    const X = (b.x + b.w / 2) * 20;
    const Z = (b.y + b.d / 2) * 20;
    // Long side along X as drawn; turn 90° about Y when the brick runs along our y.
    const rot = b.w >= b.d ? '1 0 0 0 1 0 0 0 1' : '0 0 1 0 1 0 -1 0 0';
    out.push(`1 ${b.color} ${X} ${Y} ${Z} ${rot} ${k.part}.dat`);
  }
  out.push('0 STEP', '');
  return out.join('\r\n');
}

const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Layer-by-layer building instructions: a parts page, then one plan per layer with the layer below in grey. */
export function brickInstructions(method: MethodResult, title: string): Blob {
  const list = method.kit?.bricks ?? [];
  const plate = method.kit?.brickUnit === 'plate';
  const hex = new Map(LEGO_COLORS.map((c) => [c.code, c]));
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `${title} · building instructions`, creator: APP_NAME, author: `${AUTHOR} (${AUTHOR_EMAIL})`, subject: COPYRIGHT_LINE });
  const W = 210, H = 297, M = 14;
  const footer = (n: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(COPYRIGHT_LINE, M, H - 7);
    doc.text(String(n), W - M, H - 7, { align: 'right' });
  };
  let page = 1;

  // Parts page
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text(title, M, M + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  const layers = list.length ? Math.max(...list.map((b) => b.z)) + 1 : 0;
  doc.text(`${list.length} ${plate ? 'plates' : 'bricks'} · ${layers} layers · LDraw part numbers (also used by BrickLink)`, M, M + 13);
  doc.setFontSize(9);
  let y = M + 24;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(60);
  doc.text('Part', M + 8, y);
  doc.text('Size', M + 30, y);
  doc.text('Colour', M + 50, y);
  doc.text('Count', W - M, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20);
  y += 6;
  for (const r of brickBom(method)) {
    if (y > H - 20) {
      footer(page++);
      doc.addPage();
      y = M + 6;
    }
    const c = hex.get(r.color);
    doc.setFillColor(...hexRgb(c?.hex ?? '#888888'));
    doc.rect(M, y - 3.2, 4, 4, 'F');
    doc.text(r.part, M + 8, y);
    doc.text(r.size + (plate ? ' plate' : ''), M + 30, y);
    doc.text(c?.name ?? String(r.color), M + 50, y);
    doc.text(String(r.count), W - M, y, { align: 'right' });
    y += 6;
  }
  footer(page++);

  // One plan per layer
  if (!list.length) return doc.output('blob');
  const minX = Math.min(...list.map((b) => b.x)), maxX = Math.max(...list.map((b) => b.x + b.w));
  const minY = Math.min(...list.map((b) => b.y)), maxY = Math.max(...list.map((b) => b.y + b.d));
  const nx = maxX - minX, ny = maxY - minY;
  const boxW = W - 2 * M, boxH = H - 2 * M - 26;
  const s = Math.min(boxW / nx, boxH / ny, 8);
  const ox = M + (boxW - nx * s) / 2, oy = M + 20;
  const byLayer = new Map<number, BrickPlacement[]>();
  for (const b of list) byLayer.set(b.z, [...(byLayer.get(b.z) ?? []), b]);
  for (let z = 0; z < layers; z++) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(20);
    doc.text(`Layer ${z + 1} of ${layers}`, M, M + 6);
    const cur = byLayer.get(z) ?? [];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`${cur.length} ${plate ? 'plates' : 'bricks'} · one square = one stud · the layer below is shown in grey`, M, M + 12);
    // Stud grid
    doc.setDrawColor(225);
    doc.setLineWidth(0.1);
    if (s >= 2) {
      for (let i = 0; i <= nx; i++) doc.line(ox + i * s, oy, ox + i * s, oy + ny * s);
      for (let j = 0; j <= ny; j++) doc.line(ox, oy + j * s, ox + nx * s, oy + j * s);
    }
    // Layer below
    doc.setFillColor(228, 228, 228);
    doc.setDrawColor(200);
    const cell = (gx: number, gy: number, inset: number, style: 'F' | 'FD') => doc.rect(ox + (gx - minX) * s + inset, oy + (maxY - gy - 1) * s + inset, s - 2 * inset, s - 2 * inset, style);
    for (const b of byLayer.get(z - 1) ?? []) {
      if (b.shape === 'corner') for (const [gx, gy] of brickCells(b)) cell(gx, gy, 0, 'FD');
      else doc.rect(ox + (b.x - minX) * s, oy + (maxY - b.y - b.d) * s, b.w * s, b.d * s, 'FD');
    }
    // This layer
    doc.setDrawColor(30);
    doc.setLineWidth(Math.min(0.35, s * 0.06));
    for (const b of cur) {
      const c = hex.get(b.color);
      doc.setFillColor(...hexRgb(c?.hex ?? '#888888'));
      const x = ox + (b.x - minX) * s, yy = oy + (maxY - b.y - b.d) * s;
      if (b.shape === 'round') doc.circle(x + (b.w * s) / 2, yy + (b.d * s) / 2, (b.w * s) / 2 - 0.2, 'FD');
      else if (b.shape === 'corner') {
        // Fill the three cells, then outline the L.
        for (const [gx, gy] of brickCells(b)) cell(gx, gy, 0.15, 'F');
        const [ci, cj] = cornerCells(b.rot ?? 0)[0];
        const sx = ci === 0 ? 1 : -1, sy = cj === 0 ? 1 : -1;
        const P0 = (gx: number, gy: number): [number, number] => [ox + (gx - minX) * s, oy + (maxY - gy) * s];
        const cx = b.x + ci + (ci === 0 ? 0 : 1), cy = b.y + cj + (cj === 0 ? 0 : 1);
        const pts = [P0(cx, cy), P0(cx + 2 * sx, cy), P0(cx + 2 * sx, cy + sy), P0(cx + sx, cy + sy), P0(cx + sx, cy + 2 * sy), P0(cx, cy + 2 * sy)];
        doc.lines(pts.slice(1).map((q, n) => [q[0] - pts[n][0], q[1] - pts[n][1]]), pts[0][0], pts[0][1], [1, 1], 'S', true);
      } else doc.rect(x + 0.15, yy + 0.15, b.w * s - 0.3, b.d * s - 0.3, 'FD');
      if (s >= 4 && b.shape !== 'corner') {
        doc.setFontSize(Math.min(7, s * 0.9));
        const rgb = hexRgb(c?.hex ?? '#888888');
        doc.setTextColor(rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11 > 140 ? 20 : 250);
        doc.text(b.shape === 'round' ? 'o' : `${Math.min(b.w, b.d)}×${Math.max(b.w, b.d)}`, x + (b.w * s) / 2, yy + (b.d * s) / 2 + 1, { align: 'center' });
      }
    }
    footer(page++);
  }
  return doc.output('blob');
}
