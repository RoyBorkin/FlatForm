/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { COPYRIGHT_LINE } from '@/brand';
import { effectiveSheet, estimate } from '@/core/manufacturing/manufacturing';
import { useTasks, withTask } from '@/state/tasks';
/**
 * Every export the app offers, each a small function from current state to a
 * saved file. They all draw from the same sheet geometry, so files match the
 * screen exactly.
 */
import { zipSync, strToU8 } from 'fflate';
import { useProject } from '@/state/project';
import { useResults } from '@/state/results';
import { useUI } from '@/state/ui';
import { sheetDrawings, flatLayout, type SheetDrawing } from '@/core/export/sheetGeometry';
import { writeDxf, type DxfOptions } from '@/core/export/dxf';
import { writeSvg } from '@/core/export/svg';
import { cutLength } from '@/core/parts';
import { sheetsPdf } from './pdfSheets';
import { exportModel, meshGroup, type ModelFormat } from './model3d';
import { bakeAssembly, meshDataToGeometry, partExtrusion } from '@/viewport/geometry';
import { Group, Mesh } from 'three';
import { geometry } from '@/state/engine';
import { pinHoleDiameter } from '@/core/joinery/holes';
import { safeName, saveFile } from '@/platform/save';
import { projectFileBlob } from '@/io/projectFile';
import { toast } from '@/ui/components/toast';
import type { NestResult } from '@/core/types';
import { create } from 'zustand';
import { bomCsv, brickInstructions, cutListCsv, kitRequest, ldraw, printedKit } from './kitExports';

/** Progress of long exports (the assembly guide), shown on its button. */
const TASK_LABEL: Record<string, string> = {
  Connectors: 'Building printable connectors',
  'Assembly guide': 'Writing the assembly guide',
  Bundle: 'Packing everything',
  Project: 'Saving the project',
  'Print plates': 'Building print plates',
  Kit: 'Building printable parts',
  Bricks: 'Building printable bricks',
  Instructions: 'Writing the building instructions',
};

export const useExportProgress = create<{ guide: number | null }>(() => ({ guide: null }));

function ctx() {
  const p = useProject.getState().project;
  const r = useResults.getState();
  const colors = useUI.getState().settings.layerColors[useUI.getState().settings.world];
  if (!r.method || !r.nest) throw new Error('Nothing to export yet. Wait for the parts to finish building.');
  return { p, r, method: r.method, nest: r.nest, parts: r.partIndex, colors, base: safeName(p.name) };
}

function drawings(): SheetDrawing[] {
  const { p, nest, parts } = ctx();
  const M = p.manufacturing;
  const bridges = M.process === 'laser' && M.laser.bridges > 0 ? { count: M.laser.bridges, width: M.laser.bridgeWidth } : M.process === 'cnc' && M.cnc.tabs > 0 ? { count: M.cnc.tabs, width: M.cnc.tabWidth } : undefined;
  return sheetDrawings(nest, parts, effectiveSheet(p), p.material.kerf, bridges);
}

/** Authorship and the settings that matter at the machine, at the top of every DXF. */
function credits(): string[] {
  const p = useProject.getState().project;
  const M = p.manufacturing;
  const how =
    M.process === 'cnc'
      ? `CNC · tool ${M.cnc.toolDiameter} mm${M.cnc.dogbones ? ` · ${M.cnc.dogboneStyle}s` : ''}${M.cnc.tabs ? ` · ${M.cnc.tabs} tabs/outline` : ''}`
      : M.process === 'print3d'
        ? `3D print · ${M.print.material} · bed ${M.print.bedW}×${M.print.bedH} mm`
        : `Laser · kerf ${p.material.kerf} mm${M.laser.bridges ? ` · ${M.laser.bridges} bridges/outline` : ''}`;
  return [COPYRIGHT_LINE, `${p.name} · ${/\d\s*mm/.test(p.material.name) ? p.material.name : `${p.material.name} ${p.material.thickness} mm`} · ${how}`, 'Units: mm. Layers: CUT_INNER, CUT_OUTER, ENGRAVE, SCORE, SHEET, LABELS.'];
}
const dxf = (d: SheetDrawing[], o: DxfOptions) => writeDxf(d, { ...o, comments: credits() });
const svg = (d: SheetDrawing, stroke: number, frame: boolean, title: string) => writeSvg(d, stroke, frame, title, COPYRIGHT_LINE);

/** The flat parts laid out without nesting, as one big "sheet". */
function flatDrawing(): SheetDrawing {
  const { p, method, parts } = ctx();
  const L = flatLayout(method.parts, 10);
  const pseudo: NestResult = { sheets: [{ index: 0, group: 0, width: L.width + 20, height: L.height + 20, utilisation: 0, placements: L.placements.map((pl) => ({ ...pl, x: pl.x + 10, y: pl.y + 10 })) }], unplaced: [] };
  return sheetDrawings(pseudo, parts, { ...p.sheet, kerfCompensation: false }, 0)[0];
}

async function run(label: string, fn: () => Promise<void>) {
  try {
    await withTask(TASK_LABEL[label] ?? `Exporting ${label}`, async () => {
      // Let the overlay paint before heavy synchronous work starts.
      await new Promise((r) => setTimeout(r, 30));
      await fn();
    });
  } catch (e) {
    toast(e instanceof Error ? e.message : `${label} failed`, 'danger');
    console.error(e);
  }
}

const zip = (files: Record<string, Uint8Array | string>) =>
  new Blob([zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])), { level: 6 }).buffer as ArrayBuffer], { type: 'application/zip' });

const blobBytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

export const exporters = {
  dxf: () =>
    run('DXF', async () => {
      const { p, base } = ctx();
      const d = drawings();
      if (p.export.dxfLayout === 'allSheets' || d.length === 1) {
        await saveFile(`${base}-cut.dxf`, dxf(d, { includeSheetFrame: p.export.includeSheetFrame, textAs: p.export.textAs }));
      } else {
        const files: Record<string, string> = {};
        d.forEach((s) => (files[`${base}-sheet-${String(s.index + 1).padStart(2, '0')}.dxf`] = dxf([s], { includeSheetFrame: p.export.includeSheetFrame, textAs: p.export.textAs })));
        await saveFile(`${base}-dxf.zip`, zip(files));
      }
      toast('Cut file exported');
    }),
  svg: () =>
    run('SVG', async () => {
      const { p, base } = ctx();
      const d = drawings();
      if (d.length === 1) await saveFile(`${base}-sheet-01.svg`, svg(d[0], p.export.svgStroke, p.export.includeSheetFrame, p.name));
      else {
        const files: Record<string, string> = {};
        d.forEach((s) => (files[`${base}-sheet-${String(s.index + 1).padStart(2, '0')}.svg`] = svg(s, p.export.svgStroke, p.export.includeSheetFrame, `${p.name} · sheet ${s.index + 1}`)));
        await saveFile(`${base}-svg.zip`, zip(files));
      }
      toast('SVG sheets exported');
    }),
  pdf: () =>
    run('PDF', async () => {
      const { p, base } = ctx();
      await saveFile(`${base}-sheets.pdf`, sheetsPdf(drawings(), p.export.svgStroke, p.export.includeSheetFrame, p.name));
      toast('PDF exported');
    }),
  flat: (format: 'svg' | 'dxf') =>
    run('Flat parts', async () => {
      const { p, base } = ctx();
      const d = flatDrawing();
      if (format === 'svg') await saveFile(`${base}-flat-parts.svg`, svg(d, p.export.svgStroke, false, `${p.name} · flat parts`));
      else await saveFile(`${base}-flat-parts.dxf`, dxf([d], { includeSheetFrame: false, textAs: p.export.textAs }));
      toast('Flat parts exported');
    }),
  model: (format: ModelFormat) =>
    run('3D model', async () => {
      const { method, colors, base } = ctx();
      const blob = await exportModel(bakeAssembly(method, colors), format);
      await saveFile(`${base}-assembled.${format}`, blob);
      toast('Assembled model exported');
    }),
  plates: (format: ModelFormat) =>
    run('Print plates', async () => {
      const { nest, parts, base } = ctx();
      const t = useProject.getState().project.material.thickness;
      const files: Record<string, Uint8Array> = {};
      for (const sheet of nest.sheets) {
        const g = new Group();
        for (const pl of sheet.placements) {
          const part = parts.get(pl.partId);
          const geo = part && partExtrusion(part, t);
          if (!geo) continue;
          const mesh = new Mesh(geo);
          mesh.name = pl.partId;
          mesh.position.set(pl.x, pl.y, 0);
          mesh.rotation.z = pl.rot;
          g.add(mesh);
        }
        files[`${base}-plate-${String(sheet.index + 1).padStart(2, '0')}.${format}`] = await blobBytes(await exportModel(g, format));
      }
      if (nest.sheets.length === 1) {
        const [name, data] = Object.entries(files)[0];
        await saveFile(name, new Blob([data.buffer as ArrayBuffer]));
      } else await saveFile(`${base}-print-plates.zip`, zip(files));
      toast(`${nest.sheets.length} print plate${nest.sheets.length > 1 ? 's' : ''} exported`);
    }),
  original: (format: ModelFormat) =>
    run('Original model', async () => {
      const r = useResults.getState();
      const name = safeName(useProject.getState().project.name);
      if (!r.base) throw new Error('No base model yet.');
      await saveFile(`${name}-base.${format}`, await exportModel(meshGroup(r.base, 'base'), format));
      toast('Base model exported');
    }),
  surface: (format: ModelFormat) =>
    run('Surface', async () => {
      const r = useResults.getState();
      const name = safeName(useProject.getState().project.name);
      if (!r.surface) throw new Error('No surface yet.');
      await saveFile(`${name}-surface.${format}`, await exportModel(meshGroup(r.surface, 'surface'), format));
      toast('Working surface exported');
    }),
  partsList: (format: 'csv' | 'json') =>
    run('Parts list', async () => {
      const { p, method, nest, base } = ctx();
      const where = new Map<string, { sheet: number; x: number; y: number; rot: number }>();
      for (const s of nest.sheets) for (const pl of s.placements) where.set(pl.partId, { sheet: s.index + 1, x: pl.x, y: pl.y, rot: (pl.rot * 180) / Math.PI });
      const rows = method.parts.map((pt) => ({
        id: pt.id,
        group: pt.groupName,
        width_mm: +(pt.bbox.maxX - pt.bbox.minX).toFixed(2),
        height_mm: +(pt.bbox.maxY - pt.bbox.minY).toFixed(2),
        area_mm2: +pt.area.toFixed(1),
        cut_length_mm: +cutLength(pt).toFixed(1),
        holes: pt.holes.length,
        weight_g: +estimate([pt], p).weight.toFixed(1),
        sheet: where.get(pt.id)?.sheet ?? '',
        x_mm: where.has(pt.id) ? +where.get(pt.id)!.x.toFixed(2) : '',
        y_mm: where.has(pt.id) ? +where.get(pt.id)!.y.toFixed(2) : '',
        rotation_deg: where.has(pt.id) ? +where.get(pt.id)!.rot.toFixed(1) : '',
        ...(pt.meta ?? {}),
      }));
      const totalCut = rows.reduce((s, r) => s + r.cut_length_mm, 0);
      const summary = {
        project: p.name,
        method: p.method,
        material: p.material.name,
        density_kg_m3: p.material.density,
        thickness_mm: p.material.thickness,
        sheet_mm: [effectiveSheet(p).width, effectiveSheet(p).height],
        parts: rows.length,
        sheets: nest.sheets.length,
        sheet_utilisation: nest.sheets.map((s) => +s.utilisation.toFixed(3)),
        total_cut_length_m: +(totalCut / 1000).toFixed(2),
        process: p.manufacturing.process,
        est_machine_minutes: +estimate(method.parts, p).minutes.toFixed(1),
        est_weight_g: +estimate(method.parts, p).weight.toFixed(0),
        copyright: COPYRIGHT_LINE,
        est_material_cost: +(nest.sheets.length * p.material.pricePerSheet).toFixed(2),
        hole_diameter_mm: pinHoleDiameter(p.joinery),
        connectors: method.connectorData?.pinCount ?? 0,
        stats: method.stats,
      };
      if (format === 'json') await saveFile(`${base}-parts.json`, JSON.stringify({ summary, parts: rows }, null, 2));
      else {
        const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        const esc = (v: unknown) => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v ?? ''));
        await saveFile(`${base}-parts.csv`, [keys.join(','), ...rows.map((r) => keys.map((k) => esc((r as Record<string, unknown>)[k])).join(','))].join('\n'));
      }
      toast('Parts list exported');
    }),
  connectors: () =>
    run('Connectors', async () => {
      const { p, method, base } = ctx();
      const spacersOnly = p.method === 'layers' && p.layers.spacer.enabled && !!method.connectorData?.spacers?.length;
      if (p.joinery.kind !== 'printed' && !spacersOnly) throw new Error('Choose 3D printed joinery first.');
      const parts = await geometry().connectors(
        {
          kind: p.method === 'layers' && method.connectorData?.spacers?.length ? 'spacer' : p.joinery.printed.connector,
          printed: p.joinery.printed,
          thickness: p.material.thickness,
          layers: p.method === 'lattice' ? p.lattice.layers.filter((l) => l.enabled).length : 1,
          stripWidth: p.lattice.stripWidth,
        },
        method.connectorData,
      );
      const files: Record<string, Uint8Array> = {};
      const counts: string[] = ['name,count'];
      for (const c of parts) {
        files[`${c.name}.stl`] = await blobBytes(await exportModel(meshGroup(c.mesh, c.name), 'stl'));
        counts.push(`${c.name},${c.count}`);
      }
      files['print-list.csv'] = strToU8(counts.join('\n'));
      await saveFile(`${base}-connectors.zip`, zip(files));
      toast(`${parts.length} connector file${parts.length > 1 ? 's' : ''} exported`);
    }),
  /** Printed junction hubs, crossing clips or cardboard connectors, one STL per distinct shape. */
  kit: () =>
    run('Kit', async () => {
      const { p, method, base } = ctx();
      const kind = printedKit(p, method);
      if (!kind) throw new Error('This joinery has no printed parts.');
      const parts = await geometry().kit(kitRequest(p, method, kind));
      if (!parts.length) throw new Error('No printed parts were needed.');
      const files: Record<string, Uint8Array> = {};
      const counts: string[] = ['file,count,for'];
      for (const c of parts) {
        files[`${c.name}.stl`] = await blobBytes(await exportModel(meshGroup(c.mesh, c.name), 'stl'));
        counts.push(`${c.name}.stl,${c.count},"${(c.ids ?? []).slice(0, 40).join(' ')}"`);
      }
      const total = parts.reduce((a, c) => a + c.count, 0);
      counts.push('', `total,${total}`, `"${COPYRIGHT_LINE}"`);
      files['print-list.csv'] = strToU8(counts.join('\n'));
      await saveFile(`${base}-${kind}-kit.zip`, zip(files));
      toast(`${parts.length} file${parts.length > 1 ? 's' : ''} for ${total} printed part${total > 1 ? 's' : ''} exported`);
    }),
  /** Every printed part laid out on beds, one 3MF (or STL) per plate, as shown in the Print view. */
  printPlates: (format: ModelFormat) =>
    run('Print plates', async () => {
      const { printLayout, usePrint, collectPrintItems } = await import('@/state/printPlates');
      const { copyMatrix } = await import('@/viewport/PrintView');
      const p = useProject.getState().project;
      const r = useResults.getState();
      const base = safeName(p.name);
      let items = usePrint.getState().items;
      if (!items.length && r.method) items = await collectPrintItems(p, r.method);
      const L = printLayout(p, r.nest, r.partIndex, items, false);
      if (!L.plates) throw new Error('Nothing to print.');
      const groups = Array.from({ length: L.plates }, () => new Group());
      L.sheets.forEach((sp, k) => {
        for (const q of sp.parts) {
          const geo = partExtrusion(q.part, p.material.thickness);
          if (!geo) continue;
          const mesh = new Mesh(geo);
          mesh.name = q.part.id;
          mesh.position.set(q.x, q.y, 0);
          mesh.rotation.z = q.rot;
          groups[k].add(mesh);
        }
      });
      const geos = items.map((it) => meshDataToGeometry(it.mesh));
      for (const c of L.pack.copies) {
        const mesh = new Mesh(geos[c.item]);
        mesh.name = items[c.item].name;
        mesh.applyMatrix4(copyMatrix(items[c.item], c.x, c.y, c.rot));
        groups[c.plate]?.add(mesh);
      }
      const files: Record<string, Uint8Array> = {};
      for (let k = 0; k < groups.length; k++) {
        if (!groups[k].children.length) continue;
        files[`${base}-print-plate-${String(k + 1).padStart(2, '0')}.${format}`] = await blobBytes(await exportModel(groups[k], format));
      }
      const list = ['file,group,count', ...items.map((it) => `${it.name},"${it.group}",${it.count}`), '', `"${COPYRIGHT_LINE}"`];
      files['print-list.csv'] = strToU8(list.join('\n'));
      await saveFile(`${base}-print-plates.zip`, zip(files));
      toast(`${Object.keys(files).length - 1} print plate${Object.keys(files).length > 2 ? 's' : ''} exported`);
    }),
  cutList: () =>
    run('Cut list', async () => {
      const { method, base } = ctx();
      if (!method.kit?.sticks?.length) throw new Error('No sticks in this build.');
      await saveFile(`${base}-stick-cut-list.csv`, cutListCsv(method));
      toast('Cut list exported');
    }),
  ldraw: () =>
    run('LDraw', async () => {
      const { p, method, base } = ctx();
      if (!method.kit?.bricks?.length) throw new Error('No bricks in this build.');
      await saveFile(`${base}.ldr`, ldraw(method, p.name));
      toast('LDraw model exported. Open it in Studio, LeoCAD or LDView.');
    }),
  brickList: () =>
    run('Brick list', async () => {
      const { method, base } = ctx();
      await saveFile(`${base}-brick-list.csv`, bomCsv(method));
      toast('Brick list exported');
    }),
  brickGuide: () =>
    run('Instructions', async () => {
      const { p, method, base } = ctx();
      if (!method.kit?.bricks?.length) throw new Error('No bricks in this build.');
      await saveFile(`${base}-building-instructions.pdf`, brickInstructions(method, p.name));
      toast('Building instructions exported');
    }),
  printBricks: () =>
    run('Bricks', async () => {
      const { p, method, base } = ctx();
      const parts = await geometry().kit(kitRequest(p, method, 'bricks'));
      const files: Record<string, Uint8Array> = {};
      const counts = ['file,count'];
      for (const c of parts) {
        files[`${c.name}.stl`] = await blobBytes(await exportModel(meshGroup(c.mesh, c.name), 'stl'));
        counts.push(`${c.name}.stl,${c.count}`);
      }
      counts.push('', `"${COPYRIGHT_LINE}"`, '"LEGO-compatible: 8 mm stud grid, 0.1 mm play per side. Print a 2x2 first and tune your printer before printing the rest."');
      files['print-list.csv'] = strToU8(counts.join('\n'));
      await saveFile(`${base}-printable-bricks.zip`, zip(files));
      toast(`${parts.length} brick file${parts.length > 1 ? 's' : ''} exported`);
    }),
  guide: () =>
    run('Assembly guide', async () => {
      const { buildAssemblyGuide } = await import('./assemblyGuide');
      const { base } = ctx();
      useExportProgress.setState({ guide: 0 });
      try {
        await saveFile(
          `${base}-assembly-guide.pdf`,
          await buildAssemblyGuide((f) => {
            useExportProgress.setState({ guide: f });
            const t = useTasks.getState().tasks.at(-1);
            if (t) useTasks.setState((s) => ({ tasks: s.tasks.map((x) => (x.id === t.id ? { ...x, progress: f } : x)) }));
          }),
        );
      } finally {
        useExportProgress.setState({ guide: null });
      }
      toast('Assembly guide exported');
    }),
  project: () =>
    run('Project', async () => {
      const name = safeName(useProject.getState().project.name);
      await saveFile(`${name}.flatform`, await projectFileBlob());
      toast('Project saved');
    }),
  all: () =>
    run('Bundle', async () => {
      const { p, method, colors, base } = ctx();
      const d = drawings();
      const files: Record<string, Uint8Array | string> = {};
      if (d.length) {
        files[`cut/${base}-all-sheets.dxf`] = dxf(d, { includeSheetFrame: p.export.includeSheetFrame, textAs: p.export.textAs });
        d.forEach((s) => {
          const n = String(s.index + 1).padStart(2, '0');
          files[`cut/sheet-${n}.dxf`] = dxf([s], { includeSheetFrame: p.export.includeSheetFrame, textAs: p.export.textAs });
          files[`svg/sheet-${n}.svg`] = svg(s, p.export.svgStroke, p.export.includeSheetFrame, `${p.name} · sheet ${s.index + 1}`);
        });
        files[`${base}-sheets.pdf`] = await blobBytes(sheetsPdf(d, p.export.svgStroke, p.export.includeSheetFrame, p.name));
        files[`flat/${base}-flat-parts.svg`] = svg(flatDrawing(), p.export.svgStroke, false, p.name);
      }
      files[`3d/${base}-assembled.stl`] = await blobBytes(await exportModel(bakeAssembly(method, colors), 'stl'));
      files[`3d/${base}-assembled.glb`] = await blobBytes(await exportModel(bakeAssembly(method, colors), 'glb'));
      if (method.kit?.sticks?.length) files[`${base}-stick-cut-list.csv`] = cutListCsv(method);
      if (method.kit?.bricks?.length) {
        files[`lego/${base}.ldr`] = ldraw(method, p.name);
        files[`lego/${base}-brick-list.csv`] = bomCsv(method);
        files[`lego/${base}-building-instructions.pdf`] = await blobBytes(brickInstructions(method, p.name));
      }
      const r = useResults.getState();
      if (r.base) files[`3d/${base}-base.stl`] = await blobBytes(await exportModel(meshGroup(r.base), 'stl'));
      files[`${base}.flatform`] = await blobBytes(await projectFileBlob());
      await saveFile(`${base}-bundle.zip`, zip(files));
      toast('Bundle exported');
    }),
};
