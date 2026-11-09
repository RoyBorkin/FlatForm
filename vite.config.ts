import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// `base` is relative so the same build runs on GitHub Pages, a sub-folder,
// or inside the Tauri desktop shell.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // rhino3dm references the Node "ws" package on a code path browsers never run.
      ws: fileURLToPath(new URL('./src/platform/empty.ts', import.meta.url)),
    },
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['manifold-3d', 'rhino3dm'] },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (/node_modules\/(three|@react-three)\//.test(id)) return 'three';
          if (/node_modules\/(react|react-dom|scheduler|zustand|zundo)\//.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173, strictPort: false },
  clearScreen: false,
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
