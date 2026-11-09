/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/// <reference lib="webworker" />
/**
 * All heavy geometry runs here so the interface never stalls. The worker
 * keeps the last result of every stage and only recomputes stages whose
 * inputs changed (see stageKeys).
 */
import * as Comlink from 'comlink';
import type { ProjectParams } from '../core/params';
import type { MeshData, MethodResult, NestResult } from '../core/types';
import { buildBase, prepareSurface, runMethod, runNest, stageKeys } from '../core/pipeline';
import { buildConnector, type ConnectorPart, type ConnectorSpec } from '../core/connectors/connectors';
import { remesh } from '../core/mesh/remesh';
import type { ManifoldToplevel } from 'manifold-3d';

export interface ComputeResult {
  keys: ReturnType<typeof stageKeys>;
  base?: MeshData;
  surface?: MeshData;
  method?: MethodResult;
  nest?: NestResult;
  warnings: string[];
  timings: Record<string, number>;
}

const assets = new Map<string, MeshData>();
const cache: {
  base?: { key: string; mesh: MeshData };
  surface?: { key: string; mesh: MeshData; warnings: string[] };
  method?: { key: string; result: MethodResult };
  nest?: { key: string; result: NestResult };
} = {};

let manifold: Promise<ManifoldToplevel> | null = null;
function getManifold() {
  if (!manifold) {
    manifold = (async () => {
      const [{ default: Module }, { default: wasmUrl }] = await Promise.all([
        import('manifold-3d'),
        import('manifold-3d/manifold.wasm?url'),
      ]);
      const wasm = await Module({ locateFile: () => wasmUrl });
      wasm.setup();
      return wasm;
    })();
  }
  return manifold;
}

const api = {
  setAsset(id: string, mesh: MeshData) {
    assets.set(id, mesh);
  },
  hasAsset(id: string) {
    return assets.has(id);
  },

  /**
   * Run the pipeline up to `until`. Only stages whose key differs from what
   * the caller already has (`known`) are sent back.
   */
  async compute(
    p: ProjectParams,
    known: Partial<ReturnType<typeof stageKeys>>,
    until: 'surface' | 'method' | 'nest',
    onProgress?: (stage: string, f: number) => void,
  ): Promise<ComputeResult> {
    const keys = stageKeys(p);
    const out: ComputeResult = { keys, warnings: [], timings: {} };
    const t = () => performance.now();
    let t0 = t();
    if (cache.base?.key !== keys.base) {
      onProgress?.('Building shape', 0);
      const asset = p.shape.meshAsset ? assets.get(p.shape.meshAsset) : undefined;
      if (p.shape.source === 'mesh' && !asset) out.warnings.push('The imported model is missing. Import it again.');
      cache.base = { key: keys.base, mesh: buildBase(p.shape, asset) };
      out.timings.base = t() - t0;
    }
    if (known.base !== keys.base) out.base = cache.base.mesh;
    t0 = t();
    if (cache.surface?.key !== keys.surface) {
      const r = prepareSurface(cache.base.mesh, p.surface, onProgress);
      cache.surface = { key: keys.surface, mesh: r.mesh, warnings: r.warnings };
      out.timings.surface = t() - t0;
    }
    out.warnings.push(...cache.surface.warnings);
    if (known.surface !== keys.surface) out.surface = cache.surface.mesh;
    if (until === 'surface') return out;
    t0 = t();
    if (cache.method?.key !== keys.method) {
      onProgress?.('Building parts', 0);
      cache.method = { key: keys.method, result: runMethod(cache.surface.mesh, p, onProgress) };
      out.timings.method = t() - t0;
    }
    if (known.method !== keys.method) out.method = cache.method.result;
    if (until === 'method') return out;
    t0 = t();
    if (cache.nest?.key !== keys.nest) {
      onProgress?.('Nesting', 0);
      cache.nest = { key: keys.nest, result: runNest(cache.method.result, p, onProgress) };
      out.timings.nest = t() - t0;
    }
    if (known.nest !== keys.nest) out.nest = cache.nest.result;
    onProgress?.('Ready', 1);
    return out;
  },

  async connectors(spec: ConnectorSpec, data: MethodResult['connectorData'], limit = Infinity): Promise<ConnectorPart[]> {
    const W = await getManifold();
    const d = data && data.hubs && Number.isFinite(limit) ? { ...data, hubs: data.hubs.slice(0, limit) } : data;
    return buildConnector(W, spec, d);
  },

  remesh(mesh: MeshData, edge: number, iterations = 3): MeshData {
    return remesh(mesh, { targetEdge: edge, iterations });
  },
};

export type GeometryApi = typeof api;
Comlink.expose(api);
