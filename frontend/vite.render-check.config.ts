import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Builds the render check as a Node script. It reuses the app's aliases so the
 * pages are imported exactly the way the app imports them, then runs outside
 * the browser.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  build: {
    ssr: 'scripts/render-check.tsx',
    outDir: '.render-check',
    emptyOutDir: true,
    minify: false,
    target: 'node20',
    rollupOptions: {
      output: { entryFileNames: 'render-check.mjs' },
    },
  },
});
