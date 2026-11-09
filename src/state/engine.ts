/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Drives the geometry worker. Whenever the project changes it recomputes the
 * pipeline in three passes (surface → parts → sheets) so the viewport updates
 * as soon as each stage is ready. Only the newest request ever runs: edits
 * made while the worker is busy collapse into one follow-up run.
 */
import * as Comlink from 'comlink';
import type { GeometryApi } from '@/workers/geometry.worker';
import type { ProjectParams } from '@/core/params';
import type { MeshData, Part2D } from '@/core/types';
import { useProject } from './project';
import { useResults } from './results';
import { useUI } from './ui';
import { getAsset } from './assets';
import { stageKeys } from '@/core/keys';

let worker: Worker | null = null;
let api: Comlink.Remote<GeometryApi> | null = null;

export function geometry(): Comlink.Remote<GeometryApi> {
  if (!api) {
    worker = new Worker(new URL('../workers/geometry.worker.ts', import.meta.url), { type: 'module' });
    api = Comlink.wrap<GeometryApi>(worker);
  }
  return api;
}

let running = false;
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;

async function ensureAsset(p: ProjectParams) {
  const id = p.shape.meshAsset;
  if (p.shape.source !== 'mesh' || !id) return;
  const g = geometry();
  if (await g.hasAsset(id)) return;
  const m = await getAsset(id);
  if (m) await g.setAsset(id, m);
}

export async function uploadAsset(id: string, mesh: MeshData) {
  await geometry().setAsset(id, mesh);
}

async function run() {
  if (running) {
    dirty = true;
    return;
  }
  running = true;
  dirty = false;
  const g = geometry();
  const p = useProject.getState().project;
  const set = useResults.setState;
  set({ busy: true, error: null, progress: 0 });
  const onProgress = Comlink.proxy((stage: string, f: number) => set({ stage, progress: f }));
  try {
    await ensureAsset(p);
    for (const until of ['surface', 'method', 'nest'] as const) {
      if (dirty) break;
      const known = useResults.getState().keys;
      const r = await g.compute(p, known, until, onProgress);
      if (dirty) break;
      const patch: Partial<ReturnType<typeof useResults.getState>> = {
        keys: { ...useResults.getState().keys, base: r.keys.base, surface: r.keys.surface },
        warnings: r.warnings,
        timings: { ...useResults.getState().timings, ...r.timings },
      };
      if (r.base) patch.base = r.base;
      if (r.surface) patch.surface = r.surface;
      if (until !== 'surface') patch.keys = { ...patch.keys, method: r.keys.method };
      if (r.method) {
        patch.method = r.method;
        patch.partIndex = new Map<string, Part2D>(r.method.parts.map((pt) => [pt.id, pt]));
      }
      if (until === 'nest') patch.keys = { ...patch.keys, nest: r.keys.nest };
      if (r.nest) patch.nest = r.nest;
      patch.stale = { surface: false, method: until === 'surface', nest: until !== 'nest' };
      set(patch);
      const sel = useUI.getState().selectedPart;
      if (sel && r.method && !r.method.parts.some((x) => x.id === sel)) useUI.getState().set({ selectedPart: null });
    }
  } catch (e) {
    console.error(e);
    set({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    running = false;
    set({ busy: dirty, stage: dirty ? 'Updating' : 'Ready' });
    if (dirty) schedule(0);
  }
}

export function schedule(delay = 140) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(run, delay);
}

/** Mark which stages are stale right away, so the UI can show it before the worker answers. */
function markStale(p: ProjectParams) {
  const k = stageKeys(p);
  const cur = useResults.getState().keys;
  useResults.setState({
    stale: { surface: k.surface !== cur.surface, method: k.method !== cur.method, nest: k.nest !== cur.nest },
  });
}

export function startEngine() {
  geometry();
  schedule(0);
  useProject.subscribe((s, prev) => {
    if (s.project === prev.project) return;
    markStale(s.project);
    if (useUI.getState().settings.autoCompute) schedule();
  });
}

export const recompute = () => schedule(0);
