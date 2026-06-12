import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import { QuarterlyReviewPage } from '@/pages/QuarterlyReviewPage'
import { IssueRepositoryPage } from '@/pages/IssueRepositoryPage'
import { FinancialDiagnosticsPage } from '@/pages/FinancialDiagnosticsPage'
import { ISSUE_CATEGORIES } from '@/pages/IssueRepositoryPage'

vi.mock('@/components/ui/PageLayout', () => ({
  PageLayout: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))

vi.mock('@/components/ui/Breadcrumb', () => ({
  Breadcrumb: () => <nav />,
}))

vi.mock('@/components/ui/WorkspaceCrossLinks', () => ({
  WorkspaceCrossLinks: () => null,
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Quarterly Review ────────────────────────────────────────────────────────

describe('QuarterlyReviewPage', () => {
  it('renders the page heading', () => {
    wrap(<QuarterlyReviewPage />)
    expect(screen.getByRole('heading', { name: 'Quarterly Review' })).toBeInTheDocument()
  })

  it('renders the main content area', () => {
    wrap(<QuarterlyReviewPage />)
    expect(screen.getByTestId('quarterly-review-page')).toBeInTheDocument()
  })

  it('renders period inputs', () => {
    wrap(<QuarterlyReviewPage />)
    expect(screen.getByTestId('period-inputs')).toBeInTheDocument()
    expect(screen.getByTestId('current-period-input')).toBeInTheDocument()
    expect(screen.getByTestId('prior-period-input')).toBeInTheDocument()
  })

  it('run button is disabled until both periods are selected', () => {
    wrap(<QuarterlyReviewPage />)
    const btn = screen.getByTestId('run-review-btn')
    expect(btn).toBeDisabled()
  })

  it('run button becomes enabled after both periods filled', () => {
    wrap(<QuarterlyReviewPage />)
    fireEvent.change(screen.getByTestId('current-period-input'), { target: { value: '2024-03' } })
    fireEvent.change(screen.getByTestId('prior-period-input'), { target: { value: '2023-12' } })
    expect(screen.getByTestId('run-review-btn')).not.toBeDisabled()
  })

  it('renders all output sections', () => {
    wrap(<QuarterlyReviewPage />)
    expect(screen.getByTestId('output-sections')).toBeInTheDocument()
    expect(screen.getByTestId('output-section-variance-review')).toBeInTheDocument()
    expect(screen.getByTestId('output-section-risk-indicators')).toBeInTheDocument()
    expect(screen.getByTestId('output-section-accounting-issues')).toBeInTheDocument()
    expect(screen.getByTestId('output-section-follow-up')).toBeInTheDocument()
    expect(screen.getByTestId('output-section-suggested-adjustments')).toBeInTheDocument()
  })

  it('shows coming-soon badges on output sections', () => {
    wrap(<QuarterlyReviewPage />)
    const badges = screen.getAllByText(/Intelligence Engine — Coming Soon/i)
    expect(badges.length).toBe(5)
  })
})

// ── Issue Repository ────────────────────────────────────────────────────────

describe('IssueRepositoryPage', () => {
  it('renders the page heading', () => {
    wrap(<IssueRepositoryPage />)
    expect(screen.getByRole('heading', { name: 'Issue Repository' })).toBeInTheDocument()
  })

  it('renders the main content area', () => {
    wrap(<IssueRepositoryPage />)
    expect(screen.getByTestId('issue-repository-page')).toBeInTheDocument()
  })

  it('renders 15 issue categories', () => {
    wrap(<IssueRepositoryPage />)
    expect(ISSUE_CATEGORIES.length).toBe(15)
    expect(screen.getByTestId('category-list')).toBeInTheDocument()
    for (const cat of ISSUE_CATEGORIES) {
      expect(screen.getByTestId(`category-${cat.id}`)).toBeInTheDocument()
    }
  })

  it('shows "no category selected" placeholder initially', () => {
    wrap(<IssueRepositoryPage />)
    expect(screen.getByTestId('no-category-selected')).toBeInTheDocument()
  })

  it('clicking a category shows the category empty state', () => {
    wrap(<IssueRepositoryPage />)
    fireEvent.click(screen.getByTestId('category-revenue-recognition'))
    expect(screen.queryByTestId('no-category-selected')).not.toBeInTheDocument()
    expect(screen.getByTestId('category-empty')).toBeInTheDocument()
  })

  it('has a search input for categories', () => {
    wrap(<IssueRepositoryPage />)
    expect(screen.getByTestId('category-search')).toBeInTheDocument()
  })

  it('search filters visible categories', () => {
    wrap(<IssueRepositoryPage />)
    fireEvent.change(screen.getByTestId('category-search'), { target: { value: 'revenue' } })
    expect(screen.getByTestId('category-revenue-recognition')).toBeInTheDocument()
    expect(screen.queryByTestId('category-inventory')).not.toBeInTheDocument()
  })

  it('contains the expected category ids', () => {
    const ids = ISSUE_CATEGORIES.map((c) => c.id)
    expect(ids).toContain('revenue-recognition')
    expect(ids).toContain('accounts-receivable')
    expect(ids).toContain('inventory')
    expect(ids).toContain('fixed-assets')
    expect(ids).toContain('leases')
    expect(ids).toContain('payroll')
    expect(ids).toContain('debt')
    expect(ids).toContain('equity')
    expect(ids).toContain('taxes')
    expect(ids).toContain('related-parties')
    expect(ids).toContain('cash-flow')
    expect(ids).toContain('working-capital')
    expect(ids).toContain('ebitda-addbacks')
    expect(ids).toContain('qoe-adjustments')
    expect(ids).toContain('sba-adjustments')
  })
})

// ── Financial Diagnostics ───────────────────────────────────────────────────

describe('FinancialDiagnosticsPage', () => {
  it('renders the page heading', () => {
    wrap(<FinancialDiagnosticsPage />)
    expect(screen.getByRole('heading', { name: 'Financial Diagnostics' })).toBeInTheDocument()
  })

  it('renders the main content area', () => {
    wrap(<FinancialDiagnosticsPage />)
    expect(screen.getByTestId('financial-diagnostics-page')).toBeInTheDocument()
  })

  it('renders all 4 diagnostic categories', () => {
    wrap(<FinancialDiagnosticsPage />)
    expect(screen.getByTestId('diagnostic-category-ratio-analysis')).toBeInTheDocument()
    expect(screen.getByTestId('diagnostic-category-trend-analysis')).toBeInTheDocument()
    expect(screen.getByTestId('diagnostic-category-balance-check')).toBeInTheDocument()
    expect(screen.getByTestId('diagnostic-category-anomaly-detection')).toBeInTheDocument()
  })

  it('shows the activation notice', () => {
    wrap(<FinancialDiagnosticsPage />)
    expect(screen.getByTestId('diagnostics-notice')).toBeInTheDocument()
  })

  it('shows coming-soon badges on diagnostic categories', () => {
    wrap(<FinancialDiagnosticsPage />)
    const badges = screen.getAllByText(/Intelligence Engine — Coming Soon/i)
    expect(badges.length).toBe(4)
  })
})
