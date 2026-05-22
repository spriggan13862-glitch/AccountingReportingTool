import { fileURLToPath } from 'url'
import * as fs from 'fs'
import * as path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, '../..')
const DB_PATH = path.join(ROOT, 'accounting_e2e.db')

// In Playwright 1.60+ webServers start before globalSetup, so we can't
// delete and recreate the DB here (the backend already holds it open).
// Seeding is done by the npm script before playwright starts.
// This function just verifies the DB is present and warns if not.
export default async function globalSetup() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(
      `[global-setup] E2E database not found at ${DB_PATH}.\n` +
      'Run: python scripts/seed_e2e.py   (from project root)',
    )
  }
  const stat = fs.statSync(DB_PATH)
  console.log(`[global-setup] E2E database verified: ${DB_PATH} (${(stat.size / 1024).toFixed(0)} KB)`)
}
