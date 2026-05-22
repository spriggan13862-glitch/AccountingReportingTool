/**
 * M36 — PDF Import E2E tests.
 *
 * Tests the full PDF ingestion workflow:
 *   1. Navigate to PDF Import page
 *   2. Upload Hero Group PDF
 *   3. Verify extraction results (entity name, date, basis)
 *   4. Verify all 13 subtotal validation checks pass
 *   5. Verify extracted line counts
 *   6. Verify temp account code patterns
 *   7. Apply import and confirm success
 *   8. Verify API: /pdf-imports/{id}/validate endpoint
 *   9. Verify API: /pdf-imports/{id}/mapping endpoint
 *
 * Backend: http://localhost:8002
 * Frontend: http://localhost:5174
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

const ADMIN_EMAIL = 'admin@livemarketing.test'
const ADMIN_PASSWORD = 'Test1234!'
const API_BASE = 'http://localhost:8002/api/v1'
const PDF_PATH = path.resolve(__dirname, '../../tests/fixtures/pdf/hero_group_financial_statements_2025.pdf')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiLogin(request: APIRequestContext): Promise<string> {
  const resp = await request.post(`${API_BASE}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  expect(resp.ok(), `login failed: ${await resp.text()}`).toBeTruthy()
  const { access_token } = await resp.json()
  return access_token
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/$|\/dashboard/, { timeout: 10_000 })
}

// ---------------------------------------------------------------------------
// API-level tests (no browser)
// ---------------------------------------------------------------------------

let _token: string | null = null
let _batchId: number | null = null

test.beforeAll(async ({ request }) => {
  _token = await apiLogin(request)
})

test('API P1 — PDF upload endpoint accepts PDF and returns preview', async ({ request }) => {
  const pdfContent = fs.readFileSync(PDF_PATH)
  const resp = await request.post(`${API_BASE}/pdf-imports/upload`, {
    headers: { Authorization: `Bearer ${_token}` },
    multipart: {
      file: {
        name: 'hero_group_financial_statements_2025.pdf',
        mimeType: 'application/pdf',
        buffer: pdfContent,
      },
    },
  })
  expect(resp.ok(), `upload failed: ${await resp.text()}`).toBeTruthy()
  const data = await resp.json()

  expect(data.batch_id).toBeGreaterThan(0)
  _batchId = data.batch_id

  // Header metadata
  expect(data.source_entity_name).toBe('HERO GROUP, INC')
  expect(data.statement_date).toBe('2025-12-31')
  expect(data.basis_of_accounting).toBe('income_tax')
  expect(data.page_count).toBe(6)

  // Line counts
  expect(data.line_count).toBeGreaterThanOrEqual(50)
  expect(data.subtotal_count).toBeGreaterThanOrEqual(10)

  // Lines array populated
  expect(Array.isArray(data.lines)).toBe(true)
  expect(data.lines.length).toBeGreaterThan(0)

  // Validation present
  expect(data.validation).toBeTruthy()
  expect(data.validation.passing).toBeGreaterThan(0)
  expect(data.validation.failing).toBe(0)
})

test('API P2 — validation endpoint: all 13 checks pass', async ({ request }) => {
  if (!_batchId) test.skip()

  const resp = await request.get(`${API_BASE}/pdf-imports/${_batchId}/validate`, {
    headers: { Authorization: `Bearer ${_token}` },
  })
  expect(resp.ok()).toBeTruthy()
  const data = await resp.json()

  expect(data.failing).toBe(0)
  expect(data.total).toBeGreaterThanOrEqual(13)

  const EXPECTED_KEYS = [
    'total_current_assets',
    'net_fixed_assets',
    'total_other_assets',
    'total_assets',
    'total_current_liabilities',
    'total_long_term_liabilities',
    'total_equity',
    'total_income',
    'total_cogs',
    'gross_profit',
    'total_operating_expenses',
    'total_other_income',
    'net_income',
  ]
  const keys = data.checks.map((c: { key: string }) => c.key)
  for (const k of EXPECTED_KEYS) {
    expect(keys, `missing validation key: ${k}`).toContain(k)
  }

  // Spot-check specific amounts
  const byKey = Object.fromEntries(data.checks.map((c: { key: string }) => [c.key, c]))
  expect(byKey['total_assets'].extracted).toBe('1338287.80')
  expect(byKey['gross_profit'].extracted).toBe('1960042.39')
  expect(byKey['net_income'].extracted).toBe('840954.90')
})

test('API P3 — mapping endpoint: buckets by taxonomy code', async ({ request }) => {
  if (!_batchId) test.skip()

  const resp = await request.get(`${API_BASE}/pdf-imports/${_batchId}/mapping`, {
    headers: { Authorization: `Bearer ${_token}` },
  })
  expect(resp.ok()).toBeTruthy()
  const data = await resp.json()

  expect(data.bucket_count).toBeGreaterThan(0)
  const codes = data.buckets.map((b: { taxonomy_code: string }) => b.taxonomy_code)
  expect(codes).toContain('cash_equivalents')
  expect(codes).toContain('cogs')
  expect(codes).toContain('revenue')
  expect(codes).toContain('property_equipment')

  // Revenue bucket total
  const revBucket = data.buckets.find((b: { taxonomy_code: string }) => b.taxonomy_code === 'revenue')
  expect(revBucket).toBeTruthy()
  expect(parseFloat(revBucket.total_amount)).toBeCloseTo(5334329.47, 0)
})

test('API P4 — apply endpoint: persists lines and updates status', async ({ request }) => {
  if (!_batchId) test.skip()

  const resp = await request.post(`${API_BASE}/pdf-imports/${_batchId}/apply`, {
    headers: { Authorization: `Bearer ${_token}` },
  })
  expect(resp.ok(), `apply failed: ${await resp.text()}`).toBeTruthy()
  const data = await resp.json()

  expect(data.status).toBe('applied')
  expect(data.accounts_created).toBeGreaterThanOrEqual(50)
})

test('API P5 — list endpoint: shows applied batch', async ({ request }) => {
  if (!_batchId) test.skip()

  const resp = await request.get(`${API_BASE}/pdf-imports/`, {
    headers: { Authorization: `Bearer ${_token}` },
  })
  expect(resp.ok()).toBeTruthy()
  const data = await resp.json()

  expect(Array.isArray(data)).toBe(true)
  const batch = data.find((b: { id: number }) => b.id === _batchId)
  expect(batch).toBeTruthy()
  expect(batch.status).toBe('applied')
})

// ---------------------------------------------------------------------------
// Browser (UI) tests
// ---------------------------------------------------------------------------

test('UI P1 — PDF Import page loads and shows upload zone', async ({ page }) => {
  await login(page)
  await page.goto('/pdf-import')
  await expect(page.locator('[data-testid="pdf-drop-zone"]')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('[data-testid="parse-pdf-btn"]')).toBeVisible()
  await expect(page.locator('[data-testid="parse-pdf-btn"]')).toBeDisabled()
})

test('UI P2 — PDF Import page accessible from sidebar', async ({ page }) => {
  await login(page)
  await page.goto('/')
  await page.getByText('PDF Import').click()
  await expect(page).toHaveURL(/\/pdf-import/)
  await expect(page.locator('[data-testid="pdf-drop-zone"]')).toBeVisible({ timeout: 8_000 })
})

test('UI P3 — Upload Hero Group PDF and see preview', async ({ page }) => {
  await login(page)
  await page.goto('/pdf-import')

  const fileInput = page.locator('[data-testid="pdf-file-input"]')
  await fileInput.setInputFiles(PDF_PATH)

  const parseBtn = page.locator('[data-testid="parse-pdf-btn"]')
  await expect(parseBtn).toBeEnabled({ timeout: 3_000 })
  await parseBtn.click()

  // Wait for preview to appear
  await expect(page.locator('[data-testid="apply-pdf-btn"]')).toBeVisible({ timeout: 15_000 })

  // Entity name
  await expect(page.getByText('HERO GROUP, INC')).toBeVisible()
  // Statement date
  await expect(page.getByText('2025-12-31')).toBeVisible()
  // Income tax basis
  await expect(page.getByText(/income tax/i)).toBeVisible()
})

test('UI P4 — Preview shows passing validation', async ({ page }) => {
  await login(page)
  await page.goto('/pdf-import')

  const fileInput = page.locator('[data-testid="pdf-file-input"]')
  await fileInput.setInputFiles(PDF_PATH)
  await page.locator('[data-testid="parse-pdf-btn"]').click()
  await expect(page.locator('[data-testid="apply-pdf-btn"]')).toBeVisible({ timeout: 15_000 })

  // All subtotals should pass
  await expect(page.getByText(/passing/i)).toBeVisible()
  // Apply button enabled (no failures)
  await expect(page.locator('[data-testid="apply-pdf-btn"]')).toBeEnabled()
})

test('UI P5 — Preview table shows extracted accounts', async ({ page }) => {
  await login(page)
  await page.goto('/pdf-import')

  const fileInput = page.locator('[data-testid="pdf-file-input"]')
  await fileInput.setInputFiles(PDF_PATH)
  await page.locator('[data-testid="parse-pdf-btn"]').click()
  await expect(page.locator('[data-testid="apply-pdf-btn"]')).toBeVisible({ timeout: 15_000 })

  // Verify some known accounts appear
  await expect(page.getByText('PETTY CASH')).toBeVisible()
  await expect(page.getByText('Current Assets')).toBeVisible()
})

// ---------------------------------------------------------------------------
// M36c — API tests (lines, audit, PATCH)
// ---------------------------------------------------------------------------

test('API P6 — lines endpoint returns persisted lines with stable codes', async ({ request }) => {
  if (!_batchId) test.skip()

  const resp = await request.get(`${API_BASE}/pdf-imports/${_batchId}/lines`, {
    headers: { Authorization: `Bearer ${_token}` },
  })
  expect(resp.ok(), `lines failed: ${await resp.text()}`).toBeTruthy()
  const data = await resp.json()

  expect(Array.isArray(data)).toBe(true)
  expect(data.length).toBeGreaterThan(0)

  // Every line has required M36b fields
  const sample = data[0]
  expect(sample).toHaveProperty('id')
  expect(sample).toHaveProperty('temp_account_code')
  expect(sample).toHaveProperty('name_hash')
  expect(sample).toHaveProperty('taxonomy_code')
  expect(sample).toHaveProperty('taxonomy_source')
  expect(sample).toHaveProperty('taxonomy_locked')
  expect(sample).toHaveProperty('legal_entity_code')
  expect(sample).toHaveProperty('consolidation_group')

  // Stable codes follow HERO-{STMT}-{CAT}-{HASH8} pattern
  const codes = data.map((l: { temp_account_code: string }) => l.temp_account_code)
  expect(codes.some((c: string) => /^HERO-BS-/.test(c))).toBe(true)
  expect(codes.some((c: string) => /^HERO-IS-/.test(c))).toBe(true)
  // Hash segment: 8 uppercase hex chars at the end (no collision suffix)
  expect(codes.some((c: string) => /[A-F0-9]{8}$/.test(c))).toBe(true)
})

test('API P7 — audit endpoint returns full extraction trail', async ({ request }) => {
  if (!_batchId) test.skip()

  const resp = await request.get(`${API_BASE}/pdf-imports/${_batchId}/audit`, {
    headers: { Authorization: `Bearer ${_token}` },
  })
  expect(resp.ok()).toBeTruthy()
  const data = await resp.json()

  expect(data.batch_id).toBe(_batchId)
  expect(data.source_entity_name).toBe('HERO GROUP, INC')
  expect(data.status).toBe('applied')
  expect(Array.isArray(data.lines)).toBe(true)
  expect(data.lines.length).toBeGreaterThan(0)

  // Each audit line has source evidence
  const line = data.lines[0]
  expect(line).toHaveProperty('temp_account_code')
  expect(line).toHaveProperty('account_name')
  expect(line).toHaveProperty('page_number')
  expect(line).toHaveProperty('source_line_text')
  expect(line).toHaveProperty('mapping')
  expect(line.mapping).toHaveProperty('taxonomy_code')
  expect(line.mapping).toHaveProperty('taxonomy_source')
})

test('API P8 — PATCH line updates taxonomy code and locks it', async ({ request }) => {
  if (!_batchId) test.skip()

  // Get first non-subtotal line
  const linesResp = await request.get(`${API_BASE}/pdf-imports/${_batchId}/lines`, {
    headers: { Authorization: `Bearer ${_token}` },
  })
  const lines = await linesResp.json()
  const targetLine = lines.find((l: { is_subtotal: boolean }) => !l.is_subtotal)
  if (!targetLine) test.skip()

  const originalTaxonomy = targetLine.taxonomy_code

  // Patch with a manual taxonomy override
  const patchResp = await request.patch(
    `${API_BASE}/pdf-imports/${_batchId}/lines/${targetLine.id}`,
    {
      headers: { Authorization: `Bearer ${_token}` },
      data: { taxonomy_code: 'other_assets', taxonomy_locked: true },
    },
  )
  expect(patchResp.ok(), `patch failed: ${await patchResp.text()}`).toBeTruthy()
  const updated = await patchResp.json()

  expect(updated.taxonomy_code).toBe('other_assets')
  expect(updated.taxonomy_locked).toBe(true)
  expect(updated.taxonomy_source).toBe('manual')

  // Restore original to avoid side effects on subsequent tests
  await request.patch(
    `${API_BASE}/pdf-imports/${_batchId}/lines/${targetLine.id}`,
    {
      headers: { Authorization: `Bearer ${_token}` },
      data: { taxonomy_code: originalTaxonomy, taxonomy_locked: false },
    },
  )
})

// ---------------------------------------------------------------------------
// M36c — UI tests (applied view, stable codes, export, audit)
// ---------------------------------------------------------------------------

test('UI P6 — Upload, apply, and see applied view with stable codes', async ({ page }) => {
  await login(page)
  await page.goto('/pdf-import')

  // Upload PDF
  const fileInput = page.locator('[data-testid="pdf-file-input"]')
  await fileInput.setInputFiles(PDF_PATH)
  await page.locator('[data-testid="parse-pdf-btn"]').click()

  // Wait for preview
  await expect(page.locator('[data-testid="apply-pdf-btn"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-testid="apply-pdf-btn"]')).toBeEnabled()

  // Apply
  await page.locator('[data-testid="apply-pdf-btn"]').click()

  // Applied view should appear
  await expect(page.locator('[data-testid="export-csv-btn"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-testid="new-import-btn"]')).toBeVisible()

  // Tabs present
  await expect(page.locator('[data-testid="tab-lines"]')).toBeVisible()
  await expect(page.locator('[data-testid="tab-audit"]')).toBeVisible()

  // Stable codes should appear
  await expect(page.locator('[data-testid="stable-code"]').first()).toBeVisible({ timeout: 10_000 })
  const firstCode = await page.locator('[data-testid="stable-code"]').first().innerText()
  expect(firstCode).toMatch(/^HERO-(BS|IS)-/)
})

test('UI P7 — Applied view shows all M36b columns', async ({ page }) => {
  await login(page)
  await page.goto('/pdf-import')

  const fileInput = page.locator('[data-testid="pdf-file-input"]')
  await fileInput.setInputFiles(PDF_PATH)
  await page.locator('[data-testid="parse-pdf-btn"]').click()
  await expect(page.locator('[data-testid="apply-pdf-btn"]')).toBeVisible({ timeout: 15_000 })
  await page.locator('[data-testid="apply-pdf-btn"]').click()
  await expect(page.locator('[data-testid="export-csv-btn"]')).toBeVisible({ timeout: 15_000 })

  // Wait for lines to load
  await expect(page.locator('[data-testid="stable-code"]').first()).toBeVisible({ timeout: 10_000 })

  // Column headers visible
  await expect(page.getByText('Stable Code')).toBeVisible()
  await expect(page.getByText('Official Code')).toBeVisible()
  await expect(page.getByText('Taxonomy')).toBeVisible()
  await expect(page.getByText('Legal Entity')).toBeVisible()
  await expect(page.getByText('Consol. Group')).toBeVisible()

  // Legal entity and consolidation group cells present
  await expect(page.locator('[data-testid="legal-entity-cell"]').first()).toBeVisible()
  await expect(page.locator('[data-testid="consol-group-cell"]').first()).toBeVisible()
})

test('UI P8 — Audit trail tab shows extraction evidence', async ({ page }) => {
  await login(page)
  await page.goto('/pdf-import')

  const fileInput = page.locator('[data-testid="pdf-file-input"]')
  await fileInput.setInputFiles(PDF_PATH)
  await page.locator('[data-testid="parse-pdf-btn"]').click()
  await expect(page.locator('[data-testid="apply-pdf-btn"]')).toBeVisible({ timeout: 15_000 })
  await page.locator('[data-testid="apply-pdf-btn"]').click()
  await expect(page.locator('[data-testid="export-csv-btn"]')).toBeVisible({ timeout: 15_000 })

  // Switch to audit trail tab
  await page.locator('[data-testid="tab-audit"]').click()

  // Audit rows should appear
  await expect(page.locator('[data-testid="audit-row"]').first()).toBeVisible({ timeout: 10_000 })
  const rowCount = await page.locator('[data-testid="audit-row"]').count()
  expect(rowCount).toBeGreaterThan(0)

  // Source line text column should contain raw PDF text
  const sourceTexts = await page.locator('[data-testid="audit-row"]').allInnerTexts()
  expect(sourceTexts.some((t) => t.includes('PETTY CASH'))).toBe(true)
})

test('UI P9 — Batch history appears on upload step and links to applied view', async ({ page }) => {
  await login(page)
  await page.goto('/pdf-import')

  // History should show after a batch has been applied (API P4 already applied one)
  await expect(page.locator('[data-testid="batch-history"]')).toBeVisible({ timeout: 8_000 })

  // Should have at least one View link
  const viewLinks = page.locator('[data-testid^="view-batch-"]')
  await expect(viewLinks.first()).toBeVisible()

  // Click View to navigate to applied lines
  await viewLinks.first().click()
  await expect(page.locator('[data-testid="export-csv-btn"]')).toBeVisible({ timeout: 8_000 })
})
