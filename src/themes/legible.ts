/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/** Colour helpers: keep user-chosen part colours readable on dark and light grounds. */
const hex = (c: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** WCAG relative luminance, 0..1. */
export function luminance(c: string): number {
  const rgb = hex(c);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function mix(a: string, b: string, t: number): string {
  const x = hex(a), y = hex(b);
  if (!x || !y) return a;
  return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

/** Lift very deep colours on dark grounds (navy on graphite) and deepen very pale ones on light grounds. */
export function legible(c: string, mode: 'dark' | 'light'): string {
  const L = luminance(c);
  if (mode === 'dark' && L < 0.09) return mix(c, '#ffffff', Math.min(0.55, (0.09 - L) * 6 + 0.3));
  if (mode === 'light' && L > 0.8) return mix(c, '#000000', 0.25);
  return c;
}
