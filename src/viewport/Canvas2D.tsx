/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/**
 * 2D views: every part flat ("Flat parts") or nested on sheets ("Sheets").
 * Drawn with Canvas 2D from the same geometry the exporters use. Pan with
 * drag, zoom with the wheel, click a part to find it in 3D.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useResults } from '@/state/results';
import { useUI, useLayerColors } from '@/state/ui';
import { useProject } from '@/state/project';
import { flatLayout, placePoint } from '@/core/export/sheetGeometry';
import type { Part2D, Placement } from '@/core/types';
import { pointInPolygon } from '@/core/polygon/polygon';
import { TISSUE_DASH } from '@/themes/themes';
import { materialTile } from './materialPatterns';
import { readVar } from './useCssVar';

interface Item {
  part: Part2D;
  pl: Placement;
  outline: [number, number][];
  box: { minX: number; minY: number; maxX: number; maxY: number };
}
interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  group: number;
}

export function Canvas2D({ mode }: { mode: 'flat' | 'sheets' }) {
  const method = useResults((s) => s.method);
  const nest = useResults((s) => s.nest);
  const parts = useResults((s) => s.partIndex);
  const selected = useUI((s) => s.selectedPart);
  const hovered = useUI((s) => s.hoveredPart);
  const world = useUI((s) => s.settings.world);
  const themeMode = useUI((s) => s.settings.mode);
  const colorBy = useUI((s) => s.settings.colorBy);
  const colors = useLayerColors();
  const material = useProject((s) => s.project.material);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 0 }); // screen = (world - x) * k, y flipped
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Lay out everything in "world" mm coordinates.
  const scene = useMemo(() => {
    const items: Item[] = [];
    const frames: Frame[] = [];
    if (!method) return { items, frames, bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 } };
    const add = (part: Part2D, pl: Placement) => {
      const outline = part.cut[0].map((p) => placePoint(pl, p)) as [number, number][];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of outline) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      items.push({ part, pl, outline, box: { minX, minY, maxX, maxY } });
    };
    if (mode === 'flat') {
      const L = flatLayout(method.parts, 10);
      L.placements.forEach((pl, i) => add(method.parts[i], pl));
      frames.push({ x: -10, y: -10, w: L.width + 20, h: L.height + 20, title: `${method.parts.length} flat parts`, sub: '', group: -1 });
    } else if (nest) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(nest.sheets.length * 1.2)));
      const gap = Math.max(nest.sheets[0]?.width ?? 100, nest.sheets[0]?.height ?? 100) * 0.08;
      nest.sheets.forEach((s, i) => {
        const fx = (i % cols) * (s.width + gap);
        const fy = -Math.floor(i / cols) * (s.height * 1.22 + gap);
        frames.push({ x: fx, y: fy, w: s.width, h: s.height, title: `Sheet ${s.index + 1}`, sub: `${s.placements.length} parts · ${Math.round(s.utilisation * 100)}%`, group: s.group });
        for (const pl of s.placements) {
          const part = parts.get(pl.partId);
          if (part) add(part, { ...pl, x: pl.x + fx, y: pl.y + fy });
        }
      });
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of frames) {
      minX = Math.min(minX, f.x);
      minY = Math.min(minY, f.y);
      maxX = Math.max(maxX, f.x + f.w);
      maxY = Math.max(maxY, f.y + f.h);
    }
    return { items, frames, bounds: { minX, minY, maxX, maxY } };
  }, [method, nest, parts, mode]);

  const fit = useCallback(() => {
    const b = scene.bounds;
    const pad = 48;
    const k = Math.min((size.w - pad * 2) / Math.max(1, b.maxX - b.minX), (size.h - pad * 2) / Math.max(1, b.maxY - b.minY));
    setView({ k, x: (b.minX + b.maxX) / 2 - size.w / 2 / k, y: (b.minY + b.maxY) / 2 + size.h / 2 / k });
  }, [scene.bounds, size]);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const fittedFor = useRef('');
  useEffect(() => {
    const key = `${mode}|${scene.frames.length}|${Math.round(scene.bounds.maxX)}|${size.w > 0}`;
    if (fittedFor.current !== key && size.w > 0) {
      fittedFor.current = key;
      fit();
    }
  }, [scene, mode, size, fit]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      if (e.key === 'f' || e.key === 'F') fit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fit]);

  // ---------------------------------------------------------------- draw
  useEffect(() => {
    const c = canvas.current;
    if (!c || view.k === 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = {
      bg: readVar('--viewport-bg'),
      frame: readVar('--sheet-frame'),
      text: readVar('--text'),
      text2: readVar('--text-2'),
      accent: readVar('--accent'),
      ink: readVar('--text-3'),
      font: readVar('--font-ui'),
      num: readVar('--font-num'),
    };
    g.fillStyle = css.bg;
    g.fillRect(0, 0, size.w, size.h);
    const { k } = view;
    const sx = (x: number) => (x - view.x) * k;
    const sy = (y: number) => (view.y - y) * k;
    const style = world === 'drafting' ? 'drafting' : world === 'tissue' ? 'tissue' : 'material';
    const tile = style === 'material' ? materialTile(material) : null;
    const pattern = tile ? g.createPattern(tile, 'repeat') : null;
    const path = (pts: [number, number][], close = true) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(sx(x), sy(y)) : g.moveTo(sx(x), sy(y))));
      if (close) g.closePath();
    };
    // Sheets
    for (const f of scene.frames) {
      const x = sx(f.x), y = sy(f.y + f.h), w = f.w * k, h = f.h * k;
      if (mode === 'sheets') {
        if (style === 'material' && pattern) {
          g.save();
          g.fillStyle = pattern;
          g.globalAlpha = 0.55;
          g.translate(x, y);
          g.fillRect(0, 0, w, h);
          g.restore();
          g.fillStyle = 'rgba(0,0,0,0.12)';
          g.fillRect(x, y, w, h);
        } else {
          g.fillStyle = style === 'drafting' ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.04)';
          g.fillRect(x, y, w, h);
        }
        g.strokeStyle = css.frame;
        g.lineWidth = 1;
        g.strokeRect(x + 0.5, y + 0.5, w, h);
        g.fillStyle = css.text2;
        g.font = `600 12px ${css.font}`;
        g.fillText(f.title, x, y - 22);
        g.font = `400 11px ${css.num}`;
        g.fillStyle = css.ink;
        g.fillText(f.sub, x, y - 8);
      }
    }
    // Parts
    const detail = k > 1.2;
    for (const it of scene.items) {
      const { part, pl } = it;
      if (sx(it.box.maxX) < 0 || sx(it.box.minX) > size.w || sy(it.box.minY) < 0 || sy(it.box.maxY) > size.h) continue;
      const color = colors[part.group % colors.length];
      const isSel = part.id === selected, isHov = part.id === hovered;
      // Fill
      g.save();
      g.beginPath();
      for (const contour of part.cut) {
        contour.forEach((p, i) => {
          const [x, y] = placePoint(pl, p);
          if (i) g.lineTo(sx(x), sy(y));
          else g.moveTo(sx(x), sy(y));
        });
        g.closePath();
      }
      for (const h of part.holes) {
        const [x, y] = placePoint(pl, [h.x, h.y]);
        g.moveTo(sx(x) + h.r * k, sy(y));
        g.arc(sx(x), sy(y), h.r * k, 0, Math.PI * 2, true);
      }
      if (style === 'material' && pattern && colorBy === 'material') {
        g.fillStyle = pattern;
        g.fill('evenodd');
      } else {
        g.fillStyle = color;
        g.globalAlpha = style === 'material' ? 0.32 : 0.14;
        g.fill('evenodd');
        g.globalAlpha = 1;
      }
      if (isSel || isHov) {
        g.fillStyle = css.accent;
        g.globalAlpha = isSel ? 0.45 : 0.25;
        g.fill('evenodd');
        g.globalAlpha = 1;
      }
      // Cut lines
      g.strokeStyle = isSel ? css.accent : color;
      g.lineWidth = isSel ? 2 : style === 'drafting' ? 1 : 1.2;
      if (style === 'tissue') g.setLineDash(TISSUE_DASH[part.group % TISSUE_DASH.length]);
      g.stroke();
      g.setLineDash([]);
      g.restore();
      if (detail) {
        // Engraving and folds
        g.strokeStyle = css.ink;
        g.lineWidth = 0.8;
        for (const e of part.engrave) {
          path(e.pts.map((p) => placePoint(pl, p)) as [number, number][], false);
          g.stroke();
        }
        for (const s of part.score) {
          g.setLineDash(s.kind === 'valley' ? [5, 3] : [1.5, 2.5]);
          g.strokeStyle = css.text2;
          path(s.pts.map((p) => placePoint(pl, p)) as [number, number][], false);
          g.stroke();
        }
        g.setLineDash([2, 2]);
        for (const s of part.perforations ?? []) {
          path(s.pts.map((p) => placePoint(pl, p)) as [number, number][], false);
          g.stroke();
        }
        g.setLineDash([]);
      }
      if (k > 0.35 && (isSel || isHov || k > 0.9)) {
        const cx = (it.box.minX + it.box.maxX) / 2, cy = (it.box.minY + it.box.maxY) / 2;
        g.font = `600 ${Math.max(10, Math.min(13, k * 6))}px ${css.num}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = isSel ? css.accent : css.text;
        if (!detail || isSel || isHov) g.fillText(part.id, sx(cx), sy(cy));
        g.textAlign = 'start';
        g.textBaseline = 'alphabetic';
      }
    }
  }, [scene, view, size, selected, hovered, colors, world, themeMode, colorBy, material, mode]);

  // ---------------------------------------------------------------- interaction
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const toWorld = (cx: number, cy: number) => [view.x + cx / view.k, view.y - cy / view.k] as [number, number];
  const pick = (cx: number, cy: number) => {
    const [x, y] = toWorld(cx, cy);
    for (let i = scene.items.length - 1; i >= 0; i--) {
      const it = scene.items[i];
      if (x < it.box.minX || x > it.box.maxX || y < it.box.minY || y > it.box.maxY) continue;
      if (pointInPolygon([x, y], it.outline)) return it.part.id;
    }
    return null;
  };
  const local = (e: React.PointerEvent | React.WheelEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  };
  return (
    <div className="canvas2d" ref={wrap}>
      <canvas
        ref={canvas}
        style={{ width: size.w, height: size.h }}
        role="img"
        aria-label={mode === 'sheets' ? `Nested sheets: ${scene.frames.length}` : `${scene.items.length} flat parts`}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
            if (d.moved) setView((v) => ({ ...v, x: d.vx - dx / v.k, y: d.vy + dy / v.k }));
            return;
          }
          const [cx, cy] = local(e);
          const id = pick(cx, cy);
          if (useUI.getState().hoveredPart !== id) useUI.getState().set({ hoveredPart: id });
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const [cx, cy] = local(e);
            useUI.getState().set({ selectedPart: pick(cx, cy) });
          }
        }}
        onPointerLeave={() => useUI.getState().set({ hoveredPart: null })}
        onWheel={(e) => {
          const [cx, cy] = local(e);
          const [wx, wy] = toWorld(cx, cy);
          const k = Math.min(200, Math.max(0.01, view.k * Math.exp(-e.deltaY * 0.0015)));
          setView({ k, x: wx - cx / k, y: wy + cy / k });
        }}
      />
      <button type="button" className="canvas2d__fit" onClick={fit}>
        Fit
      </button>
    </div>
  );
}
