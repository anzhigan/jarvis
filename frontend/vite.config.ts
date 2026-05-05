import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],

  build: {
    // Target older Safari for iOS compatibility (Capacitor uses WKWebView)
    target: 'es2017',
    // Source maps: opt-in via VITE_SOURCEMAP=1 (default off in prod). 'hidden'
    // emits .map files but doesn't reference them in JS — safe for prod debugging.
    sourcemap: process.env.VITE_SOURCEMAP === '1' ? 'hidden' : false,
    // Don't break absolute paths — Capacitor serves from / by default
    assetsDir: 'assets',
  },
})
