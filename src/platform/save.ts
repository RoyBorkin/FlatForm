/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
/**
 * Saving and opening files. In the desktop app (Tauri) this uses native
 * dialogs; in the browser it falls back to a download / file picker.
 */
export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function saveFile(name: string, data: Blob | string): Promise<boolean> {
  const blob = typeof data === 'string' ? new Blob([data], { type: 'text/plain' }) : data;
  if (isDesktop()) {
    try {
      const [{ save }, { writeFile }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
      const ext = name.split('.').pop() ?? '';
      const path = await save({ defaultPath: name, filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined });
      if (!path) return false;
      await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
      return true;
    } catch (e) {
      console.warn('Native save failed, falling back to download', e);
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const safeName = (s: string) => s.trim().replace(/[^\w\-. ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'flatform';
