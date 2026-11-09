import { create } from 'zustand';
import { temporal } from 'zundo';
import type { ProjectParams } from '@/core/params';
import { defaultProject } from '@/core/defaults';

interface ProjectStore {
  project: ProjectParams;
  /** Mutate a copy of the project. Undo snapshots are throttled for slider drags. */
  update: (fn: (p: ProjectParams) => void) => void;
  replace: (p: ProjectParams) => void;
}

const AUTOSAVE_KEY = 'sheetform.autosave.v1';

function loadAutosave(): ProjectParams {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as ProjectParams;
      if (p && p.version === 1) return { ...defaultProject(), ...p };
    }
  } catch {
    /* private mode or corrupted: start fresh */
  }
  return defaultProject();
}

function throttle<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  return (...a: A) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...a);
    } else {
      pending = a;
      if (!timer)
        timer = setTimeout(() => {
          timer = null;
          last = Date.now();
          if (pending) fn(...pending);
          pending = null;
        }, ms - (now - last));
    }
  };
}

export const useProject = create<ProjectStore>()(
  temporal(
    (set) => ({
      project: loadAutosave(),
      update: (fn) =>
        set((s) => {
          const next = structuredClone(s.project);
          fn(next);
          return { project: next };
        }),
      replace: (p) => set({ project: p }),
    }),
    {
      limit: 200,
      partialize: (s) => ({ project: s.project }),
      equality: (a, b) => a.project === b.project,
      handleSet: (handleSet) => throttle<Parameters<typeof handleSet>>((...args) => handleSet(...args), 350),
    },
  ),
);

let saveTimer: ReturnType<typeof setTimeout> | null = null;
useProject.subscribe((s) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(s.project));
    } catch {
      /* storage full or unavailable */
    }
  }, 600);
});

export const undo = () => useProject.temporal.getState().undo();
export const redo = () => useProject.temporal.getState().redo();
