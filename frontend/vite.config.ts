import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// Bundle analysis is opt-in via VITE_ANALYZE=1 — emits dist/bundle-stats.html.
// CI passes the flag and uploads the report as an artifact.
const analyze = process.env.VITE_ANALYZE === '1'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(analyze ? [visualizer({
      filename: 'dist/bundle-stats.html',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
      open: false,
    })] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],

  build: {
    target: 'es2020',
    // Source maps: opt-in via VITE_SOURCEMAP=1 (default off in prod). 'hidden'
    // emits .map files but doesn't reference them in JS — safe for prod debugging.
    sourcemap: process.env.VITE_SOURCEMAP === '1' ? 'hidden' : false,
    assetsDir: 'assets',
  },
})
