import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so the same build works on GitHub Pages project sites
  // (user.github.io/frozon/), user sites, and any static host.
  base: './',
  server: {
    port: 5173,
    proxy: {
      // In dev, forward API calls to the local credential proxy so the
      // browser never sees an API key.
      '/api': { target: 'http://localhost:8787', changeOrigin: true, ws: true },
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks: {
          leaflet: ['leaflet', 'proj4', 'proj4leaflet'],
        },
      },
    },
  },
})
