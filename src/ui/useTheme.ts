/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { useEffect, useState } from 'react';
import { useUI } from '@/state/ui';
import { legible } from '@/themes/legible';

/** Apply world, mode and layer colours to the document root as data attributes and CSS variables. */
export function useTheme() {
  const settings = useUI((s) => s.settings);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    const mode = settings.mode === 'system' ? (systemDark ? 'dark' : 'light') : settings.mode;
    root.dataset.world = settings.world;
    root.dataset.mode = mode;
    settings.layerColors[settings.world].forEach((c, i) => root.style.setProperty(`--layer-${i}`, legible(c, mode)));
    if (useUI.getState().resolvedMode !== mode) useUI.setState({ resolvedMode: mode });
    const meta = document.querySelector('meta[name="theme-color"]');
    requestAnimationFrame(() => meta?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim()));
  }, [settings, systemDark]);
}
