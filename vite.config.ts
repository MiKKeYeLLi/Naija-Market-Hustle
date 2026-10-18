/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js alone is ~520 kB minified (~130 kB gzip); warn only if the bundle grows well past that.
    chunkSizeWarningLimit: 700,
  },
  test: {
    // Vitest 5 caches transformed files by their own content, so an import.meta.glob result goes stale
    // when files are added (the game/ no-three.js guard would miss new files). The suite is tiny; skip it.
    fsModuleCache: false,
  },
});
