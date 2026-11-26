import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3141', ws: true },
      // Installed plugins are served by the API server from the data directory.
      '/plugins': { target: 'http://127.0.0.1:3141' },
    },
  },
  build: { chunkSizeWarningLimit: 6000 },
  test: {
    alias: [
      // Monaco only declares its ESM entry in the package's module field.
      { find: /^monaco-editor$/, replacement: 'monaco-editor/esm/vs/editor/editor.main.js' },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}', 'server/**/*.ts', 'electron/**/*.ts'],
      exclude: ['**/*.d.ts'],
      reporter: ['text-summary', 'html', 'json'],
    },
  },
})
