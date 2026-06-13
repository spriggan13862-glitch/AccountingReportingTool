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

  it('financial-impact single entry points to /financial-impact/statements', () => {
    expect(item('financial-impact')?.to).toBe('/financial-impact/statements')
  })

  it('financial-impact group has exactly 1 item', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'financial-impact')!
    expect(group.items.length).toBe(1)
  })

  it('reporting-settings points to /setup/settings', () => {
    expect(item('reporting-settings')?.to).toBe('/setup/settings')
  })

  it('reporting-settings label is Settings', () => {
    expect(item('reporting-settings')?.label).toBe('Settings')
  })

  it('help points to /setup/help', () => {
    expect(item('help')?.to).toBe('/setup/help')
  })

  it('entities is in setup group', () => {
    const setupGroup = NAV_GROUPS.find((g) => g.id === 'setup')!
    expect(setupGroup.items.find((i) => i.id === 'entities')).toBeDefined()
  })

  it('periods is in setup group', () => {
    const setupGroup = NAV_GROUPS.find((g) => g.id === 'setup')!
    expect(setupGroup.items.find((i) => i.id === 'periods')).toBeDefined()
  })

  it('taxonomy is in setup group with label Taxonomy Admin', () => {
    const setupGroup = NAV_GROUPS.find((g) => g.id === 'setup')!
    const tax = setupGroup.items.find((i) => i.id === 'taxonomy')
    expect(tax).toBeDefined()
    expect(tax?.label).toBe('Taxonomy Admin')
  })

  it('client-books group has 2 items', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'client-books')!
    expect(group.items.length).toBe(2)
  })

  it('accounts is in setup group', () => {
    const setupGroup = NAV_GROUPS.find((g) => g.id === 'setup')!
    expect(setupGroup.items.find((i) => i.id === 'accounts')).toBeDefined()
  })

  it('workbench group has 6 items', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'workbench')!
    expect(group.items.length).toBe(6)
  })

  it('scenarios points to /workbench/scenarios', () => {
    expect(item('scenarios')?.to).toBe('/workbench/scenarios')
  })

  it('advisory-analysis points to /workbench/advisory-analysis', () => {
    expect(item('advisory-analysis')?.to).toBe('/workbench/advisory-analysis')
  })

  it('intelligence group has 4 items', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'intelligence')!
    expect(group.items.length).toBe(4)
  })

  it('quarterly-review points to /intelligence/quarterly-review', () => {
    expect(item('quarterly-review')?.to).toBe('/intelligence/quarterly-review')
  })

  it('issue-repository points to /intelligence/issue-repository', () => {
    expect(item('issue-repository')?.to).toBe('/intelligence/issue-repository')
  })

  it('financial-diagnostics points to /intelligence/financial-diagnostics', () => {
    expect(item('financial-diagnostics')?.to).toBe('/intelligence/financial-diagnostics')
  })

  it('rule-harness points to /intelligence/rule-harness', () => {
    expect(item('rule-harness')?.to).toBe('/intelligence/rule-harness')
  })

  it('deliverables group has 1 item', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'deliverables')!
    expect(group.items.length).toBe(1)
    expect(group.items[0].id).toBe('deliverables-workspace')
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
  it('client-books group should be active on /client-data/imports (import-center exact match)', () => {
    const cbGroup = NAV_GROUPS.find((g) => g.id === 'client-books')!
    const pathname = '/client-data/imports'
    const active = cbGroup.items.some((item) => {
      if (!item.to) return false
      if (item.end) return pathname === item.to
      return pathname === item.to || pathname.startsWith(item.to + '/')
    })
    expect(active).toBe(true)
  })

  it('setup group should be active on /client-data/chart-of-accounts', () => {
    const setupGroup = NAV_GROUPS.find((g) => g.id === 'setup')!
    const pathname = '/client-data/chart-of-accounts'
    const active = setupGroup.items.some((item) => {
      if (!item.to) return false
      if (item.end) return pathname === item.to
      return pathname === item.to || pathname.startsWith(item.to + '/')
    })
    expect(active).toBe(true)
  })

  it('financial-impact group should be active on /financial-impact/statements', () => {
    const fiGroup = NAV_GROUPS.find((g) => g.id === 'financial-impact')!
    const pathname = '/financial-impact/statements'
    const active = fiGroup.items.some((item) => {
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

  it('deliverables group should be active on /deliverables/workspace', () => {
    const dGroup = NAV_GROUPS.find((g) => g.id === 'deliverables')!
    const pathname = '/deliverables/workspace'
    const active = dGroup.items.some((item) => {
      if (!item.to) return false
      if (item.end) return pathname === item.to
      return pathname === item.to || pathname.startsWith(item.to + '/')
    })
    expect(active).toBe(true)
  })

  it('import-center (end:true) should NOT be active at /client-data/imports/pdf', () => {
    const importItem = NAV_GROUPS
      .find((g) => g.id === 'client-books')!
      .items.find((i) => i.id === 'import-center')!
    const pathname = '/client-data/imports/pdf'
    const isActive = importItem.end ? pathname === importItem.to : pathname.startsWith(importItem.to! + '/')
    expect(isActive).toBe(false)
  })

  it('deliverables-workspace should be active on /deliverables/workspace', () => {
    const wsItem = NAV_GROUPS
      .find((g) => g.id === 'deliverables')!
      .items.find((i) => i.id === 'deliverables-workspace')!
    const pathname = '/deliverables/workspace'
    const isActive = wsItem.end
      ? pathname === wsItem.to
      : pathname === wsItem.to || pathname.startsWith(wsItem.to! + '/')
    expect(isActive).toBe(true)
  })
})
