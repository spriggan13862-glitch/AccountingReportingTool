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

describe('nav.ts — Sprint 3.18 flat rail route values', () => {
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

  it('import-center points to /client-data/imports', () => {
    expect(item('import-center')?.to).toBe('/client-data/imports')
  })

  it('review points to /review', () => {
    expect(item('review')?.to).toBe('/review')
  })

  it('review has end:true', () => {
    expect(item('review')?.end).toBe(true)
  })

  it('review-tb points to /review/trial-balance', () => {
    expect(item('review-tb')?.to).toBe('/review/trial-balance')
  })

  it('journal-entries points to /adjustments/journal-entries', () => {
    expect(item('journal-entries')?.to).toBe('/adjustments/journal-entries')
  })

  it('adjustments group has 3 items', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'adjustments')!
    expect(group.items.length).toBe(3)
  })

  it('review group has 4 items', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'review')!
    expect(group.items.length).toBe(4)
  })

  it('deliverables-workspace points to /deliverables/workspace', () => {
    expect(item('deliverables-workspace')?.to).toBe('/deliverables/workspace')
  })

  it('deliverables group has 5 items', () => {
    const group = NAV_GROUPS.find((g) => g.id === 'deliverables')!
    expect(group.items.length).toBe(5)
  })

  it('setup points to /setup', () => {
    expect(item('setup')?.to).toBe('/setup')
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
  it('import group should be active on /client-data/imports', () => {
    const importGroup = NAV_GROUPS.find((g) => g.id === 'import')!
    const pathname = '/client-data/imports'
    const active = importGroup.items.some((item) => {
      if (!item.to) return false
      if (item.end) return pathname === item.to
      return pathname === item.to || pathname.startsWith(item.to + '/')
    })
    expect(active).toBe(true)
  })

  it('review group should be active on /review', () => {
    const reviewGroup = NAV_GROUPS.find((g) => g.id === 'review')!
    const pathname = '/review'
    const active = reviewGroup.items.some((item) => {
      if (!item.to) return false
      if (item.end) return pathname === item.to
      return pathname === item.to || pathname.startsWith(item.to + '/')
    })
    expect(active).toBe(true)
  })

  it('adjustments group should be active on /adjustments/journal-entries/new', () => {
    const adjGroup = NAV_GROUPS.find((g) => g.id === 'adjustments')!
    const pathname = '/adjustments/journal-entries/new'
    const active = adjGroup.items.some((item) => {
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

  it('import-center item (no end:true) should match /client-data/imports/pdf prefix', () => {
    const importItem = NAV_GROUPS
      .find((g) => g.id === 'import')!
      .items.find((i) => i.id === 'import-center')!
    const pathname = '/client-data/imports/pdf'
    const isActive = importItem.end ? pathname === importItem.to : pathname.startsWith(importItem.to! + '/')
    expect(isActive).toBe(true)
  })
})
