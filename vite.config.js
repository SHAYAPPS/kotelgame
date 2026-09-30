import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build works from any sub-path (e.g. GitHub Pages).
  base: './',
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // three.js alone is ~530 kB minified (~130 kB gzip); that is expected.
    chunkSizeWarningLimit: 1000,
  },
});
