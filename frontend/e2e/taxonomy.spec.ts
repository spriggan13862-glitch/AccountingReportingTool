/**
 * Sprint O — Default Taxonomy Foundation visual verification.
 *
 * Verifies the new Taxonomy Library page, system taxonomy seeding, downloads,
 * cloning, and multi-taxonomy account mappings in a real browser.
 */
import { test, expect, type Page } from '@playwright/test'

const ADMIN_EMAIL = 'admin@livemarketing.test'
const ADMIN_PASSWORD = 'Test1234!'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/$|\/dashboard|\/overview/, { timeout: 10_000 })
}

test.describe('Sprint O — Default Taxonomy Foundation', () => {
  test('taxonomy library API returns 11 system taxonomies', async ({ request }) => {
    // Sanity-check the backend before any UI navigation.
    const res = await request.get('http://localhost:8002/api/v1/taxonomies')
    expect(res.ok()).toBeTruthy()
    const taxonomies = await res.json()
    const systemTaxonomies = taxonomies.filter((t: { is_system: boolean }) => t.is_system)
    expect(systemTaxonomies.length).toBeGreaterThanOrEqual(11)
    const codes = systemTaxonomies.map((t: { code: string }) => t.code).sort()
    expect(codes).toContain('us_gaap')
    expect(codes).toContain('ifrs')
    expect(codes).toContain('saas')
    expect(codes).toContain('healthcare')
    expect(codes).toContain('spac_public')
  })

  test('US GAAP taxonomy has substantial node count', async ({ request }) => {
    const list = await (await request.get('http://localhost:8002/api/v1/taxonomies')).json()
    const usgaap = list.find((t: { code: string }) => t.code === 'us_gaap')
    expect(usgaap).toBeTruthy()
    const detail = await (await request.get(`http://localhost:8002/api/v1/taxonomies/${usgaap.id}`)).json()
    expect(detail.node_count).toBeGreaterThanOrEqual(100)
  })

  test('CSV export endpoint returns CSV content', async ({ request }) => {
    const list = await (await request.get('http://localhost:8002/api/v1/taxonomies')).json()
    const saas = list.find((t: { code: string }) => t.code === 'saas')
    const res = await request.get(`http://localhost:8002/api/v1/taxonomies/${saas.id}/export/csv`)
    expect(res.ok()).toBeTruthy()
    const contentType = res.headers()['content-type'] || ''
    expect(contentType).toContain('csv')
    const body = await res.text()
    expect(body).toContain('code')
    expect(body).toContain('name')
    expect(body.split('\n').length).toBeGreaterThan(20)
  })

  test('JSON export returns nested tree', async ({ request }) => {
    const list = await (await request.get('http://localhost:8002/api/v1/taxonomies')).json()
    const ifrs = list.find((t: { code: string }) => t.code === 'ifrs')
    const res = await request.get(`http://localhost:8002/api/v1/taxonomies/${ifrs.id}/export/json`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty('code', 'ifrs')
    expect(body).toHaveProperty('nodes')
    expect(Array.isArray(body.nodes)).toBeTruthy()
  })

  test('system taxonomy clone creates editable user copy', async ({ request }) => {
    const list = await (await request.get('http://localhost:8002/api/v1/taxonomies')).json()
    const usgaap = list.find((t: { code: string }) => t.code === 'us_gaap')
    const cloneRes = await request.post(`http://localhost:8002/api/v1/taxonomies/${usgaap.id}/clone`, {
      data: { name: 'US GAAP - E2E Test Clone' },
    })
    expect(cloneRes.ok()).toBeTruthy()
    const cloned = await cloneRes.json()
    expect(cloned.is_system).toBe(false)
    expect(cloned.parent_taxonomy_id).toBe(usgaap.id)
    expect(cloned.name).toBe('US GAAP - E2E Test Clone')
  })

  test('PATCH on system taxonomy node returns 409', async ({ request }) => {
    const list = await (await request.get('http://localhost:8002/api/v1/taxonomies')).json()
    const usgaap = list.find((t: { code: string }) => t.code === 'us_gaap')
    const nodes = await (await request.get(`http://localhost:8002/api/v1/taxonomies/${usgaap.id}/nodes`)).json()
    const firstNode = nodes[0]
    const res = await request.patch(`http://localhost:8002/api/v1/taxonomies/nodes/${firstNode.id}`, {
      data: { name: 'should be rejected' },
    })
    expect(res.status()).toBe(409)
  })

  test('Taxonomy Library page renders system + custom sections', async ({ page }) => {
    await login(page)
    await page.goto('/taxonomy/library')
    await expect(page.getByText(/system taxonomies/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/US GAAP/i).first()).toBeVisible()
    await expect(page.getByText(/IFRS/i).first()).toBeVisible()
    await expect(page.getByText(/SaaS/i).first()).toBeVisible()
  })

  test('clicking a taxonomy in the library loads its tree', async ({ page }) => {
    await login(page)
    await page.goto('/taxonomy/library')
    await page.getByText(/US GAAP/i).first().click()
    // Tree should render at least one section header (Assets/Liabilities/Revenue/etc.)
    await expect(
      page.getByText(/assets|liabilities|revenue/i).first()
    ).toBeVisible({ timeout: 5_000 })
  })

  test('What\'s New section announces taxonomy foundation', async ({ page }) => {
    await login(page)
    await page.goto('/overview')
    // What's New panel is collapsed by default — click the header to expand.
    const toggle = page.getByRole('button', { name: /what's new/i })
    await toggle.scrollIntoViewIfNeeded()
    await toggle.click()
    const entry = page.getByText(/Default Taxonomy Foundation/i).first()
    await expect(entry).toBeVisible({ timeout: 5_000 })
  })
})
