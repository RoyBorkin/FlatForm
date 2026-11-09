/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Everything that has to be 3D printed for the current build — junction hubs,
 * clips, cardboard connectors, printed pins and spacers, LEGO-compatible
 * bricks, and the sheet parts themselves when the making process is 3D print —
 * laid out on print beds. Built on demand for the Print view.
 */
import { create } from 'zustand';
import type { MeshData, MethodResult, NestResult, Part2D } from '@/core/types';
import type { ProjectParams } from '@/core/params';
import { geometry } from './engine';
import { printedKit, kitRequest } from '@/io/export/kitExports';
import { partExtrusion } from '@/viewport/geometry';

export interface PrintItem {
  key: string;
  name: string;
  /** Family shown in the list: hubs, clips, bricks, sheet parts… */
  group: string;
  count: number;
  mesh: MeshData;
  /** Footprint and height after laying flat (mm). */
  w: number;
  d: number;
  h: number;
  /** Shift that puts the mesh's min corner at the origin. */
  offset: [number, number, number];
  volume: number; // mm³
  ids?: string[];
}

export interface PlacedCopy {
  item: number;
  plate: number;
  x: number;
  y: number;
  /** Rotated 90° about z to fit. */
  rot: boolean;
}

export interface PrintLayout {
  items: PrintItem[];
  copies: PlacedCopy[];
  plates: number;
  bed: { w: number; h: number };
  /** Items that do not fit the bed even alone. */
  oversize: string[];
  /** Sheet parts printed as plates (3D-print making), drawn from the nest. */
  sheetPlates: { index: number; parts: { part: Part2D; x: number; y: number; rot: number }[] }[];
  thickness: number;
}

function meshStats(m: MeshData) {
  const p = m.positions, I = m.indices;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]);
    maxX = Math.max(maxX, p[i]);
    minY = Math.min(minY, p[i + 1]);
    maxY = Math.max(maxY, p[i + 1]);
    minZ = Math.min(minZ, p[i + 2]);
    maxZ = Math.max(maxZ, p[i + 2]);
  }
  let vol = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    vol += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return { w: maxX - minX, d: maxY - minY, h: maxZ - minZ, offset: [-minX, -minY, -minZ] as [number, number, number], volume: Math.abs(vol) };
}

const item = (key: string, name: string, group: string, count: number, mesh: MeshData, ids?: string[]): PrintItem => ({ key, name, group, count, mesh, ids, ...meshStats(mesh) });

/** Collect the printed parts of the current build. */
export async function collectPrintItems(p: ProjectParams, method: MethodResult, onProgress?: (f: number, s: string) => void): Promise<PrintItem[]> {
  const out: PrintItem[] = [];
  const kit = printedKit(p, method);
  if (kit) {
    onProgress?.(0.1, 'Building printed parts');
    const group = kit === 'junction' ? 'Junction hubs' : kit === 'crossing' ? 'Crossing clips' : 'Cardboard connectors';
    for (const k of await geometry().kit(kitRequest(p, method, kit))) out.push(item(`${kit}:${k.name}`, k.name, group, k.count, k.mesh, k.ids));
  }
  if (method.kit?.bricks?.length) {
    onProgress?.(0.4, 'Building bricks');
    for (const k of await geometry().kit(kitRequest(p, method, 'bricks'))) out.push(item(`brick:${k.name}`, k.name, 'LEGO-compatible bricks', k.count, k.mesh));
  }
  const spacers = p.method === 'layers' && p.layers.spacer.enabled && !!method.connectorData?.spacers?.length;
  if (p.joinery.kind === 'printed' || spacers) {
    onProgress?.(0.6, 'Building connectors');
    const parts = await geometry().connectors(
      {
        kind: spacers ? 'spacer' : p.joinery.printed.connector,
        printed: p.joinery.printed,
        thickness: p.material.thickness,
        layers: p.method === 'lattice' ? p.lattice.layers.filter((l) => l.enabled).length : 1,
        stripWidth: p.lattice.stripWidth,
      },
      method.connectorData,
    );
    for (const c of parts) out.push(item(`conn:${c.name}`, c.name, spacers ? 'Layer spacers' : 'Printed connectors', c.count, c.mesh));
  }
  return out.filter((x) => x.count > 0 && x.mesh.indices.length > 0);
}

/**
 * Shelf packing onto beds: copies sorted by depth, laid in rows; a copy is
 * turned 90° when that fits a row better. Duplicates are expanded unless
 * `unique` is set, which lays out one of each.
 */
export function packPlates(items: PrintItem[], bed: { w: number; h: number }, unique: boolean, gap = 4, firstPlate = 0) {
  const copies: PlacedCopy[] = [];
  const oversize: string[] = [];
  const list: { item: number; w: number; d: number }[] = [];
  items.forEach((it, i) => {
    const n = unique ? 1 : it.count;
    const fits = (it.w <= bed.w && it.d <= bed.h) || (it.d <= bed.w && it.w <= bed.h);
    if (!fits) oversize.push(it.name);
    for (let k = 0; k < n; k++) list.push({ item: i, w: it.w, d: it.d });
  });
  list.sort((a, b) => Math.max(b.w, b.d) - Math.max(a.w, a.d));
  let plate = firstPlate, x = 0, y = 0, row = 0;
  // In "one of each" mode everything goes on one long catalogue strip instead of beds.
  const W = unique ? Math.max(bed.w, Math.sqrt(list.reduce((s, c) => s + (c.w + gap) * (c.d + gap), 0)) * 1.3) : bed.w;
  const H = unique ? Infinity : bed.h;
  for (const c of list) {
    // Lay long side along x unless it does not fit.
    let rot = c.d > c.w && c.d <= W;
    let w = rot ? c.d : c.w, d = rot ? c.w : c.d;
    if (w > W && d <= W) {
      rot = !rot;
      [w, d] = [d, w];
    }
    if (x > 0 && x + w > W) {
      x = 0;
      y += row + gap;
      row = 0;
    }
    if (y > 0 && y + d > H) {
      plate++;
      x = 0;
      y = 0;
      row = 0;
    }
    copies.push({ item: c.item, plate, x, y, rot });
    x += w + gap;
    row = Math.max(row, d);
  }
  return { copies, plates: list.length ? plate - firstPlate + 1 : 0, oversize, width: W, height: unique ? y + row : bed.h };
}

interface PrintState {
  key: string | null;
  busy: boolean;
  error: string | null;
  items: PrintItem[];
  unique: boolean;
  set: (s: Partial<PrintState>) => void;
}

export const usePrint = create<PrintState>((set) => ({ key: null, busy: false, error: null, items: [], unique: false, set: (s) => set(s) }));

let running: Promise<void> | null = null;

/** (Re)build the printed parts when the build changed. */
export async function ensurePrintItems(p: ProjectParams, method: MethodResult, key: string) {
  const st = usePrint.getState();
  if (st.key === key || running) return;
  usePrint.setState({ busy: true, error: null });
  running = (async () => {
    try {
      const items = await collectPrintItems(p, method);
      usePrint.setState({ items, key, busy: false });
    } catch (e) {
      usePrint.setState({ error: e instanceof Error ? e.message : String(e), busy: false, key });
    } finally {
      running = null;
    }
  })();
  await running;
  // The build may have changed while this ran.
}

/** Sheet parts as printed plates, straight from the nest (3D-print making only). */
export function sheetPlates(p: ProjectParams, nest: NestResult | null, parts: Map<string, Part2D>): PrintLayout['sheetPlates'] {
  if (p.manufacturing.process !== 'print3d' || !nest) return [];
  return nest.sheets.map((s) => ({
    index: s.index,
    parts: s.placements.map((pl) => ({ part: parts.get(pl.partId)!, x: pl.x, y: pl.y, rot: pl.rot })).filter((q) => q.part),
  }));
}

/** The full layout: sheet plates first (3D-print making), then the printed parts. */
export function printLayout(p: ProjectParams, nest: NestResult | null, partIndex: Map<string, Part2D>, items: PrintItem[], unique: boolean) {
  const bed = { w: p.manufacturing.print.bedW, h: p.manufacturing.print.bedH };
  const sheets = unique ? [] : sheetPlates(p, nest, partIndex);
  const pack = packPlates(items, bed, unique, 4, sheets.length);
  const plates = unique ? 1 : sheets.length + pack.plates;
  const cols = unique ? 1 : Math.max(1, Math.ceil(Math.sqrt(plates * 1.2)));
  return { bed, sheets, pack, plates, cols };
}

export { partExtrusion };
