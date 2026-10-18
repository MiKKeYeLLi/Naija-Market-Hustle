import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js alone is ~520 kB minified (~130 kB gzip); warn only if the bundle grows well past that.
    chunkSizeWarningLimit: 700,
  },
});
