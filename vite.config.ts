/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths: start.ng serves the built dist/ folder as-is, at <name>.start.ng.
  base: './',
  build: {
    // three.js alone is ~520 kB minified (~130 kB gzip); warn only if the bundle grows well past that.
    chunkSizeWarningLimit: 700,
  },
  test: {
    // Vitest 5 caches transformed files by their own content, so an import.meta.glob result goes stale
    // when files are added (the game/ no-three.js guard would miss new files). The suite is tiny; skip it.
    fsModuleCache: false,
    // Vitest stubs CSS to '' by default; let the stylesheet through so tests can check that its
    // animation timings and reduced-motion rules match the code (NMH-21).
    // No `$` anchor: the module id carries the query (styles.css?raw).
    css: { include: [/styles\.css/] },
  },
});
