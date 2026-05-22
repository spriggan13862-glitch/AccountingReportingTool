import { test, expect, type Page, type Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Shadow-testing workflows — navigation stability and workflow smoke tests.
// Goals per test:
//   1. Page loads without a red error banner ([data-testid="error-banner"])
//   2. No browser console errors
//   3. No failed (network-error) API requests
//   4. Screenshot on failure (auto via playwright trace config + screenshot option)
// ---------------------------------------------------------------------------

const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock.mock'
const JSON = 'application/json'

const MOCK_USER = {
  id: 1,
  organization_id: 1,
  email: 'admin@acme-demo.com',
  full_name: 'Acme Admin',
  is_active: true,
  is_superuser: true,
  role: 'admin',
}

const MOCK_ORG = {
  id: 1,
  name: 'Acme Manufacturing Co.',
  slug: 'acme',
  is_active: true,
}

const MOCK_ENTITY = {
  id: 1,
  code: 'ACME-US',
  name: 'Acme US Operating Co.',
  entity_type: 'operating',
  currency: 'USD',
  parent_id: null,
  fiscal_year_end_month: 12,
  fiscal_year_convention: 'calendar',
  active: true,
}

const ENTITIES_LIST = {
  items: [MOCK_ENTITY],
  total: 1,
  page: 1,
  page_size: 50,
  pages: 1,
}

const ENTITIES_EMPTY = { items: [], total: 0, page: 1, page_size: 50, pages: 0 }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ConsoleError = { type: string; text: string }
type FailedRequest = { url: string; failure: string | null }

function attachMonitors(page: Page): { consoleErrors: ConsoleError[]; failedRequests: FailedRequest[] } {
  const consoleErrors: ConsoleError[] = []
  const failedRequests: FailedRequest[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ type: msg.type(), text: msg.text() })
    }
  })

  page.on('requestfailed', (req) => {
    const url = req.url()
    if (url.startsWith('chrome-extension://') || url.includes('__vite') || url.includes('/@')) return
    failedRequests.push({ url, failure: req.failure()?.errorText ?? null })
  })

  return { consoleErrors, failedRequests }
}

async function assertNoErrors(page: Page, consoleErrors: ConsoleError[], failedRequests: FailedRequest[]) {
  await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible()

  const filtered = consoleErrors.filter(
    (e) =>
      !e.text.includes('favicon') &&
      !e.text.includes('Download the React DevTools') &&
      !e.text.includes('ReactDOM.render is no longer supported'),
  )
  expect(filtered, `Console errors: ${globalThis.JSON.stringify(filtered)}`).toHaveLength(0)

  expect(failedRequests, `Failed requests: ${globalThis.JSON.stringify(failedRequests)}`).toHaveLength(0)
}

/**
 * Register all API mocks.
 * IMPORTANT: Playwright resolves routes in reverse registration order (most recently
 * added = first matched). We register the catch-all FIRST so specific handlers added
 * after it take priority and override it for their patterns.
 */
async function mockBackend(page: Page) {
  // Catch-all — must be registered FIRST so specific handlers below take priority
  await page.route('**/api/v1/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: JSON, body: globalThis.JSON.stringify([]) }),
  )

  // Auth
  await page.route('**/api/v1/auth/login', (route: Route) => {
    const body = route.request().postDataJSON()
    if (body?.email === 'admin@acme-demo.com' && body?.password === 'Demo1234!') {
      route.fulfill({
        status: 200,
        contentType: JSON,
        body: globalThis.JSON.stringify({ access_token: MOCK_TOKEN, token_type: 'bearer' }),
      })
    } else {
      route.fulfill({
        status: 401,
        contentType: JSON,
        body: globalThis.JSON.stringify({ detail: 'Invalid credentials' }),
      })
    }
  })

  await page.route('**/api/v1/auth/me', (route: Route) =>
    route.fulfill({ status: 200, contentType: JSON, body: globalThis.JSON.stringify(MOCK_USER) }),
  )

  // Organization
  await page.route('**/api/v1/organizations/**', (route: Route) => {
    const url = route.request().url()
    if (url.includes('/onboarding')) {
      return route.fulfill({ status: 200, contentType: JSON, body: globalThis.JSON.stringify({ steps: [] }) })
    }
    return route.fulfill({ status: 200, contentType: JSON, body: globalThis.JSON.stringify(MOCK_ORG) })
  })

  // Setup
  await page.route('**/api/v1/setup/**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: JSON,
      body: globalThis.JSON.stringify({ setup_complete: true, user_count: 5 }),
    }),
  )

  // Entities (default: return one entity)
  await page.route('**/api/v1/entities/**', (route: Route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: JSON, body: globalThis.JSON.stringify(MOCK_ENTITY) })
    }
    return route.fulfill({ status: 200, contentType: JSON, body: globalThis.JSON.stringify(ENTITIES_LIST) })
  })

  // Reporting taxonomy, views, scenarios, accounts, imports, COA
  for (const pattern of [
    '**/api/v1/reporting-taxonomy/**',
    '**/api/v1/reporting-views/**',
    '**/api/v1/scenarios/**',
    '**/api/v1/accounts/**',
    '**/api/v1/imports/**',
    '**/api/v1/coa-import/**',
  ]) {
    await page.route(pattern, (route: Route) =>
      route.fulfill({ status: 200, contentType: JSON, body: globalThis.JSON.stringify([]) }),
    )
  }
}

/** Inject auth token into sessionStorage before the page loads */
async function loginSession(page: Page) {
  await page.addInitScript((token: string) => {
    sessionStorage.setItem('accounting_access_token', token)
  }, MOCK_TOKEN)
}

// ---------------------------------------------------------------------------
// 1. Login
// ---------------------------------------------------------------------------

test.describe('Login', () => {
  test('login page renders form without app errors', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await mockBackend(page)
    // Override /me to return 401 for this test — page is unauthenticated
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ status: 401, contentType: JSON, body: globalThis.JSON.stringify({ detail: 'Not authenticated' }) }),
    )

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /accounting tool/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()

    await assertNoErrors(page, consoleErrors, failedRequests)
  })

  test('successful login redirects to dashboard', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await mockBackend(page)
    // No token pre-set → AuthProvider skips /me on load → page shows /login unauthenticated.
    // After form submit, login() calls /me which mockBackend answers with MOCK_USER → navigate('/').

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /accounting tool/i })).toBeVisible()
    await page.getByLabel(/email/i).fill('admin@acme-demo.com')
    await page.getByLabel(/password/i).fill('Demo1234!')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page).toHaveURL(/\/$|\/dashboard/, { timeout: 10000 })
    await assertNoErrors(page, consoleErrors, failedRequests)
  })

  test('invalid credentials shows inline error, no red ErrorBanner', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await mockBackend(page)
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ status: 401, contentType: JSON, body: globalThis.JSON.stringify({ detail: 'Not authenticated' }) }),
    )

    await page.goto('/login')
    await page.getByLabel(/email/i).fill('wrong@example.com')
    await page.getByLabel(/password/i).fill('badpassword')
    await page.getByRole('button', { name: /sign in/i }).click()

    // Error is rendered inline in the form (red div), not the app ErrorBanner component
    await expect(page.getByText(/invalid credentials/i)).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible()

    // Console errors from axios 401 are expected; filter them out
    const appErrors = consoleErrors.filter((e) => !e.text.includes('401'))
    expect(appErrors, `Unexpected console errors: ${globalThis.JSON.stringify(appErrors)}`).toHaveLength(0)
    expect(failedRequests, `Failed requests: ${globalThis.JSON.stringify(failedRequests)}`).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 2. Entity creation
// ---------------------------------------------------------------------------

test.describe('Entity creation', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page)
    await loginSession(page)
  })

  test('entities page loads without errors', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await page.goto('/entities')
    await expect(page.getByRole('heading', { name: 'Entities' })).toBeVisible()
    await assertNoErrors(page, consoleErrors, failedRequests)
  })

  test('create entity form opens, fills required fields, and submits without errors', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)

    // Override entities to be empty so the "empty state" is shown with Create First Entity CTA
    await page.route('**/api/v1/entities/**', (route: Route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 201, contentType: JSON, body: globalThis.JSON.stringify(MOCK_ENTITY) })
      }
      return route.fulfill({ status: 200, contentType: JSON, body: globalThis.JSON.stringify(ENTITIES_EMPTY) })
    })

    await page.goto('/entities')
    await expect(page.getByRole('heading', { name: 'Entities' })).toBeVisible()

    // Open create form via the header button
    await page.getByRole('button', { name: /new entity/i }).click()
    await expect(page.getByRole('heading', { name: 'Create Entity' })).toBeVisible()

    // Fill required fields
    await page.getByPlaceholder(/e\.g\. ACME-US/i).fill('TEST-01')
    await page.getByPlaceholder(/full legal name/i).fill('Test Entity Inc.')

    // Fiscal year-end month select (labelled "Fiscal Year-End Month *")
    await page.locator('select').filter({ has: page.locator('option[value=""]', { hasText: /select month/i }) }).selectOption('12')

    // FY Convention select
    await page.locator('select').filter({ has: page.locator('option[value=""]', { hasText: /select convention/i }) }).selectOption('calendar')

    // Submit
    await page.locator('[data-testid="entity-form-submit"]').click()

    // Form closes on success
    await expect(page.getByRole('heading', { name: 'Create Entity' })).not.toBeVisible({ timeout: 5000 })

    await assertNoErrors(page, consoleErrors, failedRequests)
  })
})

// ---------------------------------------------------------------------------
// 3. COA Import page
// ---------------------------------------------------------------------------

test.describe('COA Import page', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page)
    await loginSession(page)
  })

  test('COA import page loads without errors', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await page.goto('/coa-import')
    await expect(page.getByRole('heading', { name: 'Import Chart of Accounts' })).toBeVisible()
    await assertNoErrors(page, consoleErrors, failedRequests)
  })

  test('COA import page shows no red error banner on load', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await page.goto('/coa-import')
    await expect(page.getByRole('heading', { name: 'Import Chart of Accounts' })).toBeVisible()
    await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible()
    await assertNoErrors(page, consoleErrors, failedRequests)
  })
})

// ---------------------------------------------------------------------------
// 4. Import wizard
// ---------------------------------------------------------------------------

test.describe('Import wizard', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page)
    await loginSession(page)
  })

  test('import center page loads without errors', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await page.goto('/import')
    // ImportCenterPage doesn't have a PageLayout title — just check it renders without crashing
    await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible()
    await assertNoErrors(page, consoleErrors, failedRequests)
  })

  test('import wizard (new import) loads step 1 without errors', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await page.goto('/import/new')
    await expect(page.getByRole('heading', { name: 'New Import' })).toBeVisible()
    await expect(page.getByText(/step 1/i)).toBeVisible()
    await assertNoErrors(page, consoleErrors, failedRequests)
  })
})

// ---------------------------------------------------------------------------
// 5. Chart of Accounts page
// ---------------------------------------------------------------------------

test.describe('Chart of Accounts page', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page)
    await loginSession(page)
  })

  test('chart of accounts page loads without errors', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await page.goto('/accounts')
    await expect(page.getByRole('heading', { name: 'Chart of Accounts' })).toBeVisible()
    await assertNoErrors(page, consoleErrors, failedRequests)
  })

  test('chart of accounts shows no red error banner on load', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await page.goto('/accounts')
    await expect(page.getByRole('heading', { name: 'Chart of Accounts' })).toBeVisible()
    await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible()
    await assertNoErrors(page, consoleErrors, failedRequests)
  })
})

// ---------------------------------------------------------------------------
// 6. Financial Statements page
// ---------------------------------------------------------------------------

test.describe('Financial Statements page', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page)
    await loginSession(page)
  })

  test('financial statements page loads without errors', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await page.goto('/financial-statements')
    await expect(page.getByRole('heading', { name: 'Financial Statements' })).toBeVisible()
    await assertNoErrors(page, consoleErrors, failedRequests)
  })

  test('financial statements shows entity-select empty state and no error banner', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await page.goto('/financial-statements')
    await expect(page.getByRole('heading', { name: 'Financial Statements' })).toBeVisible()
    // Tabs only render after an entity is selected. Before selection the page shows a prompt.
    await expect(page.getByText(/select an entity and date/i)).toBeVisible()
    await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible()
    await assertNoErrors(page, consoleErrors, failedRequests)
  })
})

// ---------------------------------------------------------------------------
// 7. Draft Overlay Preview page
// ---------------------------------------------------------------------------

test.describe('Draft Overlay Preview page', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page)
    await loginSession(page)
  })

  test('draft preview page loads without errors', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await page.goto('/draft-preview')
    await expect(page.getByRole('heading', { name: 'Draft Preview' })).toBeVisible()
    await assertNoErrors(page, consoleErrors, failedRequests)
  })

  test('draft preview shows Configure Overlay button and no red error banner', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await page.goto('/draft-preview')
    await expect(page.getByRole('heading', { name: 'Draft Preview' })).toBeVisible()
    await expect(page.getByTestId('open-overlay-modal')).toBeVisible()
    await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible()
    await assertNoErrors(page, consoleErrors, failedRequests)
  })
})

// ---------------------------------------------------------------------------
// 8. Taxonomy Admin page
// ---------------------------------------------------------------------------

test.describe('Taxonomy Admin page', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page)
    await loginSession(page)
  })

  test('taxonomy admin page loads without errors', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await page.goto('/taxonomy-admin')
    await expect(page.getByRole('heading', { name: 'Taxonomy Admin' })).toBeVisible()
    await assertNoErrors(page, consoleErrors, failedRequests)
  })

  test('taxonomy admin shows no red error banner on load', async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitors(page)
    await page.goto('/taxonomy-admin')
    await expect(page.getByRole('heading', { name: 'Taxonomy Admin' })).toBeVisible()
    await expect(page.locator('[data-testid="error-banner"]')).not.toBeVisible()
    await assertNoErrors(page, consoleErrors, failedRequests)
  })
})
