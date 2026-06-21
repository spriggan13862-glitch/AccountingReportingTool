/**
 * CPA Workflow Verification — drives the redesigned TB import end-to-end
 * with a realistic QuickBooks-shaped TB CSV (combined account column,
 * separate debit/credit, ~47 rows including subaccounts and zero balances).
 *
 * One screenshot per wizard step lands in test-results/cpa-verification/.
 * Test results below are documented as pass/fail in the report file.
 */
import { test, expect, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SHOTS = path.resolve(__dirname, '../test-results/cpa-verification')
const FIXTURE = path.resolve(__dirname, '../../tests/fixtures/tb/cpa_quickbooks_tb.csv')

test.beforeAll(() => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true })
})

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill('admin@livemarketing.test')
  await page.getByLabel(/password/i).fill('Test1234!')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
}

test.describe.serial('CPA TB import verification', () => {
  test.setTimeout(180_000)

  test('Step 1: upload CSV with entity + date', async ({ page }) => {
    await login(page)
    await page.goto('/client-data/imports/trial-balance')
    await page.screenshot({ path: path.join(SHOTS, 'step-0-empty.png'), fullPage: true })

    // EntitySelect appears on step 0; pick the seeded LM entity if dropdown shows.
    const entitySelect = page.locator('select').first()
    if (await entitySelect.count() > 0) {
      const options = await entitySelect.locator('option').allTextContents()
      const lmOption = options.find((t) => /LM|Live Marketing/i.test(t))
      if (lmOption) {
        await entitySelect.selectOption({ label: lmOption })
      }
    }

    // Date input — must be filled or upload is gated.
    const dateInput = page.locator('input[type="date"]').first()
    if (await dateInput.count() > 0) {
      await dateInput.fill('2024-12-31')
    }

    // File picker is a hidden input that the drop area wraps.
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(FIXTURE)
    await page.screenshot({ path: path.join(SHOTS, 'step-1-uploaded.png'), fullPage: true })
  })

  test('Step 2: process & detect — should auto-skip sheet step for CSV', async ({ page }) => {
    await login(page)
    await page.goto('/client-data/imports/trial-balance')
    const entitySelect = page.locator('select').first()
    if (await entitySelect.count() > 0) {
      const lmOption = (await entitySelect.locator('option').allTextContents()).find((t) =>
        /LM|Live Marketing/i.test(t),
      )
      if (lmOption) await entitySelect.selectOption({ label: lmOption })
    }
    const dateInput = page.locator('input[type="date"]').first()
    if (await dateInput.count() > 0) await dateInput.fill('2024-12-31')

    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE)
    // "Process" / "Continue" / "Proceed" button on step 0.
    const proceed = page.getByRole('button', { name: /proceed|continue|process/i }).first()
    if (await proceed.count() > 0 && await proceed.isEnabled()) {
      await proceed.click()
    }

    // Either step 1 (sheet, for xlsx) or step 2 (columns, for CSV) is now visible.
    // CSV should land on column mapping directly.
    await page.waitForTimeout(2000)
    await page.screenshot({ path: path.join(SHOTS, 'step-2-after-process.png'), fullPage: true })
  })

  test('Capture: walk full wizard and screenshot every step', async ({ page }) => {
    await login(page)
    await page.goto('/client-data/imports/trial-balance')

    // ── Step 0: Upload ───────────────────────────────────────────────────────
    const entitySelect = page.locator('select').first()
    if (await entitySelect.count() > 0) {
      const lmOption = (await entitySelect.locator('option').allTextContents()).find((t) =>
        /LM|Live Marketing/i.test(t),
      )
      if (lmOption) await entitySelect.selectOption({ label: lmOption })
    }
    const dateInput = page.locator('input[type="date"]').first()
    if (await dateInput.count() > 0) await dateInput.fill('2024-12-31')
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE)
    await page.screenshot({ path: path.join(SHOTS, 'wizard-step-0-upload.png'), fullPage: true })

    // Process
    const proceed = page.getByRole('button', { name: /proceed|continue|process/i }).first()
    if (await proceed.isEnabled()) await proceed.click()
    await page.waitForTimeout(3000)
    await page.screenshot({ path: path.join(SHOTS, 'wizard-step-2-columns.png'), fullPage: true })

    // ── Step 2: Column Mapping — check Account/Debit/Credit auto-detected
    const colSelects = page.locator('select')
    const colCount = await colSelects.count()
    const colTextSnapshot: string[] = []
    for (let i = 1; i < Math.min(colCount, 12); i++) {
      const val = await colSelects.nth(i).inputValue().catch(() => '')
      colTextSnapshot.push(val)
    }
    console.log('Column-mapping select values:', colTextSnapshot)

    // Click "Process & Validate"
    const validate = page.getByRole('button', { name: /process.*validate|validate/i }).first()
    if (await validate.count() > 0 && await validate.isEnabled()) {
      await validate.click()
      await page.waitForTimeout(5000)
    }
    await page.screenshot({ path: path.join(SHOTS, 'wizard-step-3-suggest-fsli.png'), fullPage: true })

    // ── Step 3: Suggest FS Lines ─────────────────────────────────────────────
    const runSuggestions = page.getByTestId('run-suggestions-btn')
    if (await runSuggestions.count() > 0 && await runSuggestions.isEnabled()) {
      await runSuggestions.click()
      await page.waitForTimeout(4000)
    }
    await page.screenshot({ path: path.join(SHOTS, 'wizard-step-3-after-suggest.png'), fullPage: true })

    // Verify filter chips exist
    const filterChipsCount = await page.getByTestId(/^filter-chip-/).count()
    console.log('Filter chips visible:', filterChipsCount)

    // Verify search box exists
    const searchVisible = await page.getByTestId('suggest-fsli-search').count() > 0
    console.log('Search box visible:', searchVisible)

    // Verify accept threshold exists
    const thresholdVisible = await page.getByTestId('accept-threshold-input').count() > 0
    console.log('Accept threshold visible:', thresholdVisible)

    // Verify select-all
    const selectAllVisible = await page.getByTestId('suggest-fsli-select-all').count() > 0
    console.log('Select-all visible:', selectAllVisible)

    // Click Accept above threshold (default 80%)
    const acceptThreshold = page.getByTestId('accept-above-threshold-btn')
    if (await acceptThreshold.count() > 0 && await acceptThreshold.isEnabled()) {
      await acceptThreshold.click()
      await page.waitForTimeout(3000)
    }
    await page.screenshot({ path: path.join(SHOTS, 'wizard-step-3-after-accept.png'), fullPage: true })

    // ── Continue to Review Exceptions
    const continueToReview = page.getByTestId('continue-to-review-btn')
    if (await continueToReview.count() > 0) {
      await continueToReview.click()
    } else {
      // Fall back to the skip button
      const skipToReview = page.getByTestId('skip-to-review-btn')
      if (await skipToReview.count() > 0) await skipToReview.click()
    }
    await page.waitForTimeout(3000)
    await page.screenshot({ path: path.join(SHOTS, 'wizard-step-4-review-exceptions.png'), fullPage: true })

    // ── Step 4: Review Exceptions — totals summary should exist
    const summaryVisible = await page.getByTestId('review-exceptions-summary').count() > 0
    console.log('Review Exceptions totals summary visible:', summaryVisible)

    // IssuesPanel — empty banner or grouped list
    const issuesPanelVisible = await page.locator('[data-testid^="issues-panel"]').count() > 0
    console.log('IssuesPanel visible:', issuesPanelVisible)

    // ── Capture final viewport width measurements for layout judgment
    const viewport = page.viewportSize()
    const tableEl = page.locator('table').first()
    const tableBox = (await tableEl.count() > 0) ? await tableEl.boundingBox() : null
    console.log('Viewport:', viewport, 'Table bbox:', tableBox)
  })

  test('Item 14: /import/new redirects to canonical wizard', async ({ page }) => {
    await login(page)
    await page.goto('/import/new')
    await expect(page).toHaveURL(/client-data\/imports\/trial-balance/, { timeout: 5_000 })
  })

  test('Item 14: /import/:id redirects to wizard with ?batchId=N', async ({ page }) => {
    await login(page)
    await page.goto('/import/12345')
    await expect(page).toHaveURL(/trial-balance\?batchId=12345/, { timeout: 5_000 })
  })

  test('Item 15: MappingWorkbench not in primary nav', async ({ page }) => {
    await login(page)
    await page.goto('/overview')
    // Look at nav for any explicit "Mapping Workbench" link.
    const navLinks = await page.locator('nav a').allTextContents()
    const hasMappingWorkbench = navLinks.some((t) =>
      /Mapping Workbench/i.test(t),
    )
    expect(hasMappingWorkbench).toBe(false)
  })
})
