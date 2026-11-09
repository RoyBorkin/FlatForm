/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Parametric 3D-printed connectors, built with Manifold (exact, watertight
 * booleans) so every STL slices cleanly. All sizes in mm; each connector is
 * modelled in its print orientation (flat face down on +Z).
 */
import type { ManifoldToplevel, Manifold as ManifoldT } from 'manifold-3d';
import type { ConnectorKind, JoineryParams } from '../params';
import type { MeshData, MethodResult } from '../types';
import type { V3 } from '../math/vec';

export interface ConnectorSpec {
  kind: ConnectorKind;
  printed: JoineryParams['printed'];
  thickness: number; // sheet thickness
  layers: number; // sheets the connector clamps
  stripWidth: number; // lattice strip width (node hub channels)
}

export interface ConnectorPart {
  name: string;
  count: number;
  mesh: MeshData;
}

function toMesh(m: ManifoldT): MeshData {
  const mesh = m.getMesh();
  const np = mesh.numProp;
  const n = mesh.vertProperties.length / np;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = mesh.vertProperties[i * np];
    pos[i * 3 + 1] = mesh.vertProperties[i * np + 1];
    pos[i * 3 + 2] = mesh.vertProperties[i * np + 2];
  }
  return { positions: pos, indices: new Uint32Array(mesh.triVerts) };
}

const SEG = 48;

/** Helical single-start thread made by twisting an off-centre circle. */
function thread(W: ManifoldToplevel, major: number, pitch: number, length: number): ManifoldT {
  const depth = Math.min(pitch * 0.6, major * 0.2);
  const minor = major - 2 * depth;
  const rc = (major + minor) / 4;
  const e = (major - minor) / 4;
  const cs = W.CrossSection.circle(rc, SEG).translate([e, 0]);
  const turns = length / pitch;
  return cs.extrude(length, Math.ceil(turns * 24), turns * 360);
}

export function buildConnector(W: ManifoldToplevel, spec: ConnectorSpec, data: MethodResult['connectorData']): ConnectorPart[] {
  const { Manifold, CrossSection } = W;
  const p = spec.printed;
  const grip = Math.max(spec.thickness, data?.gripLength ?? spec.thickness * spec.layers);
  const count = data?.pinCount ?? 0;
  const cyl = (h: number, r: number, r2 = r) => Manifold.cylinder(h, r, r2, SEG);
  switch (spec.kind) {
    case 'snapPin': {
      const r = p.pinDiameter / 2;
      const head = cyl(1.4, p.headDiameter / 2);
      const shaft = cyl(1.4 + grip + 0.3, r).translate([0, 0, 0]);
      // Barbed tip with a split so it can flex through the hole.
      const lip = 0.45;
      const tipBase = 1.4 + grip + 0.3;
      const barb = cyl(1.2, r + lip, r - 0.2).translate([0, 0, tipBase]);
      const collar = cyl(0.3, r + lip).translate([0, 0, tipBase - 0.3]);
      let pin = Manifold.union([head, shaft, barb, collar]);
      const slot = Manifold.cube([0.9, p.pinDiameter + 2, 3.2], true).translate([0, 0, tipBase + 1.2 - 1.6 + 0.01]);
      pin = pin.subtract(slot);
      return [{ name: `snap-pin_d${p.pinDiameter}_grip${grip.toFixed(1)}`, count, mesh: toMesh(pin) }];
    }
    case 'spacer': {
      if (data?.spacers?.length) {
        // Layers: one spacer per gap length, in the chosen shape, bored for the rod.
        const size = data.spacerSize ?? p.headDiameter;
        const bore = (data.spacerBore ?? p.pinDiameter) / 2 + p.clearance;
        const shape = data.spacerShape ?? 'round';
        const outline = () => {
          if (shape === 'round') return CrossSection.circle(size / 2, SEG);
          if (shape === 'square') return CrossSection.square([size, size], true);
          if (shape === 'hex') return CrossSection.circle(size / 2 / Math.cos(Math.PI / 6), 6);
          const pts: [number, number][] = [];
          for (let i = 0; i < 10; i++) {
            const r = i % 2 ? size * 0.3 : size / 2;
            const a = (i * Math.PI) / 5 + Math.PI / 2;
            pts.push([Math.cos(a) * r, Math.sin(a) * r]);
          }
          return new CrossSection([pts]);
        };
        return data.spacers.map(({ length, count: n }) => {
          const h = Math.max(0.4, length - p.clearance);
          const body = outline().extrude(h).subtract(cyl(h + 2, bore).translate([0, 0, -1]));
          return { name: `layer-spacer_${shape}${size}_L${length.toFixed(1)}`, count: n, mesh: toMesh(body) };
        });
      }
      const inner = p.pinDiameter / 2 + p.clearance;
      const outer = inner + p.wall;
      const s = cyl(p.spacerGap, outer).subtract(cyl(p.spacerGap + 2, inner).translate([0, 0, -1]));
      return [{ name: `spacer_gap${p.spacerGap}_d${p.pinDiameter}`, count, mesh: toMesh(s) }];
    }
    case 'hollowScrew': {
      const major = p.pinDiameter;
      const nutH = Math.max(3, major * 0.8);
      const len = grip + nutH + 0.6;
      const flangeH = 1.6;
      const body = Manifold.union([cyl(flangeH, p.headDiameter / 2), thread(W, major, p.threadPitch, len).translate([0, 0, flangeH])]);
      const bore = Math.min(p.bore, major - 2 * p.wall);
      const screw = bore > 0.4 ? body.subtract(cyl(len + flangeH + 2, bore / 2).translate([0, 0, -1])) : body;
      // Nut: hex prism with an internal thread cut by a slightly grown thread.
      const hex = CrossSection.circle(p.headDiameter / 2 / Math.cos(Math.PI / 6), 6).extrude(nutH);
      const cutter = thread(W, major + 2 * p.clearance, p.threadPitch, nutH + 2).translate([0, 0, -1]);
      const nut = hex.subtract(cutter).subtract(cyl(nutH + 2, (major - 2 * Math.min(p.threadPitch * 0.6, major * 0.2)) / 2 + p.clearance).translate([0, 0, -1]));
      return [
        { name: `hollow-screw_M${major}x${p.threadPitch}_bore${bore.toFixed(1)}`, count, mesh: toMesh(screw) },
        { name: `hollow-screw-nut_M${major}x${p.threadPitch}`, count, mesh: toMesh(nut) },
      ];
    }
    case 'nodeHub': {
      const hubs = data?.hubs ?? [];
      const out: ConnectorPart[] = [];
      const stack = spec.thickness * spec.layers;
      const chH = (data?.hubChannel?.height ?? stack) + p.clearance;
      const chW = (data?.hubChannel?.width ?? spec.stripWidth) + p.clearance;
      const H = chH + 2 * p.wall;
      const armW = chW + 2 * p.wall;
      for (const hub of hubs.slice(0, 4000)) {
        let body = cyl(H, armW / 2 + 1).translate([0, 0, 0]);
        const cuts: ManifoldT[] = [];
        for (const d of hub.dirs) {
          const az = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
          const el = (Math.atan2(d[2], Math.hypot(d[0], d[1])) * 180) / Math.PI;
          const arm = Manifold.cube([p.armLength, armW, H], false).translate([0, -armW / 2, -H / 2]);
          const ch = Manifold.cube([p.armLength + 2, chW, chH], false).translate([armW / 2 - 0.5, -chW / 2, -chH / 2]);
          const place = (m: ManifoldT) => m.rotate([0, -el, 0]).rotate([0, 0, az]).translate([0, 0, H / 2]);
          body = body.add(place(arm));
          cuts.push(place(ch));
        }
        let hubM = body.subtract(Manifold.union(cuts));
        hubM = hubM.subtract(cyl(H + 2, p.pinDiameter / 2 + p.clearance).translate([0, 0, -1]));
        // Keep the print flat on the bed.
        const bb = hubM.boundingBox();
        hubM = hubM.translate([0, 0, -bb.min[2]]);
        out.push({ name: `node-hub_${String(hub.node).padStart(4, '0')}`, count: 1, mesh: toMesh(hubM) });
      }
      return out;
    }
    case 'angleBracket': {
      const angles = data?.bracketAngles ?? [];
      if (data?.crossings) {
        // Waffle: a cross clip that caps a rib crossing.
        const slot = spec.thickness + p.clearance;
        const size = p.armLength * 2;
        const depth = p.armLength * 0.6;
        const block = Manifold.cube([size, size, depth + p.wall], true).translate([0, 0, (depth + p.wall) / 2]);
        const a = Manifold.cube([size + 2, slot, depth * 2], true).translate([0, 0, depth + p.wall]);
        const b = Manifold.cube([slot, size + 2, depth * 2], true).translate([0, 0, depth + p.wall]);
        const clip = block.subtract(a).subtract(b);
        return [{ name: `cross-clip_t${spec.thickness}`, count: data.crossings, mesh: toMesh(clip) }];
      }
      const byAngle = new Map<number, number>();
      for (const a of angles.length ? angles : [90]) byAngle.set(a, (byAngle.get(a) ?? 0) + 1);
      const out: ConnectorPart[] = [];
      const hole = p.pinDiameter / 2 + p.clearance;
      const width = Math.max(p.pinDiameter * 3, 8);
      const len = p.armLength;
      const th = p.wall * 1.5;
      for (const [angle, n] of [...byAngle.entries()].sort((x, y) => x[0] - y[0])) {
        const flange = () => Manifold.cube([len, width, th]).subtract(cyl(th + 2, hole).translate([len * 0.62, width / 2, -1]));
        const A = flange();
        const B = flange().rotate([0, -angle, 0]);
        const fillet = cyl(width, th, th).rotate([-90, 0, 0]).translate([0, 0, th / 2]);
        let br = Manifold.union([A, B, fillet]);
        const bb = br.boundingBox();
        br = br.translate([0, 0, -bb.min[2]]);
        out.push({ name: `angle-bracket_${angle}deg`, count: n, mesh: toMesh(br) });
      }
      return out;
    }
  }
}

export type { V3 };
