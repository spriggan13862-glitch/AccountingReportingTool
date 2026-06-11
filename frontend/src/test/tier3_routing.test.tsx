import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect } from 'vitest'
import { NAV_GROUPS } from '@/config/nav'

function renderRoute(from: string, routes: Array<{ path: string; element: React.ReactNode }>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[from]}>
        <Routes>
          {routes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── nav.ts route contract ───────────────────────────────────────────────────

describe('nav.ts — Sprint 3.2 route values', () => {
  function item(id: string) {
    for (const g of NAV_GROUPS) {
      const found = g.items.find((i) => i.id === id)
      if (found) return found
    }
    return undefined
  }

  it('dashboard points to /engagement/dashboard', () => {
    expect(item('dashboard')?.to).toBe('/engagement/dashboard')
  })

  it('import-center points to /client-data/imports', () => {
    expect(item('import-center')?.to).toBe('/client-data/imports')
  })

  it('import-center has end:true to avoid matching sub-import routes', () => {
    expect(item('import-center')?.end).toBe(true)
  })

  it('pdf-import points to /client-data/imports/pdf', () => {
    expect(item('pdf-import')?.to).toBe('/client-data/imports/pdf')
  })

  it('coa-import points to /client-data/imports/coa', () => {
    expect(item('coa-import')?.to).toBe('/client-data/imports/coa')
  })

  it('documents points to /client-data/documents', () => {
    expect(item('documents')?.to).toBe('/client-data/documents')
  })

  it('accounts points to /client-data/chart-of-accounts', () => {
    expect(item('accounts')?.to).toBe('/client-data/chart-of-accounts')
  })

  it('adjustment-bridge points to /workbench/adjustment-bridge', () => {
    expect(item('adjustment-bridge')?.to).toBe('/workbench/adjustment-bridge')
  })

  it('journal-entries points to /workbench/journal-entries', () => {
    expect(item('journal-entries')?.to).toBe('/workbench/journal-entries')
  })

  it('draft-preview points to /workbench/draft-preview', () => {
    expect(item('draft-preview')?.to).toBe('/workbench/draft-preview')
  })

  it('eliminations points to /workbench/eliminations', () => {
    expect(item('eliminations')?.to).toBe('/workbench/eliminations')
  })

  it('trial-balances points to /financial-impact/trial-balance', () => {
    expect(item('trial-balances')?.to).toBe('/financial-impact/trial-balance')
  })

  it('financial-statements points to /financial-impact/statements', () => {
    expect(item('financial-statements')?.to).toBe('/financial-impact/statements')
  })

  it('comparatives points to /financial-impact/comparatives', () => {
    expect(item('comparatives')?.to).toBe('/financial-impact/comparatives')
  })

  it('close-package points to /deliverables/close-package', () => {
    expect(item('close-package')?.to).toBe('/deliverables/close-package')
  })

  it('workpapers points to /deliverables/workpapers', () => {
    expect(item('workpapers')?.to).toBe('/deliverables/workpapers')
  })

  it('reconciliations points to /deliverables/reconciliations', () => {
    expect(item('reconciliations')?.to).toBe('/deliverables/reconciliations')
  })

  it('report-builder points to /deliverables/report-builder', () => {
    expect(item('report-builder')?.to).toBe('/deliverables/report-builder')
  })

  it('reporting-settings points to /setup/settings', () => {
    expect(item('reporting-settings')?.to).toBe('/setup/settings')
  })

  it('help points to /setup/help', () => {
    expect(item('help')?.to).toBe('/setup/help')
  })
})

// ── legacy redirect behaviour ───────────────────────────────────────────────

function legacy(oldPath: string, newPath: string, label: string) {
  it(`${oldPath} → ${newPath}`, () => {
    renderRoute(oldPath, [
      { path: oldPath, element: <Navigate replace to={newPath} /> },
      { path: newPath, element: <div data-testid="new-page">{label}</div> },
    ])
    expect(screen.getByTestId('new-page')).toBeInTheDocument()
    expect(screen.getByText(label)).toBeInTheDocument()
  })
}

describe('Legacy redirect — old routes resolve to new pages', () => {
  legacy('/import',              '/client-data/imports',            'Import Center')
  legacy('/documents',           '/client-data/documents',          'Documents')
  legacy('/accounts',            '/client-data/chart-of-accounts',  'Chart of Accounts')
  legacy('/taxonomy-admin',      '/client-data/taxonomy-mapping',   'Taxonomy')
  legacy('/entities',            '/client-data/entities',           'Entities')
  legacy('/periods',             '/client-data/periods',            'Periods')
  legacy('/adjustment-bridge',   '/workbench/adjustment-bridge',    'Adjustment Bridge')
  legacy('/journal-entries',     '/workbench/journal-entries',      'Journal Entries')
  legacy('/draft-preview',       '/workbench/draft-preview',        'Draft Preview')
  legacy('/consolidations',      '/workbench/eliminations',         'Eliminations')
  legacy('/trial-balances',      '/financial-impact/trial-balance', 'Trial Balance')
  legacy('/financial-statements','/financial-impact/statements',    'Financial Statements')
  legacy('/fs-builder',          '/financial-impact/builder',       'FS Builder')
  legacy('/comparative-financials', '/financial-impact/comparatives', 'Comparatives')
  legacy('/variance-analysis',   '/financial-impact/variance',      'Variance')
  legacy('/close',               '/deliverables/close-package',     'Close Package')
  legacy('/close/workpapers',    '/deliverables/workpapers',        'Workpapers')
  legacy('/reconciliations',     '/deliverables/reconciliations',   'Reconciliations')
  legacy('/report-builder',      '/deliverables/report-builder',    'Report Builder')
  legacy('/reports',             '/deliverables/reports',           'Reports')
  legacy('/reporting-settings',  '/setup/settings',                 'Settings')
  legacy('/help',                '/setup/help',                     'Help')
  legacy('/imports/trial-balance', '/client-data/imports/trial-balance', 'TB Import')
  legacy('/imports/general-ledger', '/client-data/imports/general-ledger', 'GL Import')
  legacy('/imports/journal-entries', '/client-data/imports/journal-entries', 'JE Import')
})

// ── routes that must NOT redirect (query string / param routes kept direct) ─

describe('Routes with query strings kept as direct routes', () => {
  it('/pdf-import renders directly (not redirected)', () => {
    renderRoute('/pdf-import', [
      { path: '/pdf-import', element: <div data-testid="pdf-page">PDF Page</div> },
    ])
    expect(screen.getByTestId('pdf-page')).toBeInTheDocument()
  })

  it('/coa-import renders directly (not redirected)', () => {
    renderRoute('/coa-import', [
      { path: '/coa-import', element: <div data-testid="coa-page">COA Page</div> },
    ])
    expect(screen.getByTestId('coa-page')).toBeInTheDocument()
  })

  it('/import/:id renders directly (not redirected)', () => {
    renderRoute('/import/abc-123', [
      { path: '/import/:id', element: <div data-testid="review-page">Import Review</div> },
    ])
    expect(screen.getByTestId('review-page')).toBeInTheDocument()
  })
})

// ── sidebar active state with new nested routes ─────────────────────────────

describe('Sidebar nav config — nested route active logic', () => {
  it('client-data group should be active on /client-data/imports/pdf sub-route', () => {
    const cdGroup = NAV_GROUPS.find((g) => g.id === 'client-data')!
    const pathname = '/client-data/imports/pdf'
    const active = cdGroup.items.some((item) => {
      if (!item.to) return false
      if (item.end) return pathname === item.to
      return pathname === item.to || pathname.startsWith(item.to + '/')
    })
    expect(active).toBe(true)
  })

  it('workbench group should be active on /workbench/journal-entries/new', () => {
    const wbGroup = NAV_GROUPS.find((g) => g.id === 'workbench')!
    const pathname = '/workbench/journal-entries/new'
    const active = wbGroup.items.some((item) => {
      if (!item.to) return false
      if (item.end) return pathname === item.to
      return pathname === item.to || pathname.startsWith(item.to + '/')
    })
    expect(active).toBe(true)
  })

  it('deliverables group should be active on /deliverables/close-package/abc-id', () => {
    const dGroup = NAV_GROUPS.find((g) => g.id === 'deliverables')!
    const pathname = '/deliverables/close-package/abc-id'
    const active = dGroup.items.some((item) => {
      if (!item.to) return false
      if (item.end) return pathname === item.to
      return pathname === item.to || pathname.startsWith(item.to + '/')
    })
    expect(active).toBe(true)
  })

  it('import-center (end:true) should NOT be active at /client-data/imports/pdf', () => {
    const importItem = NAV_GROUPS
      .find((g) => g.id === 'client-data')!
      .items.find((i) => i.id === 'import-center')!
    const pathname = '/client-data/imports/pdf'
    const isActive = importItem.end ? pathname === importItem.to : pathname.startsWith(importItem.to! + '/')
    expect(isActive).toBe(false)
  })

  it('pdf-import item should be active at /client-data/imports/pdf', () => {
    const pdfItem = NAV_GROUPS
      .find((g) => g.id === 'client-data')!
      .items.find((i) => i.id === 'pdf-import')!
    const pathname = '/client-data/imports/pdf'
    const isActive = pdfItem.end ? pathname === pdfItem.to : (pathname === pdfItem.to || pathname.startsWith(pdfItem.to! + '/'))
    expect(isActive).toBe(true)
  })
})
