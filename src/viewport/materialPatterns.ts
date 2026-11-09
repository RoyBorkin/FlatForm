/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/**
 * Procedural sheet textures for the 2D views, so every sheet is drawn in the
 * stock it will be cut from: plywood grain, brushed metal, acrylic, card…
 */
import type { MaterialParams } from '@/core/params';
import { rng } from '@/core/math/rng';

const cache = new Map<string, HTMLCanvasElement>();

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * k));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) * k));
  const b = Math.min(255, Math.max(0, (n & 255) * k));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function materialTile(m: MaterialParams): HTMLCanvasElement {
  const key = `${m.look}|${m.color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const R = rng(7);
  g.fillStyle = m.color;
  g.fillRect(0, 0, S, S);
  switch (m.look) {
    case 'plywood': {
      for (let i = 0; i < 70; i++) {
        const y = R.range(0, S);
        g.strokeStyle = shade(m.color, R.range(0.82, 0.96));
        g.globalAlpha = R.range(0.25, 0.6);
        g.lineWidth = R.range(0.5, 2.4);
        g.beginPath();
        for (let x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin(x / 40 + i) * 3 + Math.sin(x / 13 + i * 2) * 0.8);
        g.stroke();
      }
      break;
    }
    case 'metal': {
      for (let i = 0; i < 900; i++) {
        g.strokeStyle = R.next() > 0.5 ? '#ffffff' : '#000000';
        g.globalAlpha = R.range(0.02, 0.07);
        const y = R.range(0, S);
        g.beginPath();
        g.moveTo(R.range(-40, S), y);
        g.lineTo(R.range(0, S + 40), y);
        g.stroke();
      }
      break;
    }
    case 'acrylic': {
      const grd = g.createLinearGradient(0, 0, S, S);
      grd.addColorStop(0, 'rgba(255,255,255,0.35)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0)');
      grd.addColorStop(1, 'rgba(255,255,255,0.2)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
      break;
    }
    default: {
      // Card, paper, MDF, felt, plastic: fibre noise of varying strength.
      const strength = m.look === 'felt' ? 0.18 : m.look === 'mdf' ? 0.1 : m.look === 'card' ? 0.08 : 0.04;
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = R.next() > 0.5 ? '#ffffff' : '#000000';
        g.globalAlpha = R.range(0, strength);
        g.fillRect(R.range(0, S), R.range(0, S), R.range(0.5, 2), R.range(0.5, 2));
      }
    }
  }
  g.globalAlpha = 1;
  cache.set(key, c);
  return c;
}
