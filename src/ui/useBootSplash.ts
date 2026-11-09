/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { useEffect } from 'react';
import { useResults } from '@/state/results';

/**
 * The splash in index.html covers the first load (scripts, fonts, WASM and the
 * first geometry run). It fades out once the first parts exist, on an error,
 * or after a safety timeout.
 */
export function useBootSplash() {
  const ready = useResults((s) => !!s.method || !!s.error);
  const stage = useResults((s) => s.stage);
  useEffect(() => {
    const el = document.getElementById('boot');
    const label = document.getElementById('boot-stage');
    if (label && stage) label.textContent = stage;
    if (!el || !ready) return;
    el.dataset.state = 'done';
    const t = setTimeout(() => el.remove(), 450);
    return () => clearTimeout(t);
  }, [ready, stage]);
  useEffect(() => {
    const t = setTimeout(() => {
      const el = document.getElementById('boot');
      if (el) {
        el.dataset.state = 'done';
        setTimeout(() => el.remove(), 450);
      }
    }, 20000);
    return () => clearTimeout(t);
  }, []);
}
