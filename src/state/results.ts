/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { create } from 'zustand';
import type { MeshData, MethodResult, NestResult, Part2D } from '@/core/types';

export interface ResultsState {
  keys: { base?: string; surface?: string; method?: string; nest?: string };
  base: MeshData | null;
  surface: MeshData | null;
  method: MethodResult | null;
  nest: NestResult | null;
  partIndex: Map<string, Part2D>;
  busy: boolean;
  stage: string;
  progress: number;
  warnings: string[];
  error: string | null;
  timings: Record<string, number>;
  /** Which stages are stale (inputs changed, recompute pending). */
  stale: { surface: boolean; method: boolean; nest: boolean };
}

export const useResults = create<ResultsState>(() => ({
  keys: {},
  base: null,
  surface: null,
  method: null,
  nest: null,
  partIndex: new Map(),
  busy: false,
  stage: 'Starting',
  progress: 0,
  warnings: [],
  error: null,
  timings: {},
  stale: { surface: true, method: true, nest: true },
}));
