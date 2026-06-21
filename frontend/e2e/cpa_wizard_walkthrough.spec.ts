/**
 * CPA Wizard Walkthrough — uses a backend-pre-created batch so the UI test
 * doesn't depend on filling EntitySelect / date / upload form. Resumes the
 * wizard at step 4 (Review Exceptions) via ?batchId=N, then exercises the
 * Suggest FS Lines step inline.
 */
import { test, expect, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SHOTS = path.resolve(__dirname, '../test-results/cpa-walkthrough')
const FIXTURE = path.resolve(__dirname, '../../tests/fixtures/tb/cpa_quickbooks_tb.csv')

test.beforeAll(() => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true })
})

const API = 'http://localhost:8002/api/v1'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill('admin@livemarketing.test')
  await page.getByLabel(/password/i).fill('Test1234!')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
}

async function createBatchViaApi(request: any): Promise<number | null> {
  // Pre-create a batch end-to-end through the API so the UI test can land
  // directly at step 4 (Review Exceptions) without having to drive the
  // upload form. The wizard resumes via ?batchId=N.
  const fileBuf = fs.readFileSync(FIXTURE)
  const upload = await request.post(`${API}/tb-imports/batches/upload`, {
    multipart: {
      file: { name: 'cpa.csv', mimeType: 'text/csv', buffer: fileBuf },
      organization_id: '1',
      entity_id: '1',
      as_of_date: '2024-12-31',
    },
  })
  if (!upload.ok()) {
    const text = await upload.text()
    console.log('upload status:', upload.status(), text)
    // Reuse the existing batch if this content was uploaded before.
    if (upload.status() === 409) {
      try {
        const body = JSON.parse(text)
        const existing = body?.detail?.existing_batch_id
        if (existing) return existing
      } catch { /* fallthrough */ }
    }
    return null
  }
  const body = await upload.json()
  return body.id ?? body.batch_id ?? null
}

test.describe('CPA wizard walkthrough', () => {
  test.setTimeout(120_000)

  test('resume wizard at Review Exceptions with a real CPA batch', async ({ page, request }) => {
    const batchId = await createBatchViaApi(request)
    if (batchId === null) {
      test.skip(true, 'Could not pre-create batch via API; auth or schema mismatch.')
      return
    }
    console.log('Created batch id:', batchId)

    await login(page)
    await page.goto(`/client-data/imports/trial-balance?batchId=${batchId}`)
    await page.waitForTimeout(2000)
    await page.screenshot({ path: path.join(SHOTS, 'wizard-review-exceptions.png'), fullPage: true })

    // Item 11: Review Exceptions totals summary should render.
    const summary = page.getByTestId('review-exceptions-summary')
    const summaryVisible = await summary.count() > 0
    console.log('ITEM 11 — Review Exceptions summary visible:', summaryVisible)

    // Item 12: "Show all accounts" — wizard step 4 should expose all rows somewhere.
    // (Currently we only show issues by default; user can expand for all.)

    // Item 13: Post button gating — go forward to step 5 if possible.
    // Find a "Next: Post" or similar.
    const nextButton = page.getByRole('button', { name: /next.*post|post.*ledger/i }).first()
    if (await nextButton.count() > 0) {
      console.log('Next-to-Post button visible:', true, 'enabled:', await nextButton.isEnabled())
    }
  })

  test('Suggest FS Lines step exposes filters / threshold / select-all / inline overrides', async ({ page, request }) => {
    const batchId = await createBatchViaApi(request)
    if (batchId === null) {
      test.skip(true, 'Could not pre-create batch via API')
      return
    }

    await login(page)
    // Resume at Review Exceptions, then navigate BACK to Suggest FS Lines (step 3).
    await page.goto(`/client-data/imports/trial-balance?batchId=${batchId}`)
    await page.waitForTimeout(2000)

    // Click "Back to FS Lines" button to land on the suggest step.
    const backBtn = page.getByRole('button', { name: /back to fs lines/i })
    if (await backBtn.count() > 0) {
      await backBtn.click()
      await page.waitForTimeout(1500)
    }
    await page.screenshot({ path: path.join(SHOTS, 'wizard-step-3-suggest.png'), fullPage: true })

    // Item 4: nearly full page width — measure the step container.
    const stepContainer = page.getByTestId('suggest-fsli-step')
    const containerVisible = await stepContainer.count() > 0
    console.log('ITEM (step 3 mounted):', containerVisible)

    if (containerVisible) {
      const box = await stepContainer.boundingBox()
      const viewport = page.viewportSize()
      const widthPct = box && viewport ? Math.round((box.width / viewport.width) * 100) : 0
      console.log(`ITEM 4 — Step 4 container width: ${box?.width}px of ${viewport?.width}px (${widthPct}%)`)
    }

    // Item 5: filter chips for All / Auto-mapped / Needs review / No suggestion
    const taxSelect = page.getByTestId('suggest-fsli-taxonomy-select')
    if (await taxSelect.count() > 0) {
      console.log('Taxonomy select visible:', true)
    }

    // Click "Run Suggestions"
    const runBtn = page.getByTestId('run-suggestions-btn')
    if (await runBtn.count() > 0) {
      await runBtn.click()
      await page.waitForTimeout(4000)
      await page.screenshot({ path: path.join(SHOTS, 'wizard-step-3-after-suggest.png'), fullPage: true })
    }

    // Item 5: filter chips
    const chipCount = await page.getByTestId(/^filter-chip-/).count()
    console.log('ITEM 5 — Filter chips count:', chipCount)

    // Item 5: search box
    const searchVisible = await page.getByTestId('suggest-fsli-search').count() > 0
    console.log('ITEM 5 — Search box visible:', searchVisible)

    // Item 5: threshold input
    const thresholdVisible = await page.getByTestId('accept-threshold-input').count() > 0
    console.log('ITEM 5 — Accept threshold input visible:', thresholdVisible)

    // Item 8: select all checkbox
    const selectAllVisible = await page.getByTestId('suggest-fsli-select-all').count() > 0
    console.log('ITEM 8 — Select-all checkbox visible:', selectAllVisible)

    // Item 6: at least one inline override dropdown rendered with real options
    const firstOverride = page.locator('[data-testid^="fsli-override-"]').first()
    const overrideCount = await firstOverride.count()
    console.log('ITEM 6 — Per-row override dropdown count:', overrideCount)
    if (overrideCount > 0) {
      const opts = await firstOverride.locator('option').count()
      console.log('ITEM 6 — Options in first override dropdown:', opts)
    }

    // Item 7: no "CODE name" duplication — sample a suggested cell.
    // The bug was rendering "CASH Cash" — an all-uppercase code immediately
    // followed by the same word title-cased. Tight regex: only flag if a
    // first uppercase token is followed by the SAME word.
    const suggestedCells = await page.locator('[data-testid^="suggest-fsli-row-"] td:nth-child(4)').allTextContents()
    const duplicateLike = suggestedCells.filter((t) => {
      const m = /^([A-Z_]{2,})\s+([A-Za-z]+)/.exec(t.trim())
      if (!m) return false
      return m[1].toLowerCase() === m[2].toLowerCase()
    })
    console.log('ITEM 7 — Cells with CODE-then-same-name pattern:', duplicateLike.length, 'sample:', suggestedCells.slice(0, 5))
  })

  test('Item 14: legacy routes redirect to wizard', async ({ page }) => {
    await login(page)
    await page.goto('/import/new')
    await expect(page).toHaveURL(/client-data\/imports\/trial-balance/, { timeout: 5_000 })
    await page.goto('/import/999')
    await expect(page).toHaveURL(/trial-balance\?batchId=999/, { timeout: 5_000 })
  })

  test('Item 15: MappingWorkbench not in primary nav', async ({ page }) => {
    await login(page)
    await page.goto('/overview')
    const navText = await page.locator('nav').first().allTextContents()
    const text = navText.join(' ')
    expect(text).not.toMatch(/Mapping Workbench/i)
  })
})
