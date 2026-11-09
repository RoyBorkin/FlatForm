/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { useEffect, useState } from 'react';
import { useTasks } from '@/state/tasks';
import { useResults } from '@/state/results';

/** How long a recompute must run before it is shown as a task. */
const COMPUTE_DELAY = 700;

/**
 * Floating progress card for anything slow: exports, printed connectors, the
 * assembly guide, and recomputes that take longer than a moment. It never
 * blocks the interface; edits made while it shows simply queue a new run.
 */
export function TaskOverlay() {
  const tasks = useTasks((s) => s.tasks);
  const busy = useResults((s) => s.busy);
  const stage = useResults((s) => s.stage);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), COMPUTE_DELAY);
    return () => clearTimeout(t);
  }, [busy]);
  const rows = [...tasks.map((t) => ({ key: `t${t.id}`, label: t.label, detail: t.detail, progress: t.progress })), ...(slow && stage !== 'Ready' ? [{ key: 'compute', label: 'Building', detail: stage, progress: null as number | null }] : [])];
  if (!rows.length) return null;
  return (
    <div className="task-overlay" role="status" aria-live="polite">
      {rows.map((r) => (
        <div className="task" key={r.key}>
          <span className="task__spinner" aria-hidden />
          <span className="task__text">
            <span className="task__label">{r.label}</span>
            {r.detail && <span className="task__detail">{r.detail}</span>}
          </span>
          <span className="task__bar" data-indeterminate={r.progress == null} aria-hidden>
            <span style={r.progress == null ? undefined : { transform: `scaleX(${Math.max(0.04, Math.min(1, r.progress))})` }} />
          </span>
          {r.progress != null && <span className="task__pct">{Math.round(r.progress * 100)}%</span>}
        </div>
      ))}
    </div>
  );
}
