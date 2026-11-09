import { useEffect, useState } from 'react';
import { useUI } from '@/state/ui';

/** Read a CSS custom property from the root, refreshing when the theme changes. */
export function useCssVar(name: string): string {
  const world = useUI((s) => s.settings.world);
  const mode = useUI((s) => s.settings.mode);
  const [v, setV] = useState(() => readVar(name));
  useEffect(() => {
    // Wait one frame so the root data-attributes have been applied.
    const id = requestAnimationFrame(() => setV(readVar(name)));
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => requestAnimationFrame(() => setV(readVar(name)));
    mq.addEventListener('change', on);
    return () => {
      cancelAnimationFrame(id);
      mq.removeEventListener('change', on);
    };
  }, [name, world, mode]);
  return v;
}

export function readVar(name: string): string {
  if (typeof document === 'undefined') return '#000';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}
