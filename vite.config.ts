import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // WSL running a project stored on a Windows drive (/mnt/c/...) gets no file-change events,
      // so poll for changes there; elsewhere use normal native file watching.
      watch: process.cwd().startsWith('/mnt/') ? { usePolling: true, interval: 300 } : undefined,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 2000,
    },
  };
});
