import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Builds the render check as a Node script. It reuses the app's aliases so the
 * pages are imported exactly the way the app imports them, then runs outside
 * the browser.
 */
export default defineConfig({
  // The app reads this in Settings to show which build is loaded. It has to be
  // declared here too, or Settings throws when the render check imports it.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
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
