/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Long-running tasks the user is waiting on (exports, connectors, the guide,
 * a slow recompute). The task overlay shows them with live progress.
 */
import { create } from 'zustand';

export interface Task {
  id: number;
  label: string;
  /** 0..1, or null while the length is unknown. */
  progress: number | null;
  detail?: string;
}

interface TaskState {
  tasks: Task[];
}

export const useTasks = create<TaskState>(() => ({ tasks: [] }));
let nextId = 1;

export function startTask(label: string): { id: number; update: (progress: number | null, detail?: string) => void; done: () => void } {
  const id = nextId++;
  useTasks.setState((s) => ({ tasks: [...s.tasks, { id, label, progress: null }] }));
  return {
    id,
    update: (progress, detail) => useTasks.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, progress, detail } : t)) })),
    done: () => useTasks.setState((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  };
}

/** Run an async job as a visible task; the overlay clears even if it throws. */
export async function withTask<T>(label: string, fn: (update: (progress: number | null, detail?: string) => void) => Promise<T>): Promise<T> {
  const t = startTask(label);
  try {
    return await fn(t.update);
  } finally {
    t.done();
  }
}
