/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Turn an unfolded mesh into cuttable parts: union each island's triangles,
 * then let the method decorate every fold and every seam (both sides) with
 * its features. Labels, seam numbers, overlap checks and the 3D preview are
 * handled here once for every panel-based method.
 */
import type { MethodResult, Part2D, Path2, Polyline2 } from '../types';
import { circlePath, difference, intersection, offsetPolygons, regionArea, union, clipOpenPaths, interiorPoint } from '../polygon/polygon';
import { textPolylines, textWidth } from '../text/hershey';
import { normalizePart, partId } from '../parts';
import { emptyFeatures, type EdgeCtx, type Features } from '../joinery/edgeFeatures';
import { edgeContext, type Unfolded } from './unfold';
import type { V2 } from '../math/vec';

export interface PanelConfig {
  groupName: string;
  /** Part group (letter and colour); default 0. */
  group?: number;
  /** Cut each part's corner back by this radius at a mesh vertex (junction hubs). */
  vertexRelief?: (v: number) => number;
  /** Flat junction hubs: a screw hole this far from the corner, along the corner's bisector. */
  vertexHole?: (v: number, island: number) => { dist: number; r: number } | undefined;
  /** Called for every open-boundary edge (rims of open surfaces). */
  rim?: (ctx: EdgeCtx, f: Features) => void;
  thickness: number;
  /** Called once per fold inside an island. */
  fold?: (ctx: EdgeCtx, f: Features) => void;
  /** Called for each side of every seam (edges cut between pieces). */
  seam?: (ctx: EdgeCtx, f: Features) => void;
  numberSeams: boolean;
  textHeight: number;
  /** Extra inset for the seam number (e.g. past a row of holes). */
  labelInset?: (ctx: EdgeCtx) => number;
  pieceLabels?: boolean;
  /** Small ticks across seams to line pieces up (flexible materials). */
  seamMarks?: boolean;
  /** Per-island hook after the region is known (flex hinges). */
  island?: (index: number, faces: number[], region: Path2[], f: Features) => void;
  /** Called on the male side of a seam, with the inside angle in degrees, to count brackets. */
  onSeam?: (ctx: EdgeCtx & { e: number; g: number; a: number; b: number }, f: number) => void;
}

export function buildPanelParts(U: Unfolded, cfg: PanelConfig, warnings: string[]): { parts: Part2D[]; assembly: MethodResult['assembly'] } {
  const parts: Part2D[] = [];
  const { tri2, topo } = U;
  let skippedTabs = 0, skippedParts = 0;
  U.islands.forEach((faces, id) => {
    const tris = faces.map((f) => tri2[f].slice() as Path2);
    let region = union(offsetPolygons(tris, 0.002, 'miter'));
    region = offsetPolygons(region, -0.002, 'miter');
    const F = emptyFeatures();
    const faceSet = new Set(faces);
    for (const f of faces)
      for (let k = 0; k < 3; k++) {
        const ctx = edgeContext(U, f, k, cfg.thickness);
        if (ctx.g >= 0 && faceSet.has(ctx.g) && U.isFold(ctx.e)) {
          if (f < ctx.g) cfg.fold?.(ctx, F);
          continue;
        }
        if (ctx.g < 0) {
          cfg.rim?.(ctx, F); // open boundary: plain cut unless the method decorates rims
          continue;
        }
        cfg.onSeam?.(ctx, f);
        if (cfg.numberSeams && ctx.num) {
          const label = String(ctx.num);
          const h = Math.min(cfg.textHeight, ctx.len * 0.25);
          if (h > 0.6 && textWidth(label, h) < ctx.len * 0.6) {
            let ang = Math.atan2(ctx.u[1], ctx.u[0]);
            if (ang > Math.PI / 2 || ang <= -Math.PI / 2) ang += Math.PI;
            const q = ctx.toXY(ctx.len / 2, -(h * 0.9 + (cfg.labelInset?.(ctx) ?? 0)));
            F.engrave.push(...textPolylines(label, q[0], q[1], h, ang));
          }
        }
        if (cfg.seamMarks) {
          for (const s of [ctx.len * 0.25, ctx.len * 0.75]) F.engrave.push({ pts: [ctx.toXY(s, 0), ctx.toXY(s, -Math.min(4, ctx.len * 0.1))], kind: 'mark' });
        }
        cfg.seam?.(ctx, F);
      }
    cfg.island?.(id, faces, region, F);
    if (cfg.vertexRelief || cfg.vertexHole) {
      // Corner relief for junction hubs, at every vertex of the island that has one.
      const seen = new Set<number>();
      for (const f of faces)
        for (let k = 0; k < 3; k++) {
          const v = U.m.indices[f * 3 + k];
          if (seen.has(v)) continue;
          seen.add(v);
          const r = cfg.vertexRelief?.(v) ?? 0;
          const q = U.pos2.get(`${f}:${v}`);
          if (r > 0 && q) F.sub.push(circlePath(q[0], q[1], r, 32));
          const hole = cfg.vertexHole?.(v, id);
          if (hole && q) {
            // Bisector of the island's corner at v: the sum of the unit edge directions of its faces there.
            let bx = 0, by = 0;
            for (const g of faces) {
              const ids = [0, 1, 2].map((k2) => U.m.indices[g * 3 + k2]);
              const k2 = ids.indexOf(v);
              if (k2 < 0) continue;
              for (const o of [ids[(k2 + 1) % 3], ids[(k2 + 2) % 3]]) {
                const p2 = U.pos2.get(`${g}:${o}`);
                const c = U.pos2.get(`${g}:${v}`);
                if (!p2 || !c) continue;
                const l = Math.hypot(p2[0] - c[0], p2[1] - c[1]) || 1;
                bx += (p2[0] - c[0]) / l;
                by += (p2[1] - c[1]) / l;
              }
            }
            const l = Math.hypot(bx, by);
            if (l > 1e-6) F.holes.push({ x: q[0] + (bx / l) * hole.dist, y: q[1] + (by / l) * hole.dist, r: hole.r });
          }
        }
    }
    let cut = region;
    if (F.add.length) {
      const inner = offsetPolygons(region, -0.05);
      const clean = F.add.filter((poly) => regionArea(intersection([poly], inner)) < 0.01 * Math.max(1, regionArea([poly])));
      if (clean.length < F.add.length) {
        skippedTabs += F.add.length - clean.length;
        skippedParts++;
      }
      cut = union([...cut, ...clean]);
    }
    if (F.sub.length) cut = difference(cut, F.sub);
    // Cut-through lines must stay inside the part.
    const perforations: Polyline2[] = F.perforations.length
      ? clipOpenPaths(F.perforations.map((p) => p.pts), offsetPolygons(cut, 0.01)).map((pts) => ({ pts }))
      : [];
    const pid = partId(cfg.group ?? 0, id + 1);
    if (cfg.pieceLabels) {
      const ip = interiorPoint(cut, F.holes);
      const h = Math.min(cfg.textHeight * 1.4, ip.d * 0.6);
      if (h > 0.8) F.engrave.push(...textPolylines(pid, ip.p[0], ip.p[1], h, 0));
    }
    parts.push(
      normalizePart(
        { id: pid, group: cfg.group ?? 0, groupName: cfg.groupName, cut, holes: F.holes, score: F.score, engrave: F.engrave, perforations, meta: { faces: faces.length } },
        false, // keep the unfold orientation: it is the one checked against the sheet
      ),
    );
  });
  if (skippedTabs) warnings.push(`${skippedTabs} tab${skippedTabs > 1 ? 's' : ''} on ${skippedParts} part${skippedParts > 1 ? 's were' : ' was'} left off because they would overlap the part itself. Those seams are joined from the other side only.`);
  const nt = U.m.indices.length / 3;
  const posArr = new Float32Array(nt * 9);
  const nrmArr = new Float32Array(nt * 9);
  const isl = new Uint32Array(nt);
  for (let f = 0; f < nt; f++) {
    for (let k = 0; k < 3; k++) {
      const v = U.m.indices[f * 3 + k];
      posArr.set([U.m.positions[v * 3], U.m.positions[v * 3 + 1], U.m.positions[v * 3 + 2]], f * 9 + k * 3);
      nrmArr.set(U.normals[f], f * 9 + k * 3);
    }
    isl[f] = U.island[f];
  }
  void topo;
  return { parts, assembly: { kind: 'panels', thickness: cfg.thickness, panels: { positions: posArr, normals: nrmArr, island: isl } } };
}

export function oversizeWarning(parts: Part2D[], W: number, H: number, warnings: string[]) {
  const big = parts.filter((p) => {
    const w = p.bbox.maxX - p.bbox.minX, h = p.bbox.maxY - p.bbox.minY;
    return !((w <= W && h <= H) || (w <= H && h <= W));
  });
  if (big.length) warnings.push(`${big.length} part(s) are larger than the sheet. Lower the faces per part or use a bigger sheet.`);
}

export type { V2 };
