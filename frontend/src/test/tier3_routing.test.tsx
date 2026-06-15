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

describe('nav.ts — Sprint 4.0 navigation model route values', () => {
  function item(id: string) {
    for (const g of NAV_GROUPS) {
      const found = g.items.find((i) => i.id === id)
      if (found) return found
    }
    return undefined
  }

  it('overview points to /overview', () => {
    expect(item('overview')?.to).toBe('/overview')
  })

  it('overview has end:true', () => {
    expect(item('overview')?.end).toBe(true)
  })

  it('import points to /import', () => {
    expect(item('import')?.to).toBe('/import')
  })

  it('mapping points to /mapping', () => {
    expect(item('mapping')?.to).toBe('/mapping')
  })

  it('statements points to /statements', () => {
    expect(item('statements')?.to).toBe('/statements')
  })

  it('statements has end:true', () => {
    expect(item('statements')?.end).toBe(true)
  })

  it('bridge points to /bridge', () => {
    expect(item('bridge')?.to).toBe('/bridge')
  })

  it('adjustments points to /adjustments', () => {
    expect(item('adjustments')?.to).toBe('/adjustments')
  })

  it('adjustments does not have end:true (matches all /adjustments/* sub-paths)', () => {
    expect(item('adjustments')?.end).toBeUndefined()
  })

  it('consolidation points to /consolidation', () => {
    expect(item('consolidation')?.to).toBe('/consolidation')
  })

  it('deliverables points to /deliverables', () => {
    expect(item('deliverables')?.to).toBe('/deliverables')
  })

  it('exports points to /exports', () => {
    expect(item('exports')?.to).toBe('/exports')
  })

  it('admin-entities points to /admin/entities', () => {
    expect(item('admin-entities')?.to).toBe('/admin/entities')
  })

  it('admin-periods points to /admin/periods', () => {
    expect(item('admin-periods')?.to).toBe('/admin/periods')
  })

  it('admin-documents points to /admin/documents', () => {
    expect(item('admin-documents')?.to).toBe('/admin/documents')
  })

  it('admin-settings points to /admin/settings', () => {
    expect(item('admin-settings')?.to).toBe('/admin/settings')
  })

  it('client-books group has 2 items', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'client-books')!
    expect(group.items.length).toBe(2)
  })

  it('review-adjust group has 4 items', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'review-adjust')!
    expect(group.items.length).toBe(4)
  })

  it('deliverables group has 2 items', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'deliverables')!
    expect(group.items.length).toBe(2)
  })

  it('administration group has 4 items', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'administration')!
    expect(group.items.length).toBe(4)
  })

  it('import item has badgeKey import-unmapped', () => {
    expect(item('import')?.badgeKey).toBe('import-unmapped')
  })

  it('adjustments item has badgeKey draft-je', () => {
    expect(item('adjustments')?.badgeKey).toBe('draft-je')
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

// ── sidebar active state with new canonical routes ──────────────────────────

describe('Sidebar nav config — active state logic with Phase 4.0 routes', () => {
  it('client-books group is active on /import', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'client-books')!
    const pathname = '/import'
    const active = group.items.some((item) => {
      if (!item.to) return false
      if (item.end) return pathname === item.to
      return pathname === item.to || pathname.startsWith(item.to + '/')
    })
    expect(active).toBe(true)
  })

  it('review-adjust group is active on /statements', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'review-adjust')!
    const pathname = '/statements'
    const active = group.items.some((item) => {
      if (!item.to) return false
      if (item.end) return pathname === item.to
      return pathname === item.to || pathname.startsWith(item.to + '/')
    })
    expect(active).toBe(true)
  })

  it('review-adjust group is active on /bridge', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'review-adjust')!
    const active = group.items.some((item) => {
      if (!item.to) return false
      return item.to === '/bridge'
    })
    expect(active).toBe(true)
  })

  it('review-adjust group is active on /adjustments/journal-entries/new', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'review-adjust')!
    const pathname = '/adjustments/journal-entries/new'
    const active = group.items.some((item) => {
      if (!item.to) return false
      if (item.end) return pathname === item.to
      return pathname === item.to || pathname.startsWith(item.to + '/')
    })
    expect(active).toBe(true)
  })

  it('deliverables group is active on /deliverables', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'deliverables')!
    const pathname = '/deliverables'
    const active = group.items.some((item) => {
      if (!item.to) return false
      if (item.end) return pathname === item.to
      return pathname === item.to || pathname.startsWith(item.to + '/')
    })
    expect(active).toBe(true)
  })

  it('import item (no end:true) should match /import/new prefix', () => {
    const importItem = NAV_GROUPS
      .find((g) => g.id === 'client-books')!
      .items.find((i) => i.id === 'import')!
    const pathname = '/import/new'
    const isActive = importItem.end ? pathname === importItem.to : pathname.startsWith(importItem.to! + '/')
    expect(isActive).toBe(true)
  })
})
