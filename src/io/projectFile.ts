/** .sheetform project files: the parameters plus any imported/sculpted mesh. */
import type { ProjectParams } from '@/core/params';
import { defaultProject } from '@/core/defaults';
import { useProject } from '@/state/project';
import { getAsset, putAsset, toBase64, fromBase64 } from '@/state/assets';
import { uploadAsset } from '@/state/engine';
import { pickFile, safeName, saveFile } from '@/platform/save';
import { toast } from '@/ui/components/toast';

interface ProjectFile {
  app: 'sheetform';
  version: 1;
  project: ProjectParams;
  assets: Record<string, { positions: string; indices: string }>;
}

export async function projectFileBlob(): Promise<Blob> {
  const project = useProject.getState().project;
  const assets: ProjectFile['assets'] = {};
  if (project.shape.meshAsset) {
    const m = await getAsset(project.shape.meshAsset);
    if (m) assets[project.shape.meshAsset] = { positions: toBase64(m.positions), indices: toBase64(m.indices) };
  }
  const file: ProjectFile = { app: 'sheetform', version: 1, project, assets };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export async function saveProjectFile() {
  const name = `${safeName(useProject.getState().project.name)}.sheetform`;
  if (await saveFile(name, await projectFileBlob())) toast(`Saved ${name}`);
}

export async function openProjectFile() {
  const f = await pickFile('.sheetform,.json');
  if (f) await loadProjectFile(f);
}

export async function loadProjectFile(f: File) {
  try {
    const data = JSON.parse(await f.text()) as ProjectFile;
    if (data.app !== 'sheetform' || !data.project) throw new Error('This is not a Sheetform project file.');
    for (const [id, a] of Object.entries(data.assets ?? {})) {
      const pos = fromBase64(a.positions), idx = fromBase64(a.indices);
      const mesh = { positions: new Float32Array(pos.buffer, pos.byteOffset, pos.byteLength / 4), indices: new Uint32Array(idx.buffer, idx.byteOffset, idx.byteLength / 4) };
      await putAsset(id, mesh);
      await uploadAsset(id, mesh);
    }
    const merged = { ...defaultProject(), ...data.project };
    useProject.getState().replace(merged);
    useProject.temporal.getState().clear();
    toast(`Opened ${f.name}`);
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not open that file.', 'danger');
  }
}
