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
    target: 'es2020',
    // Source maps: opt-in via VITE_SOURCEMAP=1 (default off in prod). 'hidden'
    // emits .map files but doesn't reference them in JS — safe for prod debugging.
    sourcemap: process.env.VITE_SOURCEMAP === '1' ? 'hidden' : false,
    assetsDir: 'assets',
  },
})
