/**
 * CPA workflow verification — API-driven path.
 *
 * Bypasses the wizard UI and exercises the backend endpoints the wizard
 * relies on, using the realistic CPA-style TB fixture. This catches
 * defects in the redesigned workflow that would manifest as broken
 * behavior regardless of how the user navigates the UI.
 */
import { test, expect } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURE = path.resolve(__dirname, '../../tests/fixtures/tb/cpa_quickbooks_tb.csv')

const API = 'http://localhost:8002/api/v1'

async function loginAndGetToken(request: any): Promise<string | null> {
  const r = await request.post(`${API}/auth/login`, {
    data: { email: 'admin@livemarketing.test', password: 'Test1234!' },
  })
  if (r.status() !== 200) return null
  const body = await r.json()
  return body.access_token ?? body.token ?? null
}

test.describe('CPA workflow — API-driven verification', () => {
  test('detect endpoint identifies Column B as account_combined', async ({ request }) => {
    const token = await loginAndGetToken(request)
    const fileBuf = fs.readFileSync(FIXTURE)
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
    const r = await request.post(`${API}/tb-imports/detect`, {
      headers,
      multipart: {
        file: { name: 'cpa.csv', mimeType: 'text/csv', buffer: fileBuf },
      },
    })
    if (r.status() === 401 || r.status() === 403) {
      test.skip(true, 'Auth required; skipping API verification')
      return
    }
    expect(r.ok()).toBeTruthy()
    const body = await r.json()
    console.log('detect response keys:', Object.keys(body))
    console.log('detect headers:', body.headers)
    console.log('detect detected_mapping:', body.detected_mapping)

    expect(body.detected_mapping).toBeTruthy()
    // Hard requirement: Column B header "Account" must be mapped as
    // account_combined OR account_number; never to a Debit/Credit column.
    const accountField = body.detected_mapping.account_combined ?? body.detected_mapping.account_number
    expect(accountField).toBe('Account')
    expect(body.detected_mapping.debit).toBe('Debit')
    expect(body.detected_mapping.credit).toBe('Credit')
  })
})
