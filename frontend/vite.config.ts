/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { execSync } from 'child_process'

let gitHash = 'unknown'
let gitTag = ''
const buildTime = new Date().toLocaleString('en-US', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hour12: true
})

try {
  gitHash = execSync('git rev-parse --short HEAD').toString().trim()
} catch (e) {}

try {
  gitTag = execSync('git describe --tags --always').toString().trim()
} catch (e) {}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'import.meta.env.VITE_APP_GIT_HASH': JSON.stringify(gitHash),
    'import.meta.env.VITE_APP_GIT_TAG': JSON.stringify(gitTag),
    'import.meta.env.VITE_APP_BUILD_TIME': JSON.stringify(buildTime),
  },
  server: {
    proxy: {
      // Proxy all /api requests to the FastAPI backend in development.
      // This eliminates CORS preflight entirely — the browser sees same-origin.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // @ts-expect-error vitest config is injected via triple-slash reference above
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
