/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/**
 * Rhino .3dm import via rhino3dm (WASM, loaded only when needed). Meshes and
 * the render meshes of Breps, Extrusions and SubDs are used; save the file
 * from Rhino with shaded views or run _Mesh first if nothing comes through.
 */
import type { MeshData } from '@/core/types';

type RhinoModule = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let rhinoPromise: Promise<RhinoModule> | null = null;
async function rhino(): Promise<RhinoModule> {
  if (!rhinoPromise) {
    rhinoPromise = (async () => {
      const [{ default: init }, { default: wasmUrl }] = await Promise.all([
        import('rhino3dm'),
        import('rhino3dm/rhino3dm.wasm?url'),
      ]);
      return (init as unknown as (o: object) => Promise<RhinoModule>)({ locateFile: () => wasmUrl });
    })();
  }
  return rhinoPromise;
}

const UNIT_TO_MM: Record<number, number> = { 1: 0.001, 2: 1, 3: 10, 4: 1000, 8: 25.4, 9: 304.8 };

export async function load3dm(buf: ArrayBuffer): Promise<{ mesh: MeshData; warnings: string[] }> {
  const rh = await rhino();
  const doc = rh.File3dm.fromByteArray(new Uint8Array(buf));
  if (!doc) throw new Error('Could not read the 3DM file.');
  const warnings: string[] = [];
  const unit = doc.settings().modelUnitSystem?.value ?? 2;
  const k = UNIT_TO_MM[unit] ?? 1;
  const pos: number[] = [];
  const idx: number[] = [];
  const addMesh = (m: RhinoModule) => {
    if (!m) return;
    const json = m.toThreejsJSON();
    const data = json?.data;
    const p: number[] = data?.attributes?.position?.array ?? [];
    const base = pos.length / 3;
    for (let i = 0; i < p.length; i++) pos.push(p[i] * k);
    const ix: number[] | undefined = data?.index?.array;
    if (ix) for (const v of ix) idx.push(base + v);
    else for (let i = 0; i < p.length / 3; i++) idx.push(base + i);
  };
  const objects = doc.objects();
  let skipped = 0;
  for (let i = 0; i < objects.count; i++) {
    const geo = objects.get(i).geometry();
    const type = geo.objectType?.value ?? geo.objectType;
    const name = geo.constructor?.name ?? '';
    if (name === 'Mesh' || type === rh.ObjectType?.Mesh?.value) addMesh(geo);
    else if (name === 'Brep' || name === 'Extrusion') {
      const brep = name === 'Extrusion' ? geo.toBrep(true) : geo;
      const faces = brep.faces();
      let got = false;
      for (let f = 0; f < faces.count; f++) {
        const fm = faces.get(f).getMesh(rh.MeshType.Any);
        if (fm) {
          addMesh(fm);
          got = true;
        }
      }
      if (!got) skipped++;
    } else if (name === 'SubD') {
      try {
        addMesh(rh.Mesh.createFromSubDControlNet(geo, true));
      } catch {
        skipped++;
      }
    } else skipped++;
  }
  if (skipped) warnings.push(`${skipped} object(s) had no render mesh and were skipped. In Rhino, run _Mesh or save with shaded display, or export STL/OBJ.`);
  return { mesh: { positions: new Float32Array(pos), indices: new Uint32Array(idx) }, warnings };
}
