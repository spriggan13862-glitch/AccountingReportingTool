import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, '..')
const E2E_DB = path.join(ROOT, 'accounting_e2e.db')
// SQLite URL with forward slashes (required by SQLAlchemy on Windows)
const E2E_DB_URL = `sqlite:///${E2E_DB.replace(/\\/g, '/')}`

// Workflow E2E config:
//   - Backend:  port 8002  (accounting_e2e.db)
//   - Frontend: port 5174  (vite.e2e.config.ts proxies /api → http://localhost:8002)
//
// vite.e2e.config.ts overrides the proxy target from 8000 to 8002 so all API
// requests (both axios and relative-path fetches) reach the E2E backend.
//
// Run with: npm run test:e2e:workflow
// Requires: ports 8002 and 5174 must be free.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/workflow.spec.ts', '**/accounting.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['json', { outputFile: 'test-results/workflow-results.json' }]]
    : [['list'], ['json', { outputFile: 'test-results/workflow-results.json' }]],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: './test-results',
  globalSetup: './e2e/global-setup.ts',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'uvicorn app.main:app --host 0.0.0.0 --port 8002',
      url: 'http://localhost:8002/api/v1/setup/status',
      reuseExistingServer: false,
      cwd: ROOT,
      timeout: 30_000,
      env: {
        DATABASE_URL: E2E_DB_URL,
        ENVIRONMENT: 'development',
      },
    },
    {
      // Use vite.e2e.config.ts so the proxy targets port 8002 (not the default 8000).
      // Also set VITE_API_BASE_URL so the axios client connects directly to the backend,
      // bypassing the proxy entirely for all api.* calls (belt-and-suspenders).
      command: 'npx vite --config vite.e2e.config.ts --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        VITE_API_BASE_URL: 'http://localhost:8002/api/v1',
      },
    },
  ],
})
