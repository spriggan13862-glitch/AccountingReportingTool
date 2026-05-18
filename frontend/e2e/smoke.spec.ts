import { test, expect, type Page, type Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Mock API responses — E2E tests run against the Vite dev server with all
// backend calls intercepted, so they work in CI without a real backend.
// ---------------------------------------------------------------------------

const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock.mock'

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
  // Login
  await page.route('**/api/v1/auth/login', (route: Route) => {
    const body = route.request().postDataJSON()
    if (body?.email === 'admin@acme-demo.com' && body?.password === 'Demo1234!') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: MOCK_TOKEN, token_type: 'bearer' }),
      })
    } else {
      route.fulfill({ status: 401, body: JSON.stringify({ detail: 'Invalid credentials' }) })
    }
  })

  // /me
  await page.route('**/api/v1/auth/me', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    })
  })

  // Organization
  await page.route('**/api/v1/organizations/1', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ORG),
    })
  })

  // Setup status
  await page.route('**/api/v1/setup/status', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setup_complete: true, user_count: 5 }),
    })
  })

  // Catch-all for data endpoints — return empty arrays
  await page.route('**/api/v1/**', (route: Route) => {
    const url = route.request().url()
    if (url.includes('/auth/') || url.includes('/organizations/') || url.includes('/setup/')) {
      route.continue()
      return
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Login flow', () => {
  test('redirects unauthenticated users to /login', async ({ page }) => {
    await mockBackend(page)
    // Override /me to return 401 (no session)
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ status: 401, body: JSON.stringify({ detail: 'Not authenticated' }) }),
    )
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows login form', async ({ page }) => {
    await mockBackend(page)
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ status: 401, body: JSON.stringify({ detail: 'Not authenticated' }) }),
    )
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
  })

  test('successful login redirects to dashboard', async ({ page }) => {
    await mockBackend(page)
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ status: 401, body: JSON.stringify({ detail: 'Not authenticated' }) }),
    )
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('admin@acme-demo.com')
    await page.getByLabel(/password/i).fill('Demo1234!')
    await page.getByRole('button', { name: /sign in/i }).click()

    // After login, /me is re-fetched successfully
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) }),
    )

    await expect(page).toHaveURL(/\/$|\/dashboard/)
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await mockBackend(page)
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ status: 401, body: JSON.stringify({ detail: 'Not authenticated' }) }),
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
    await page.addInitScript(() => {
      sessionStorage.setItem('accounting_access_token', 'mock-token')
    })
  })

  test('shows dashboard with quick links', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/quick links/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /journal entries/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /trial balance/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /financial statements/i })).toBeVisible()
  })

  test('shows demo banner for Acme org', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/demo environment/i)).toBeVisible()
  })
})

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page)
    await page.addInitScript(() => {
      sessionStorage.setItem('accounting_access_token', 'mock-token')
    })
  })

  test('/unauthorized page renders', async ({ page }) => {
    await page.goto('/unauthorized')
    await expect(page.getByText(/access denied|unauthorized/i)).toBeVisible()
  })
})
