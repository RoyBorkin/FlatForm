/**
 * Import a 3D file into a welded triangle mesh (mm, Z up).
 * STL, OBJ, PLY, GLB/GLTF and Rhino 3DM are supported.
 */
import { BufferGeometry, Matrix4, Mesh, Object3D, Group } from 'three';
import type { MeshData } from '@/core/types';
import { weld, largestComponent } from '@/core/mesh/mesh';

export const IMPORT_ACCEPT = '.stl,.obj,.ply,.glb,.gltf,.3dm';

function geometryToArrays(geoms: { g: BufferGeometry; m: Matrix4 }[]): MeshData {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const { g, m } of geoms) {
    const gg = g.clone().applyMatrix4(m);
    const p = gg.getAttribute('position');
    if (!p) continue;
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const index = gg.getIndex();
    if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

function collect(root: Object3D): { g: BufferGeometry; m: Matrix4 }[] {
  root.updateMatrixWorld(true);
  const out: { g: BufferGeometry; m: Matrix4 }[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh && mesh.geometry) out.push({ g: mesh.geometry as BufferGeometry, m: mesh.matrixWorld.clone() });
  });
  return out;
}

const Y_UP_TO_Z_UP = new Matrix4().makeRotationX(Math.PI / 2);

export async function importMeshFile(file: File): Promise<{ mesh: MeshData; warnings: string[] }> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const buf = await file.arrayBuffer();
  const warnings: string[] = [];
  let geoms: { g: BufferGeometry; m: Matrix4 }[] = [];
  switch (ext) {
    case 'stl': {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      geoms = [{ g: new STLLoader().parse(buf), m: new Matrix4() }];
      break;
    }
    case 'ply': {
      const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
      geoms = [{ g: new PLYLoader().parse(buf), m: new Matrix4() }];
      break;
    }
    case 'obj': {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      const g: Group = new OBJLoader().parse(new TextDecoder().decode(buf));
      geoms = collect(g).map((x) => ({ g: x.g, m: Y_UP_TO_Z_UP.clone().multiply(x.m) }));
      break;
    }
    case 'glb':
    case 'gltf': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().parseAsync(ext === 'gltf' ? new TextDecoder().decode(buf) : buf, '');
      geoms = collect(gltf.scene).map((x) => ({ g: x.g, m: Y_UP_TO_Z_UP.clone().multiply(x.m) }));
      break;
    }
    case '3dm': {
      const { load3dm } = await import('./rhino');
      const r = await load3dm(buf);
      warnings.push(...r.warnings);
      return finish(r.mesh, warnings);
    }
    default:
      throw new Error(`Unsupported file type ".${ext}". Use STL, OBJ, PLY, GLB/GLTF or 3DM.`);
  }
  return finish(geometryToArrays(geoms), warnings);
}

function finish(raw: MeshData, warnings: string[]): { mesh: MeshData; warnings: string[] } {
  if (raw.indices.length === 0) throw new Error('No mesh geometry found in the file.');
  // Weld with a tolerance relative to the model size.
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < raw.positions.length; i++) {
    min = Math.min(min, raw.positions[i]);
    max = Math.max(max, raw.positions[i]);
  }
  const tol = Math.max(1e-5, (max - min) * 1e-6);
  let mesh = weld(raw, tol);
  const before = mesh.indices.length;
  mesh = largestComponent(mesh);
  if (mesh.indices.length < before) warnings.push('The file had several separate pieces. Only the largest one is kept.');
  if (mesh.indices.length / 3 > 400000) warnings.push('This is a heavy mesh. Remeshing may take a while.');
  return { mesh, warnings };
}
