/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { APP_NAME, AUTHOR, AUTHOR_EMAIL, AUTHOR_URL, COPYRIGHT, COPYRIGHT_LINE } from '@/brand';
/** 3D exports: STL (binary), OBJ, GLB and 3MF. Z is up, units are mm. */
import { BufferGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { zipSync, strToU8 } from 'fflate';
import type { MeshData } from '@/core/types';
import { meshDataToGeometry } from '@/viewport/geometry';

export type ModelFormat = 'stl' | 'obj' | 'glb' | '3mf';

export function meshGroup(m: MeshData, name = 'model'): Group {
  const g = new Group();
  const mesh = new Mesh(meshDataToGeometry(m), new MeshStandardMaterial({ color: 0xb8b0a2 }));
  mesh.name = name;
  g.add(mesh);
  return g;
}

export async function exportModel(root: Object3D, format: ModelFormat): Promise<Blob> {
  root.updateMatrixWorld(true);
  switch (format) {
    case 'stl': {
      const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
      const data = new STLExporter().parse(root, { binary: true }) as unknown as DataView;
      // The 80-byte binary STL header is free text: put the credit there.
      const head = new TextEncoder().encode(`${APP_NAME} ${COPYRIGHT} ${AUTHOR_URL}`.slice(0, 80));
      new Uint8Array(data.buffer, data.byteOffset, 80).set(head);
      return new Blob([data.buffer as ArrayBuffer], { type: 'model/stl' });
    }
    case 'obj': {
      const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
      return new Blob([`# ${COPYRIGHT_LINE}\n# units mm, Z up\n${new OBJExporter().parse(root)}`], { type: 'model/obj' });
    }
    case 'glb': {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      // glTF is Y-up: rotate so the model stands upright in other apps.
      const wrapper = new Group();
      wrapper.rotation.x = -Math.PI / 2;
      wrapper.add(root.clone());
      wrapper.scale.setScalar(0.001); // glTF units are metres
      wrapper.userData = { copyright: COPYRIGHT_LINE };
      const buf = (await new GLTFExporter().parseAsync(wrapper, { binary: true })) as ArrayBuffer;
      return new Blob([buf], { type: 'model/gltf-binary' });
    }
    case '3mf':
      return threeMf(root);
  }
}

/** Minimal 3MF: one object per mesh, millimetre units. */
function threeMf(root: Object3D): Blob {
  const objects: string[] = [];
  const items: string[] = [];
  let id = 1;
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const g = (mesh.geometry as BufferGeometry).clone().applyMatrix4(new Matrix4().copy(mesh.matrixWorld));
    const pos = g.getAttribute('position');
    const idx = g.getIndex();
    const verts: string[] = [];
    for (let i = 0; i < pos.count; i++) verts.push(`<vertex x="${pos.getX(i).toFixed(4)}" y="${pos.getY(i).toFixed(4)}" z="${pos.getZ(i).toFixed(4)}"/>`);
    const tris: string[] = [];
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
      tris.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`);
    }
    objects.push(`<object id="${id}" name="${(mesh.name || `part-${id}`).replace(/"/g, '')}" type="model"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`);
    items.push(`<item objectid="${id}"/>`);
    id++;
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Application">${APP_NAME}</metadata>
<metadata name="Designer">${AUTHOR}</metadata>
<metadata name="Copyright">${COPYRIGHT} · ${AUTHOR_EMAIL} · ${AUTHOR_URL}</metadata>
<resources>${objects.join('')}</resources>
<build>${items.join('')}</build>
</model>`;
  const files = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    ),
    '3D/3dmodel.model': strToU8(model),
  };
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'model/3mf' });
}
