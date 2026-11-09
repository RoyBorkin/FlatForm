/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { useMemo } from 'react';
import { legible } from '@/themes/legible';
import { create } from 'zustand';
import type { Mode, WorldId } from '@/themes/themes';
import { WORLDS } from '@/themes/themes';

export type StepId = 'shape' | 'surface' | 'method' | 'joinery' | 'material' | 'nest' | 'export' | 'settings';
export type ViewId = '3d' | 'flat' | 'sheets';
export type ShapeTool = 'build' | 'sculpt';
export type SculptBrush = 'draw' | 'inflate' | 'smooth' | 'flatten' | 'grab' | 'pinch' | 'erase';

export interface Settings {
  world: WorldId;
  mode: Mode | 'system';
  layerColors: Record<WorldId, string[]>;
  colorBy: 'layer' | 'material';
  showGrid: boolean;
  showShadows: boolean;
  autoCompute: boolean;
}

const SETTINGS_KEY = 'flatform.settings.v2';

export const defaultSettings = (): Settings => ({
  world: 'modelshop',
  mode: 'dark',
  layerColors: Object.fromEntries(WORLDS.map((w) => [w.id, [...w.layerColors]])) as Record<WorldId, string[]>,
  colorBy: 'layer',
  showGrid: true,
  showShadows: true,
  autoCompute: true,
});

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const d = defaultSettings();
      return { ...d, ...s, layerColors: { ...d.layerColors, ...(s.layerColors ?? {}) } };
    }
  } catch {
    /* ignore */
  }
  return defaultSettings();
}

export interface Overlays {
  base: boolean;
  wire: boolean;
  clusters: boolean;
  maze: boolean;
  parts: boolean;
  pins: boolean;
  hiddenGroups: number[];
}

interface UIState {
  step: StepId;
  view: ViewId;
  shapeTool: ShapeTool;
  brush: { kind: SculptBrush; radius: number; strength: number; symmetryX: boolean };
  overlays: Overlays;
  selectedPart: string | null;
  hoveredPart: string | null;
  selectedNode: number | null;
  settings: Settings;
  /** 'system' resolved to the actual mode in use. */
  resolvedMode: 'dark' | 'light';
  exportOpen: boolean;
  setStep: (s: StepId) => void;
  setView: (v: ViewId) => void;
  set: (p: Partial<Omit<UIState, 'set' | 'setStep' | 'setView' | 'setSettings' | 'setOverlay'>>) => void;
  setSettings: (fn: (s: Settings) => void) => void;
  setOverlay: (k: keyof Omit<Overlays, 'hiddenGroups'>, v: boolean) => void;
}

export const useUI = create<UIState>((set) => ({
  step: 'shape',
  view: '3d',
  shapeTool: 'build',
  brush: { kind: 'draw', radius: 40, strength: 0.5, symmetryX: true },
  overlays: { base: true, wire: true, clusters: true, maze: true, parts: true, pins: true, hiddenGroups: [] },
  selectedPart: null,
  hoveredPart: null,
  selectedNode: null,
  settings: loadSettings(),
  exportOpen: false,
  resolvedMode: 'dark',
  setStep: (step) => set({ step }),
  setView: (view) => set({ view }),
  set: (p) => set(p as Partial<UIState>),
  setSettings: (fn) =>
    set((s) => {
      const next = structuredClone(s.settings);
      fn(next);
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return { settings: next };
    }),
  setOverlay: (k, v) => set((s) => ({ overlays: { ...s.overlays, [k]: v } })),
}));

/** Layer colours as chosen, made legible on the current ground (deep colours are lifted in dark mode). */
export function useLayerColors(): string[] {
  const raw = useUI((s) => s.settings.layerColors[s.settings.world]);
  const mode = useUI((s) => s.resolvedMode);
  return useMemo(() => raw.map((c) => legible(c, mode)), [raw, mode]);
}
