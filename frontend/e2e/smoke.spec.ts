import { test, expect, type Page, type Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Mock API responses — E2E tests run against the Vite dev server with all
// backend calls intercepted, so they work in CI without a real backend.
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

async function mockBackend(page: Page) {
  // Catch-all — must be registered FIRST so specific handlers below take priority
  await page.route('**/api/v1/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: JSON, body: globalThis.JSON.stringify([]) }),
  )

  // Login
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

  // /me
  await page.route('**/api/v1/auth/me', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: JSON,
      body: globalThis.JSON.stringify(MOCK_USER),
    })
  })

  // Organization
  await page.route('**/api/v1/organizations/**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: JSON,
      body: globalThis.JSON.stringify(MOCK_ORG),
    })
  })

  // Setup status
  await page.route('**/api/v1/setup/**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: JSON,
      body: globalThis.JSON.stringify({ setup_complete: true, user_count: 5 }),
    })
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Login flow', () => {
  test('redirects unauthenticated users to /login', async ({ page }) => {
    await mockBackend(page)
    // Override /me to return 401 (no session) for this test
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 401,
        contentType: JSON,
        body: globalThis.JSON.stringify({ detail: 'Not authenticated' }),
      }),
    )
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows login form', async ({ page }) => {
    await mockBackend(page)
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 401,
        contentType: JSON,
        body: globalThis.JSON.stringify({ detail: 'Not authenticated' }),
      }),
    )
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /accounting tool/i })).toBeVisible()
    await expect(page.getByText(/sign in to your account/i)).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
  })

  test('successful login redirects to dashboard', async ({ page }) => {
    await mockBackend(page)
    // No token pre-set → AuthProvider skips /me on load → page shows /login unauthenticated.
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@acme-demo.com')
    await page.getByLabel(/password/i).fill('Demo1234!')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10000 })
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await mockBackend(page)
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 401,
        contentType: JSON,
        body: globalThis.JSON.stringify({ detail: 'Not authenticated' }),
      }),
    )
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('wrong@example.com')
    await page.getByLabel(/password/i).fill('wrongpassword')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText(/invalid credentials/i)).toBeVisible()
  })
})

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page)
    // Simulate authenticated session by setting sessionStorage before navigation
    await page.addInitScript((token: string) => {
      sessionStorage.setItem('accounting_access_token', token)
    }, MOCK_TOKEN)
  })

  test('shows workspace links', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/workspaces/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /^import$/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /^review$/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /^adjustments$/i }).first()).toBeVisible()
  })

  test('shows overview page after login', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1, h2, h3').first()).toBeVisible()
  })
})

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page)
    await page.addInitScript((token: string) => {
      sessionStorage.setItem('accounting_access_token', token)
    }, MOCK_TOKEN)
  })

  test('/unauthorized page renders', async ({ page }) => {
    await page.goto('/unauthorized')
    await expect(page.getByText(/access denied|unauthorized/i)).toBeVisible()
  })
})
