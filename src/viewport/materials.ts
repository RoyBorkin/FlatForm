/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import type { MaterialParams } from '@/core/params';

/** A physically-plausible look for each stock, used when colouring parts by material. */
export function stockMaterial(m: MaterialParams): MeshStandardMaterial {
  const color = new Color(m.color);
  switch (m.look) {
    case 'metal':
      return new MeshStandardMaterial({ color, metalness: 0.92, roughness: 0.32, side: DoubleSide });
    case 'acrylic':
      return new MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.08, transmission: 0.6, thickness: m.thickness, transparent: true, opacity: 0.85, side: DoubleSide });
    case 'plywood':
    case 'mdf':
      return new MeshStandardMaterial({ color, metalness: 0, roughness: 0.82, side: DoubleSide });
    case 'felt':
      return new MeshStandardMaterial({ color, metalness: 0, roughness: 1, side: DoubleSide });
    default:
      return new MeshStandardMaterial({ color, metalness: 0, roughness: 0.9, side: DoubleSide });
  }
}

export function layerMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color(color), metalness: 0.15, roughness: 0.48, side: DoubleSide });
}
