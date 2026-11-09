/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Imported and sculpted meshes are big binary blobs, so they live outside the
 * undo history: in memory, in the worker, and in IndexedDB so a reload keeps
 * the project intact. Project files embed them as base64.
 */
import type { MeshData } from '@/core/types';

const mem = new Map<string, MeshData>();
const DB = 'flatform';
const STORE = 'assets';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putAsset(id: string, mesh: MeshData) {
  mem.set(id, mesh);
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ positions: mesh.positions, indices: mesh.indices }, id);
  } catch {
    /* quota or private mode */
  }
}

export async function getAsset(id: string): Promise<MeshData | undefined> {
  if (mem.has(id)) return mem.get(id);
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => {
        const v = req.result as MeshData | undefined;
        if (v) mem.set(id, v);
        resolve(v);
      };
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export const getAssetSync = (id: string) => mem.get(id);

export const newAssetId = () => `mesh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// ---- base64 helpers for project files
export function toBase64(arr: ArrayBufferView): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
