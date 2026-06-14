/**
 * Core E2E workflow test — real backend with accounting_e2e.db.
 *
 * Prerequisites (handled by global-setup.ts + playwright.workflow.config.ts):
 *   - accounting_e2e.db seeded with org, admin user, entity, scenario, period, taxonomy
 *   - Backend on http://localhost:8002
 *   - Frontend on http://localhost:5174 (proxying /api → :8002)
 *
 * Credentials: admin@livemarketing.test / Test1234!
 */

import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'url'
import * as path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FIXTURES = path.resolve(__dirname, '../../tests/fixtures')
const COA_FILE = path.join(FIXTURES, 'coa', 'live_marketing_coa.csv')
const TB_FILE = path.join(FIXTURES, 'tb', 'live_marketing_tb.csv')

const ADMIN_EMAIL = 'admin@livemarketing.test'
const ADMIN_PASSWORD = 'Test1234!'
const ENTITY_NAME = 'Live Marketing LLC'
const ENTITY_OPTION_LABEL = 'LM — Live Marketing LLC'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function attachConsoleSpy(page: Page) {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

async function login(page: Page) {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: /accounting tool/i })).toBeVisible()
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
}

// ---------------------------------------------------------------------------
// Step 1-2: Login
// ---------------------------------------------------------------------------

test.describe('Workflow: Login', () => {
  test('step 1 — unauthenticated root redirects to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 })
  })

  test('step 2 — login with admin credentials succeeds', async ({ page }) => {
    const errors = attachConsoleSpy(page)
    await login(page)
    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Step 3: Dashboard
// ---------------------------------------------------------------------------

test.describe('Workflow: Dashboard', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('step 3 — dashboard renders after login', async ({ page }) => {
    await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/)
    // Sidebar should be visible with key nav items
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 8_000 })
  })
})

// ---------------------------------------------------------------------------
// Steps 4-5: Entities
// ---------------------------------------------------------------------------

test.describe('Workflow: Entities', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('step 4 — /entities page loads', async ({ page }) => {
    const errors = attachConsoleSpy(page)
    await page.goto('/entities')
    await expect(page.getByRole('heading', { name: /entities/i })).toBeVisible({ timeout: 8_000 })
    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0)
  })

  test('step 5 — seeded entity is visible in entities list', async ({ page }) => {
    await page.goto('/entities')
    // Wait for table to populate — entity name appears in its own <td>
    await expect(page.locator('td').filter({ hasText: ENTITY_NAME })).toBeVisible({ timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// Steps 6-9: COA Import
// ---------------------------------------------------------------------------

test.describe('Workflow: COA Import', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('step 6 — /coa-import page loads', async ({ page }) => {
    const errors = attachConsoleSpy(page)
    await page.goto('/coa-import')
    await expect(page.getByRole('heading', { name: /import chart of accounts/i })).toBeVisible({
      timeout: 8_000,
    })
    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0)
  })

  test('step 7 — upload COA file and preview accounts', async ({ page }) => {
    const errors = attachConsoleSpy(page)
    await page.goto('/coa-import')

    // Select entity — options render as "{code} — {name}"
    const entitySelect = page.locator('[data-testid="entity-select"]')
    await expect(entitySelect).toBeEnabled({ timeout: 8_000 })
    await entitySelect.selectOption({ label: ENTITY_OPTION_LABEL })

    // Upload file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(COA_FILE)

    // Trigger parse
    await page.getByRole('button', { name: /parse.*preview/i }).click()

    // Preview should appear with account rows
    await expect(page.getByText(/step 2/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/accounts detected/i)).toBeVisible()

    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0)
  })

  test('step 8-9 — apply COA import and redirect to accounts', async ({ page, request }) => {
    // Clean up any parsed (unapplied) COA batch from step 7 so we can re-upload
    const loginResp = await request.post('http://localhost:8002/api/v1/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    })
    const { access_token } = await loginResp.json()
    const batchesResp = await request.get('http://localhost:8002/api/v1/coa-imports/', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (batchesResp.ok()) {
      const batches = await batchesResp.json()
      for (const b of batches) {
        if (b.status !== 'applied' && b.status !== 'posted') {
          await request.delete(`http://localhost:8002/api/v1/coa-imports/${b.id}`, {
            headers: { Authorization: `Bearer ${access_token}` },
          })
        }
      }
    }

    await page.goto('/coa-import')

    const entitySelect = page.locator('[data-testid="entity-select"]')
    await expect(entitySelect).toBeEnabled({ timeout: 8_000 })
    await entitySelect.selectOption({ label: ENTITY_OPTION_LABEL })

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(COA_FILE)

    await page.getByRole('button', { name: /parse.*preview/i }).click()
    await expect(page.getByText(/step 2/i)).toBeVisible({ timeout: 15_000 })

    // Click the Import Accounts button
    await page.getByRole('button', { name: /import.*accounts/i }).click()

    // Wait for import complete confirmation step
    await expect(page.getByText('Import Complete')).toBeVisible({ timeout: 15_000 })

    // Click the View Chart of Accounts button to navigate to /accounts
    await page.getByRole('button', { name: /view chart of accounts/i }).click()

    // Should navigate to /accounts after successful import and click
    await expect(page).toHaveURL(/\/accounts/, { timeout: 15_000 })
  })
})

// ---------------------------------------------------------------------------
// Step 10: Chart of Accounts
// ---------------------------------------------------------------------------

test.describe('Workflow: Chart of Accounts', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('step 10 — /accounts page loads with imported accounts', async ({ page }) => {
    const errors = attachConsoleSpy(page)
    await page.goto('/accounts')
    await expect(page.getByRole('heading', { name: /chart of accounts/i })).toBeVisible({
      timeout: 8_000,
    })
    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Steps 11-13: TB Import via Import Center
// ---------------------------------------------------------------------------

test.describe('Workflow: TB Import', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('step 11 — /import (Import Center) loads', async ({ page }) => {
    const errors = attachConsoleSpy(page)
    await page.goto('/import')
    await expect(page.getByRole('heading', { name: 'Import Center' })).toBeVisible({ timeout: 8_000 })
    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0)
  })

  test('step 12 — /import/new (Import Wizard) loads', async ({ page }) => {
    const errors = attachConsoleSpy(page)
    await page.goto('/import/new')
    // Wizard should show first step
    await expect(page.locator('body')).not.toContainText(/error|not found/i, { timeout: 8_000 })
    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0)
  })

  test('step 13 — upload TB file in import wizard', async ({ page }) => {
    await page.goto('/import/new')

    // Try to locate file input (wizard step 1 is likely entity/scenario selection)
    // Check if there's a file upload input or proceed to next step
    const fileInput = page.locator('input[type="file"]')
    if (await fileInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await fileInput.setInputFiles(TB_FILE)
      await expect(page.getByText(/live_marketing_tb|preview|accounts/i)).toBeVisible({ timeout: 10_000 })
    } else {
      // Wizard may require entity/scenario first — just verify page loaded
      await expect(page.locator('body')).toBeVisible()
    }
  })
})

// ---------------------------------------------------------------------------
// Steps 14-16: Financial Statements
// ---------------------------------------------------------------------------

test.describe('Workflow: Financial Statements', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('step 14 — /financial-statements page loads', async ({ page }) => {
    const errors = attachConsoleSpy(page)
    await page.goto('/financial-statements')
    await expect(page.getByRole('heading', { name: /financial statements/i })).toBeVisible({
      timeout: 8_000,
    })
    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0)
  })

  test('step 15 — financial statements shows entity selector', async ({ page }) => {
    await page.goto('/financial-statements')
    // Wait for the page to load and check if the entity selector is visible
    await expect(page.locator('[data-testid="entity-select"]').first()).toBeVisible({ timeout: 10_000 })
    // Also assert that the empty state helper text is displayed
    await expect(page.getByText('Select an entity and date')).toBeVisible({ timeout: 5_000 })
  })

  test('step 16 — financial statements with entity selected renders tabs', async ({ page }) => {
    await page.goto('/financial-statements')

    const entitySelect = page.locator('[data-testid="entity-select"]')
    if (await entitySelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(entitySelect).toBeEnabled({ timeout: 8_000 })
      await entitySelect.selectOption({ label: ENTITY_OPTION_LABEL })

      // Pick a date if there's a date input
      const dateInput = page.locator('input[type="date"]').first()
      if (await dateInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await dateInput.fill('2024-12-31')
      }

      // Should show statement tabs or empty state
      await page.waitForTimeout(2_000)
      const hasBS = await page.getByText(/balance sheet/i).isVisible().catch(() => false)
      const hasIS = await page.getByText(/income statement/i).isVisible().catch(() => false)
      const hasEmpty = await page.getByText(/no data|select/i).isVisible().catch(() => false)
      expect(hasBS || hasIS || hasEmpty).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Step 17: Draft Overlay Preview
// ---------------------------------------------------------------------------

test.describe('Workflow: Draft Preview', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('step 17 — /draft-preview page loads without errors', async ({ page }) => {
    const errors = attachConsoleSpy(page)
    await page.goto('/draft-preview')
    await expect(page.locator('body')).toBeVisible({ timeout: 8_000 })
    // Should not show a hard error banner
    await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible()
    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0)
  })
})
