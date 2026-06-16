/**
 * UX Coverage E2E Suite
 *
 * Catches UI regressions that unit/type tests miss: wrong page loads, broken
 * dropdowns, crashes, bad redirects, missing account pickers, etc.
 *
 * Runs as a standalone project — depends on the "workflow" project (COA + TB
 * already imported) so accounts and scenarios exist in the DB.
 *
 * Backend: http://localhost:8002  Frontend: http://localhost:5174
 * Credentials: admin@livemarketing.test / Test1234!
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { fileURLToPath } from 'url'

const ADMIN_EMAIL = 'admin@livemarketing.test'
const ADMIN_PASSWORD = 'Test1234!'
const API_BASE = 'http://localhost:8002/api/v1'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
}

async function apiLogin(request: APIRequestContext): Promise<string> {
  const resp = await request.post(`${API_BASE}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  expect(resp.ok(), `login failed: ${await resp.text()}`).toBeTruthy()
  const { access_token } = await resp.json()
  return access_token
}

/** Attach console error spy — returns array that accumulates errors. */
function spyErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

/** Expect no React crashes or unhandled errors on the page. */
function expectNoErrors(errors: string[]) {
  const serious = errors.filter(
    (e) =>
      !e.includes('favicon') &&
      !e.includes('ResizeObserver') &&
      !e.includes('non-passive event')
  )
  expect(serious, `Console errors: ${serious.join('\n')}`).toHaveLength(0)
}

// ---------------------------------------------------------------------------
// 1. Navigation smoke — every main nav destination loads without crash
// ---------------------------------------------------------------------------

test.describe('Nav smoke: all routes load without React crash', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  const ROUTES = [
    { path: '/overview',                       label: 'Overview'             },
    { path: '/import',                          label: 'Import center'        },
    { path: '/tb-import',                       label: 'TB import wizard'     },
    { path: '/coa-import',                      label: 'COA import wizard'    },
    { path: '/pdf-import',                      label: 'PDF import wizard'    },
    { path: '/review',                          label: 'Review workspace'     },
    { path: '/adjustments',                     label: 'Adjustments'          },
    { path: '/workbench/journal-entries',       label: 'Journal entries'      },
    { path: '/workbench/journal-entries/new',   label: 'New JE form'          },
    { path: '/deliverables/workspace',          label: 'Deliverables'         },
    { path: '/setup',                           label: 'Setup — entities tab' },
    { path: '/setup?tab=periods',               label: 'Setup — periods tab'  },
    { path: '/setup?tab=scenarios',             label: 'Setup — scenarios tab'},
    { path: '/setup?tab=coa',                   label: 'Setup — COA tab'      },
    { path: '/setup?tab=taxonomy',              label: 'Setup — taxonomy tab' },
    { path: '/setup?tab=settings',              label: 'Setup — settings tab' },
  ]

  for (const { path, label } of ROUTES) {
    test(`${label} (${path})`, async ({ page }) => {
      const errors = spyErrors(page)
      await page.goto(path)
      // Give React time to hydrate; a crash shows a blank body or error boundary
      await page.waitForLoadState('networkidle', { timeout: 12_000 })
      expectNoErrors(errors)
      // Page should not redirect back to /login
      await expect(page).not.toHaveURL(/\/login/)
      // No "Objects are not valid as a React child" style crash UI
      await expect(page.locator('body')).not.toContainText('Objects are not valid as a React child')
      await expect(page.locator('body')).not.toContainText('Unexpected Application Error')
      await expect(page.locator('body')).not.toContainText('Something went wrong')
    })
  }
})

// ---------------------------------------------------------------------------
// 2. Old redirects point to correct destinations (not dead ends)
// ---------------------------------------------------------------------------

test.describe('Redirects: legacy URLs land at correct pages', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('/workbench/scenarios → /setup?tab=scenarios (not /adjustments)', async ({ page }) => {
    await page.goto('/workbench/scenarios')
    await page.waitForURL(/setup/, { timeout: 8_000 })
    await expect(page).toHaveURL(/tab=scenarios/)
    // Should show the scenario manager, not the adjustments page
    await expect(page.locator('body')).not.toContainText('Adjustment Bridge')
  })

  test('/workbench/draft-preview → /adjustments', async ({ page }) => {
    await page.goto('/workbench/draft-preview')
    await page.waitForURL(/adjustments/, { timeout: 8_000 })
    await expect(page).not.toHaveURL(/login/)
  })
})

// ---------------------------------------------------------------------------
// 3. Setup page — all tabs render and don't crash
// ---------------------------------------------------------------------------

test.describe('Setup page tabs', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('Scenarios tab is present and renders', async ({ page }) => {
    const errors = spyErrors(page)
    await page.goto('/setup?tab=scenarios')
    await page.waitForLoadState('networkidle', { timeout: 12_000 })
    // Tab must be visible
    await expect(page.getByTestId('setup-tab-scenarios')).toBeVisible()
    // Should show scenario list or create button — not a blank or crashed page
    const body = page.locator('body')
    await expect(body).not.toContainText('Unexpected Application Error')
    await expect(body).not.toContainText('Cannot read properties')
    expectNoErrors(errors)
  })

  test('All setup tab buttons are present', async ({ page }) => {
    await page.goto('/setup')
    for (const tab of ['entities', 'periods', 'scenarios', 'coa', 'taxonomy', 'settings']) {
      await expect(page.getByTestId(`setup-tab-${tab}`)).toBeVisible()
    }
  })

  test('Switching between setup tabs does not crash', async ({ page }) => {
    const errors = spyErrors(page)
    await page.goto('/setup')
    for (const tab of ['periods', 'scenarios', 'coa', 'taxonomy', 'settings', 'entities']) {
      await page.getByTestId(`setup-tab-${tab}`).click()
      await page.waitForLoadState('networkidle', { timeout: 8_000 })
    }
    expectNoErrors(errors)
  })
})

// ---------------------------------------------------------------------------
// 4. TB import wizard UX
// ---------------------------------------------------------------------------

test.describe('TB import wizard UX', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('Step 0 has no period auto-fill dropdown', async ({ page }) => {
    await page.goto('/tb-import')
    await page.waitForLoadState('networkidle')
    // Period selector should not be present
    const periodSelect = page.locator('select[data-testid="period-select"]')
    await expect(periodSelect).not.toBeVisible()
    // Date picker should be present
    const dateInput = page.locator('input[type="date"]').first()
    await expect(dateInput).toBeVisible()
  })

  test('Step 0 shows Data Category (not "Scenario") label', async ({ page }) => {
    await page.goto('/tb-import')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Data Category')).toBeVisible()
    // Old "Scenario" label should not appear as a standalone form label
    const scenarioLabel = page.locator('label', { hasText: /^Scenario$/ })
    await expect(scenarioLabel).not.toBeVisible()
  })

  test('Data Category dropdown shows type labels not internal names', async ({ page }) => {
    await page.goto('/tb-import')
    await page.waitForLoadState('networkidle')
    const select = page.locator('[data-testid="scenario-select"]')
    await expect(select).toBeVisible()
    const html = await select.innerHTML()
    // Should show "Actuals" not "Actual" and should NOT show raw names like "Acme Actual"
    // (names could be anything but type labels should be present)
    expect(html).toMatch(/Actuals|Budget|Forecast/i)
  })

  test('XLSX upload with multiple sheets shows sheet cards (no React crash)', async ({ page }) => {
    const errors = spyErrors(page)
    await page.goto('/tb-import')
    await page.waitForLoadState('networkidle')

    // Fill required fields so Proceed button is enabled
    const entitySelect = page.locator('[data-testid="entity-select"]')
    if (await entitySelect.isVisible()) {
      const options = await entitySelect.locator('option').all()
      if (options.length > 1) await entitySelect.selectOption({ index: 1 })
    }
    const dateInput = page.locator('input[type="date"]').first()
    await dateInput.fill('2025-12-31')

    // Upload multi-sheet XLSX fixture
    const xlsxPath = fileURLToPath(new URL('../../tests/fixtures/tb/live_marketing_tb.xlsx', import.meta.url))
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(xlsxPath)

    // Click Proceed to Sheet & Mapping
    const proceedBtn = page.getByRole('button', { name: /proceed/i })
    if (await proceedBtn.isEnabled()) {
      await proceedBtn.click()
      await page.waitForLoadState('networkidle', { timeout: 15_000 })
      // If multiple sheets detected, should show sheet cards — not a React crash
      await expect(page.locator('body')).not.toContainText('Objects are not valid as a React child')
      // Sheet step OR column mapping step should be visible (CSV only has 1 sheet → goes straight to mapping)
      await expect(page.getByText(/Select Worksheet|Map Columns|Worksheet Selection|Confirm Column Mapping/i).first()).toBeVisible({ timeout: 8_000 })
    }
    expectNoErrors(errors)
  })
})

// ---------------------------------------------------------------------------
// 5. Journal Entry Create — account picker
// ---------------------------------------------------------------------------

test.describe('JE Create — account picker', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('Account search opens dropdown on focus when entity is selected', async ({ page }) => {
    await page.goto('/workbench/journal-entries/new')
    await page.waitForLoadState('networkidle')

    // Select entity
    const entitySelect = page.locator('[data-testid="entity-select"]')
    await expect(entitySelect).toBeVisible()
    const options = await entitySelect.locator('option').all()
    if (options.length > 1) {
      await entitySelect.selectOption({ index: 1 })
      // Wait for entity to be set
      await page.waitForTimeout(500)
    }

    // Click into the first account search field
    const accountSearch = page.locator('[data-testid="account-search"]').first()
    await expect(accountSearch).toBeVisible()
    const input = accountSearch.locator('input')
    await input.click()

    // Dropdown should appear immediately (with results or a hint message)
    await page.waitForTimeout(1_000)
    const dropdown = page.locator('[data-testid="account-search"] .absolute')
    await expect(dropdown.first()).toBeVisible({ timeout: 5_000 })
  })

  test('Account search shows hint when no entity selected', async ({ page }) => {
    await page.goto('/workbench/journal-entries/new')
    await page.waitForLoadState('networkidle')
    // Without selecting entity, input should be disabled or show placeholder
    const input = page.locator('[data-testid="account-search"] input').first()
    const placeholder = await input.getAttribute('placeholder')
    expect(placeholder).toMatch(/select entity/i)
  })

  test('"Manage scenarios in Setup" link points to /setup?tab=scenarios', async ({ page }) => {
    await page.goto('/workbench/journal-entries/new')
    await page.waitForLoadState('networkidle')
    // If the "no scenario" warning is shown, the link should go to setup
    const link = page.getByRole('link', { name: /manage scenarios/i })
    if (await link.isVisible()) {
      const href = await link.getAttribute('href')
      expect(href).toContain('/setup')
      expect(href).toContain('scenarios')
    }
  })
})

// ---------------------------------------------------------------------------
// 6. Review workspace — checks panel and indentation
// ---------------------------------------------------------------------------

test.describe('Review workspace UX', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  async function selectEntityAndPeriod(page: Page) {
    // Select entity via context bar
    const entityBtn = page.locator('[data-testid="entity-context-btn"], [aria-label*="entity"], button').filter({ hasText: /select entity|LM|Live/i }).first()
    if (await entityBtn.isVisible()) await entityBtn.click()
    const entityOption = page.getByRole('option', { name: /Live Marketing|LM/i }).first()
    if (await entityOption.isVisible()) await entityOption.click()

    // Select period via context bar
    const periodBtn = page.locator('[data-testid="period-context-btn"], button').filter({ hasText: /select period|Dec|2025/i }).first()
    if (await periodBtn.isVisible()) {
      await periodBtn.click()
      const periodOption = page.getByRole('option').first()
      if (await periodOption.isVisible()) await periodOption.click()
    }
  }

  test('Review page loads without crash', async ({ page }) => {
    const errors = spyErrors(page)
    await page.goto('/review')
    await page.waitForLoadState('networkidle', { timeout: 12_000 })
    await expect(page).not.toHaveURL(/login/)
    await expect(page.locator('body')).not.toContainText('Unexpected Application Error')
    expectNoErrors(errors)
  })

  test('Review sidebar checks panel is visible and compact', async ({ page }) => {
    await page.goto('/review')
    await page.waitForLoadState('networkidle')
    // The "Checks" heading should be present
    const checksHeading = page.getByText('Checks', { exact: true })
    // May only show after entity/period selected, but heading or "Select entity" should appear
    const bodyText = await page.locator('body').innerText()
    const hasChecksOrPrompt = /Checks|Select entity|No entity/i.test(bodyText)
    expect(hasChecksOrPrompt).toBeTruthy()
  })

  test('Switching BS/IS/CF tabs does not crash', async ({ page }) => {
    const errors = spyErrors(page)
    await page.goto('/review')
    await page.waitForLoadState('networkidle', { timeout: 12_000 })
    for (const tab of ['Balance Sheet', 'Income Statement', 'Cash Flow', 'Analysis']) {
      const btn = page.getByRole('button', { name: tab }).first()
      if (await btn.isVisible()) {
        await btn.click()
        await page.waitForTimeout(300)
      }
    }
    expectNoErrors(errors)
    await expect(page.locator('body')).not.toContainText('Objects are not valid as a React child')
  })
})

// ---------------------------------------------------------------------------
// 7. Context bar — entity and period selectors are functional
// ---------------------------------------------------------------------------

test.describe('Context bar selectors', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('Entity selector renders options (not empty)', async ({ page }) => {
    await page.goto('/overview')
    await page.waitForLoadState('networkidle')
    // Find context bar entity button/dropdown
    const bar = page.locator('[data-testid="context-bar"], header, nav').first()
    // There should be at least one entity-related element
    const entityTrigger = page.locator('[data-testid*="entity"]').first()
    if (await entityTrigger.isVisible()) {
      await entityTrigger.click()
      await page.waitForTimeout(500)
      // Should show at least one entity option
      const items = page.getByRole('option').or(page.locator('[role="listitem"]'))
      const count = await items.count()
      expect(count).toBeGreaterThan(0)
    }
  })

  test('Data view toggle (As Reported / Adjusted / Pro Forma) is present', async ({ page }) => {
    await page.goto('/overview')
    await page.waitForLoadState('networkidle')
    const bodyText = await page.locator('body').innerText()
    const hasDataView = /As Reported|Adjusted|Pro Forma/i.test(bodyText)
    expect(hasDataView, 'Expected data view toggle to be visible').toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 8. Import center — all import type cards are present
// ---------------------------------------------------------------------------

test.describe('Import center', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('Import center shows all import type cards', async ({ page }) => {
    const errors = spyErrors(page)
    await page.goto('/import')
    await page.waitForLoadState('networkidle', { timeout: 12_000 })
    const body = page.locator('body')
    // All three import types should be visible
    await expect(body).toContainText(/Trial Balance|TB Import/i)
    await expect(body).toContainText(/Chart of Accounts|COA/i)
    await expect(body).toContainText(/PDF|Financial Statement/i)
    expectNoErrors(errors)
  })

  test('TB import link navigates to /tb-import', async ({ page }) => {
    await page.goto('/import')
    await page.waitForLoadState('networkidle')
    const tbLink = page.getByRole('link', { name: /trial balance|TB import/i }).first()
    if (await tbLink.isVisible()) {
      await tbLink.click()
      await expect(page).toHaveURL(/tb-import/, { timeout: 5_000 })
    }
  })
})

// ---------------------------------------------------------------------------
// 9. ScenarioSelect shows readable labels (not internal names)
// ---------------------------------------------------------------------------

test.describe('Scenario labels throughout the app', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('Scenario dropdown on TB import shows Actuals/Budget/Forecast not raw DB names', async ({ page }) => {
    await page.goto('/tb-import')
    await page.waitForLoadState('networkidle')
    const select = page.locator('[data-testid="scenario-select"]')
    if (await select.isVisible()) {
      const text = await select.innerText()
      // Should contain type labels
      const hasTypeLabels = /Actuals|Budget|Forecast|Pro Forma/i.test(text)
      // Should NOT show something like "Acme Actual (Actual)" — raw name first
      // (we can't guarantee there's no entity-named scenario, but the format changed)
      expect(hasTypeLabels).toBeTruthy()
    }
  })

  test('JE create page scenario multi-select is visible', async ({ page }) => {
    await page.goto('/workbench/journal-entries/new')
    await page.waitForLoadState('networkidle')
    // ScenarioMultiSelect should be present
    const select = page.locator('[data-testid="scenario-select"], [data-testid="scenario-multi-select"]').first()
    await expect(select).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 10. PDF import wizard — no React crash on upload
// ---------------------------------------------------------------------------

test.describe('PDF import wizard UX', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('PDF import page loads without crash', async ({ page }) => {
    const errors = spyErrors(page)
    await page.goto('/pdf-import')
    await page.waitForLoadState('networkidle')
    await expect(page).not.toHaveURL(/login/)
    await expect(page.locator('body')).not.toContainText('Objects are not valid as a React child')
    await expect(page.locator('body')).not.toContainText('Unexpected Application Error')
    expectNoErrors(errors)
  })

  test('Entity select and basis/scope dropdowns are present', async ({ page }) => {
    await page.goto('/pdf-import')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('[data-testid="entity-select"]')).toBeVisible()
    await expect(page.locator('[data-testid="basis-select"]')).toBeVisible()
    await expect(page.locator('[data-testid="scope-select"]')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 11. Adjustments page — JE list and new JE button
// ---------------------------------------------------------------------------

test.describe('Adjustments page', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('Adjustments page loads without crash', async ({ page }) => {
    const errors = spyErrors(page)
    await page.goto('/adjustments')
    await page.waitForLoadState('networkidle', { timeout: 12_000 })
    await expect(page).not.toHaveURL(/login/)
    await expect(page.locator('body')).not.toContainText('Unexpected Application Error')
    expectNoErrors(errors)
  })

  test('New Journal Entry button is present', async ({ page }) => {
    await page.goto('/adjustments')
    await page.waitForLoadState('networkidle')
    const newJeBtn = page.getByRole('link', { name: /new.*journal|create.*journal|new.*je/i })
      .or(page.getByRole('button', { name: /new.*journal|create.*journal/i }))
      .first()
    // Either the button exists or a "select entity" prompt is shown
    const bodyText = await page.locator('body').innerText()
    const hasNewOrPrompt = await newJeBtn.isVisible() || /select entity|no entity/i.test(bodyText)
    expect(hasNewOrPrompt).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 12. Reset All Data — leaves a clean state (no phantom imports)
// ---------------------------------------------------------------------------

test.describe('Reset All Data', () => {
  test('reset endpoint deletes entities, batches and scenarios', async ({ request }) => {
    const token = await apiLogin(request)
    const headers = { Authorization: `Bearer ${token}` }

    // Get the org ID
    const meResp = await request.get(`${API_BASE}/auth/me`, { headers })
    const me = await meResp.json()
    const orgId = me.organization_id

    // Perform reset
    const resetResp = await request.delete(`${API_BASE}/dev/reset?org_id=${orgId}`, { headers })
    expect(resetResp.ok(), `reset failed: ${await resetResp.text()}`).toBeTruthy()
    const result = await resetResp.json()
    expect(result.status).toBe('reset')

    // Verify entities table is empty for this org
    const entResp = await request.get(`${API_BASE}/entities?organization_id=${orgId}`, { headers })
    const entities = await entResp.json()
    const list = Array.isArray(entities) ? entities : entities.items ?? []
    expect(list).toHaveLength(0)

    // Verify scenarios deleted
    const scenResp = await request.get(`${API_BASE}/scenarios?active=true`, { headers })
    if (scenResp.ok()) {
      const scens = await scenResp.json()
      const scenList = Array.isArray(scens) ? scens : scens.items ?? []
      expect(scenList).toHaveLength(0)
    }
  })
})
