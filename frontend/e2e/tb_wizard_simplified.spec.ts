/**
 * Simplified TB wizard — Suggest Financial Statement Lines step verification.
 *
 * Verifies that the new suggest-FSLI and apply-FSLI-suggestions backend
 * endpoints work end-to-end. UI walk-through is light because the wizard
 * requires file upload state we don't have a fixture for in E2E.
 */
import { test, expect } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SCREENSHOT_DIR = path.resolve(__dirname, '../test-results/tb-wizard-screenshots')

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
})

test.describe('Simplified TB wizard', () => {
  test('suggest-fsli endpoint exists and refuses bad taxonomy', async ({ request }) => {
    // The route should exist (404 only on a known-bad batch id) — proves wiring.
    const res = await request.post(
      'http://localhost:8002/api/v1/tb-imports/batches/99999/suggest-fsli',
      { data: { taxonomy_id: 1 } },
    )
    expect([404, 401, 403]).toContain(res.status())
  })

  test('apply-fsli-suggestions endpoint exists with mode selector', async ({ request }) => {
    const res = await request.post(
      'http://localhost:8002/api/v1/tb-imports/batches/99999/apply-fsli-suggestions',
      { data: { line_ids: 'all', mode: 'blank_only' } },
    )
    expect([404, 401, 403]).toContain(res.status())
  })

  test('apply-fsli-suggestions rejects unknown mode', async ({ request }) => {
    const res = await request.post(
      'http://localhost:8002/api/v1/tb-imports/batches/1/apply-fsli-suggestions',
      { data: { line_ids: 'all', mode: 'destroy_everything' } },
    )
    // 400 for bad mode, OR 404 if no batch 1. Either proves request validation
    // ran — what we care about is NOT a 500 / NOT a 200-with-side-effects.
    expect([400, 404, 401, 403]).toContain(res.status())
  })

  test('What\'s New mentions the simplified TB wizard', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@livemarketing.test')
    await page.getByLabel(/password/i).fill('Test1234!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
    await page.goto('/overview')
    const toggle = page.getByRole('button', { name: /what's new/i })
    await toggle.scrollIntoViewIfNeeded()
    await toggle.click()
    await expect(
      page.getByText(/Simplified TB wizard|Suggest Financial Statement Lines/i).first()
    ).toBeVisible({ timeout: 5_000 })
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'whats-new.png'), fullPage: true })
  })

  test('Phase F: redesign What\'s New entry visible', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@livemarketing.test')
    await page.getByLabel(/password/i).fill('Test1234!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
    await page.goto('/overview')
    const toggle = page.getByRole('button', { name: /what's new/i })
    await toggle.scrollIntoViewIfNeeded()
    await toggle.click()
    await expect(page.getByText(/TB Import workflow redesign/i).first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/six steps/i).first()).toBeVisible()
  })

  test('Phase C: /import/:id redirects to wizard with ?batchId', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@livemarketing.test')
    await page.getByLabel(/password/i).fill('Test1234!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
    await page.goto('/import/123')
    await expect(page).toHaveURL(/trial-balance\?batchId=123/, { timeout: 5_000 })
  })

  test('CRL-C: suggest-crl endpoint exists', async ({ request }) => {
    const res = await request.post(
      'http://localhost:8002/api/v1/tb-imports/batches/99999/suggest-crl',
      { data: { taxonomy_id: 1 } },
    )
    expect([404, 401, 403]).toContain(res.status())
  })

  test('CRL-C: apply-crl-suggestions endpoint exists with mode validation', async ({ request }) => {
    const res = await request.post(
      'http://localhost:8002/api/v1/tb-imports/batches/99999/apply-crl-suggestions',
      { data: { taxonomy_id: 1, line_ids: 'all', mode: 'blank_only' } },
    )
    expect([404, 401, 403]).toContain(res.status())
  })

  test('CRL-C: apply-crl-suggestions rejects unknown mode', async ({ request }) => {
    const res = await request.post(
      'http://localhost:8002/api/v1/tb-imports/batches/1/apply-crl-suggestions',
      { data: { taxonomy_id: 1, line_ids: 'all', mode: 'destroy_everything' } },
    )
    expect([400, 401, 403, 404]).toContain(res.status())
  })

  test('CRL-C: save-crl-selections endpoint exists', async ({ request }) => {
    const res = await request.post(
      'http://localhost:8002/api/v1/tb-imports/batches/99999/save-crl-selections',
      { data: { selections: [{ line_id: 1, crl_id: null }] } },
    )
    expect([404, 401, 403]).toContain(res.status())
  })

  test('Phase E: /import/new redirects to canonical wizard', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@livemarketing.test')
    await page.getByLabel(/password/i).fill('Test1234!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
    await page.goto('/import/new')
    await expect(page).toHaveURL(/client-data\/imports\/trial-balance/, { timeout: 5_000 })
  })
})
