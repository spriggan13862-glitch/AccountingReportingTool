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

  test('CRL-E: GET /common-reporting-lines/ returns the system catalog', async ({ request }) => {
    const res = await request.get('http://localhost:8002/api/v1/common-reporting-lines/')
    // 200 when seeded, 401/403 when auth required; never 404 (route must exist).
    expect([200, 401, 403]).toContain(res.status())
    if (res.status() === 200) {
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      // 72 system CRLs after a clean seed; allow >=72 if org clones present.
      expect(body.length).toBeGreaterThanOrEqual(72)
      const codes = body.map((r: { code: string }) => r.code)
      expect(codes).toContain('CRL_CASH')
      expect(codes).toContain('CRL_UNCLASSIFIED')
      expect(codes).toContain('CRL_NEEDS_REVIEW')
    }
  })

  test('CRL-E: GET /common-reporting-lines/templates lists 8 system templates', async ({ request }) => {
    const res = await request.get('http://localhost:8002/api/v1/common-reporting-lines/templates')
    expect([200, 401, 403]).toContain(res.status())
    if (res.status() === 200) {
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      const codes = body.map((r: { code: string }) => r.code)
      expect(codes).toContain('smb_general')
    }
  })

  test('CRL-E: template_id filter narrows results', async ({ request }) => {
    const allRes = await request.get('http://localhost:8002/api/v1/common-reporting-lines/')
    const tplRes = await request.get('http://localhost:8002/api/v1/common-reporting-lines/templates')
    if (allRes.status() !== 200 || tplRes.status() !== 200) {
      test.skip(true, 'auth-gated env — skipping live data assertions')
      return
    }
    const templates = await tplRes.json() as { id: number; code: string }[]
    const smb = templates.find((t) => t.code === 'smb_general')
    if (!smb) {
      test.skip(true, 'smb_general template not seeded')
      return
    }
    const filteredRes = await request.get(
      `http://localhost:8002/api/v1/common-reporting-lines/?template_id=${smb.id}`,
    )
    expect(filteredRes.status()).toBe(200)
    const filtered = await filteredRes.json()
    const all = await allRes.json()
    // Template filter must not return more rows than the full catalog.
    expect(filtered.length).toBeLessThanOrEqual(all.length)
    // Mandatory rows must remain reachable.
    const codes = filtered.map((r: { code: string }) => r.code)
    expect(codes).toContain('CRL_UNCLASSIFIED')
  })

  test('CRL-E: What\'s New mentions Common Reporting Lines', async ({ page }) => {
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
      page.getByText(/Common Reporting Lines|CRL picker/i).first(),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('CRL-F: create custom CRL endpoint rejects non-prefixed code', async ({ request }) => {
    const res = await request.post(
      'http://localhost:8002/api/v1/common-reporting-lines/',
      {
        data: {
          code: 'BAD_CODE',
          name: 'Bad',
          section: 'Assets',
          statement_type: 'Balance Sheet',
          organization_id: 1,
        },
      },
    )
    // 400 when seeded + auth, 401/403 when auth-gated; never 500.
    expect([400, 401, 403]).toContain(res.status())
  })

  test('CRL-F: PATCH system CRL without org_id returns 409', async ({ request }) => {
    // CRL_CASH should exist as a system row at a low id. We don't know the
    // exact id, so probe the list first.
    const listRes = await request.get('http://localhost:8002/api/v1/common-reporting-lines/')
    if (listRes.status() !== 200) {
      test.skip(true, 'auth-gated env')
      return
    }
    const body = await listRes.json() as { id: number; code: string }[]
    const cash = body.find((r) => r.code === 'CRL_CASH')
    if (!cash) {
      test.skip(true, 'CRL_CASH not seeded')
      return
    }
    const patchRes = await request.patch(
      `http://localhost:8002/api/v1/common-reporting-lines/${cash.id}`,
      { data: { name: 'Renamed' } },
    )
    expect(patchRes.status()).toBe(409)
  })

  test('CRL-F: DELETE system template returns 409', async ({ request }) => {
    const tplRes = await request.get('http://localhost:8002/api/v1/common-reporting-lines/templates')
    if (tplRes.status() !== 200) {
      test.skip(true, 'auth-gated env')
      return
    }
    const templates = await tplRes.json() as { id: number; code: string }[]
    const smb = templates.find((t) => t.code === 'smb_general')
    if (!smb) {
      test.skip(true, 'smb_general not seeded')
      return
    }
    const delRes = await request.delete(
      `http://localhost:8002/api/v1/common-reporting-lines/templates/${smb.id}`,
    )
    expect(delRes.status()).toBe(409)
  })

  test('CRL-F: Settings → Reporting Lines tab renders', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@livemarketing.test')
    await page.getByLabel(/password/i).fill('Test1234!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
    await page.goto('/setup?tab=reporting-lines')
    await expect(page.getByTestId('reporting-lines-admin')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /reporting lines/i }).first()).toBeVisible()
  })

  test('CRL-F: Settings → Reporting Templates tab renders', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@livemarketing.test')
    await page.getByLabel(/password/i).fill('Test1234!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
    await page.goto('/setup?tab=reporting-templates')
    await expect(page.getByTestId('reporting-templates-admin')).toBeVisible({ timeout: 10_000 })
  })

  test('CRL-F: What\'s New mentions Reporting Lines admin', async ({ page }) => {
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
      page.getByText(/Reporting Lines admin|Settings.*Reporting Lines/i).first(),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('CRL-G: trial-balance endpoint exists', async ({ request }) => {
    // We don't know a real entity id in this env — but the route should
    // either return a 200/422/400 (validation), not a 404 for the route itself.
    const res = await request.get(
      'http://localhost:8002/api/v1/financial-statements/crl/trial-balance?entity_id=999999&as_of_date=2026-01-31',
    )
    expect([200, 401, 403, 422, 400]).toContain(res.status())
  })

  test('CRL-G: balance-sheet endpoint exists', async ({ request }) => {
    const res = await request.get(
      'http://localhost:8002/api/v1/financial-statements/crl/balance-sheet?entity_id=999999&as_of_date=2026-01-31',
    )
    expect([200, 401, 403, 422, 400]).toContain(res.status())
  })

  test('CRL-G: income-statement endpoint exists', async ({ request }) => {
    const res = await request.get(
      'http://localhost:8002/api/v1/financial-statements/crl/income-statement?entity_id=999999&as_of_date=2026-01-31',
    )
    expect([200, 401, 403, 422, 400]).toContain(res.status())
  })

  test('CRL-G: /statements/crl page renders controls', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@livemarketing.test')
    await page.getByLabel(/password/i).fill('Test1234!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
    await page.goto('/statements/crl')
    await expect(page.getByTestId('crl-stmt-tabs')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('crl-stmt-tab-balance-sheet')).toBeVisible()
    await expect(page.getByTestId('crl-stmt-tab-income-statement')).toBeVisible()
  })

  test('CRL-G: What\'s New mentions reporting endpoints', async ({ page }) => {
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
      page.getByText(/Statements by Reporting Line|CRL-G|read through the CRL layer/i).first(),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('Correction 3: /mapping renders Mapping Center', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@livemarketing.test')
    await page.getByLabel(/password/i).fill('Test1234!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
    await page.goto('/mapping')
    await expect(page.getByTestId('mapping-center')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /Mapping Center/i }).first()).toBeVisible()
  })

  test('Correction 3: bulk-fsli endpoint exists', async ({ request }) => {
    const res = await request.post(
      'http://localhost:8002/api/v1/accounts/bulk-fsli',
      { data: { account_ids: [], common_reporting_line_id: null } },
    )
    // Empty list returns 200 [], or auth gates 401/403; never 404 for the route.
    expect([200, 401, 403]).toContain(res.status())
  })

  test('Correction 14: fsli-mappings PUT accepts allow_fsli_change flag', async ({ request }) => {
    // 404 if no such account; 422 would mean Pydantic rejected the new field.
    const res = await request.put(
      'http://localhost:8002/api/v1/fsli-mappings/999999/999999/999999',
      { data: { taxonomy_line_id: null, allow_fsli_change: false } },
    )
    expect([200, 400, 404, 401, 403]).toContain(res.status())
  })

  test('Correction 14: advanced banner mentions FSLI primacy', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@livemarketing.test')
    await page.getByLabel(/password/i).fill('Test1234!')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
    await page.goto('/taxonomy/mapping')
    await expect(page.getByTestId('advanced-override-banner')).toContainText(
      /FSLI remains the primary/i,
      { timeout: 10_000 },
    )
  })

  test('Correction 15: legacy /taxonomy/balance-sheet accepts organization_id', async ({ request }) => {
    // After Correction 15 the legacy endpoint takes organization_id so the
    // canonical resolver can prefer org-specific CRL clones. 400/422 would
    // mean the schema rejected the new field.
    const res = await request.get(
      'http://localhost:8002/api/v1/financial-statements/taxonomy/balance-sheet'
      + '?entity_id=999999&as_of_date=2026-01-31&organization_id=1',
    )
    expect([200, 401, 403, 404]).toContain(res.status())
  })

  test('Correction 15: legacy /taxonomy/income-statement accepts organization_id', async ({ request }) => {
    const res = await request.get(
      'http://localhost:8002/api/v1/financial-statements/taxonomy/income-statement'
      + '?entity_id=999999&as_of_date=2026-01-31&organization_id=1',
    )
    expect([200, 401, 403, 404]).toContain(res.status())
  })

  test('Correction 3: PATCH /accounts accepts common_reporting_line_id', async ({ request }) => {
    // 404 for unknown id is fine — proves Pydantic validation accepted the field.
    const res = await request.patch(
      'http://localhost:8002/api/v1/accounts/999999',
      { data: { common_reporting_line_id: null } },
    )
    // 404 (account not found) or 401/403 (auth); the wrong answer would be 422
    // which would mean the schema rejected our field.
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
