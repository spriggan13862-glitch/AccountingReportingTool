import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import { QuarterlyReviewPage } from '@/pages/QuarterlyReviewPage'
import { IssueRepositoryPage } from '@/pages/IssueRepositoryPage'
import { FinancialDiagnosticsPage } from '@/pages/FinancialDiagnosticsPage'
import { RuleHarnessPage } from '@/pages/RuleHarnessPage'

vi.mock('@/components/ui/PageLayout', () => ({
  PageLayout: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid={`pagelayout:${title}`}>
      {title && <h1>{title}</h1>}
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

vi.mock('@/components/ui/EntitySelect', () => ({
  EntitySelect: ({ onChange }: { onChange: (v: number | null) => void }) => (
    <select
      data-testid="entity-select"
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">Select entity</option>
      <option value="1">Entity 1</option>
    </select>
  ),
}))

vi.mock('@/components/ui/PeriodSelect', () => ({
  PeriodSelect: ({ onChange }: { onChange: (v: number | null) => void }) => (
    <select
      data-testid="period-select"
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">Select period</option>
      <option value="1">Period 1</option>
    </select>
  ),
}))

vi.mock('@/components/intelligence/IssueCard', () => ({
  IssueCard: () => null,
}))

vi.mock('@/components/intelligence/IssueDetailDrawer', () => ({
  IssueDetailDrawer: () => null,
}))

vi.mock('@/components/intelligence/IssueSummaryWidget', () => ({
  IssueSummaryWidget: () => null,
}))

vi.mock('@/components/intelligence/SeverityBadge', () => ({
  SeverityBadge: () => null,
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
  })

  it('run button is disabled until entity and periods are selected', () => {
    wrap(<QuarterlyReviewPage />)
    expect(screen.getByTestId('run-review-btn')).toBeDisabled()
  })

  it('shows configure-state when no entity or period selected', () => {
    wrap(<QuarterlyReviewPage />)
    expect(screen.getByTestId('configure-state')).toBeInTheDocument()
  })

  it('renders the materiality threshold input', () => {
    wrap(<QuarterlyReviewPage />)
    expect(screen.getByTestId('materiality-input')).toBeInTheDocument()
  })
})

// ── Issue Repository ────────────────────────────────────────────────────────

describe('IssueRepositoryPage', () => {
  it('renders the page heading', () => {
    wrap(<IssueRepositoryPage />)
    expect(
      screen.getByRole('heading', { name: /Accounting Intelligence Repository/i }),
    ).toBeInTheDocument()
  })

  it('renders the All Issues button', () => {
    wrap(<IssueRepositoryPage />)
    expect(screen.getByRole('button', { name: /All Issues/i })).toBeInTheDocument()
  })

  it('renders the search input', () => {
    wrap(<IssueRepositoryPage />)
    expect(screen.getByPlaceholderText('Search issues...')).toBeInTheDocument()
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

  it('shows the diagnostics notice when no data loaded', () => {
    wrap(<FinancialDiagnosticsPage />)
    expect(screen.getByTestId('diagnostics-notice')).toBeInTheDocument()
  })
})

// ── Rule Harness ─────────────────────────────────────────────────────────────

describe('RuleHarnessPage', () => {
  it('renders the page heading', () => {
    wrap(<RuleHarnessPage />)
    expect(screen.getByRole('heading', { name: 'Rule Execution Harness' })).toBeInTheDocument()
  })

  it('renders the main content area', () => {
    wrap(<RuleHarnessPage />)
    expect(screen.getByTestId('rule-harness-page')).toBeInTheDocument()
  })

  it('renders the metrics input textarea with example content', () => {
    wrap(<RuleHarnessPage />)
    const input = screen.getByTestId('metrics-input')
    expect(input).toBeInTheDocument()
    expect((input as HTMLTextAreaElement).value).toContain('current_ratio')
  })

  it('renders the Run Detection Rules button', () => {
    wrap(<RuleHarnessPage />)
    expect(screen.getByTestId('run-harness-btn')).toBeInTheDocument()
  })

  it('shows empty state before first run', () => {
    wrap(<RuleHarnessPage />)
    expect(screen.getByTestId('harness-empty')).toBeInTheDocument()
  })

  it('renders catalog toggle button', () => {
    wrap(<RuleHarnessPage />)
    expect(screen.getByTestId('catalog-toggle')).toBeInTheDocument()
  })
})
