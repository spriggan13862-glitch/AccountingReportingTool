import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sidebar } from '@/layouts/Sidebar'
import { NAV_GROUPS } from '@/config/nav'

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: vi.fn(() => ({ user: { is_superuser: false }, token: 'tok', isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })),
}))

import { useAuth } from '@/providers/AuthProvider'

function renderSidebar(path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 1, email: 'test@test.com', is_superuser: false, organization_id: 'default-org' } as never,
    token: 'tok',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  })
})

describe('Sidebar — Sprint 3.11', () => {
  it('renders all 8 nav groups', () => {
    renderSidebar()
    for (const group of NAV_GROUPS) {
      expect(screen.getByTestId(`nav-group-${group.id}`)).toBeInTheDocument()
    }
  })

  it('shows correct group labels', () => {
    renderSidebar()
    expect(screen.getByTestId('nav-group-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-workbench')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-intelligence')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-financial-impact')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-client-books')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-deliverables')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-setup')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-admin')).toBeInTheDocument()
  })

  it('renders the LA logo and brand name', () => {
    renderSidebar()
    expect(screen.getByText('LA')).toBeInTheDocument()
    expect(screen.getByText('Ledger Advisory')).toBeInTheDocument()
  })

  it('collapse button toggles sidebar width class', () => {
    renderSidebar()
    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar.className).toContain('w-56')
    fireEvent.click(screen.getByTestId('sidebar-collapse-btn'))
    expect(sidebar.className).toContain('w-12')
    fireEvent.click(screen.getByTestId('sidebar-collapse-btn'))
    expect(sidebar.className).toContain('w-56')
  })

  it('default-open groups show their items', () => {
    renderSidebar()
    // dashboard group is defaultOpen
    expect(screen.getByTestId('nav-item-dashboard')).toBeInTheDocument()
    // workbench group is defaultOpen
    expect(screen.getByTestId('nav-item-adjustment-workspace')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-draft-preview')).toBeInTheDocument()
    // intelligence group is defaultOpen
    expect(screen.getByTestId('nav-item-quarterly-review')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-issue-repository')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-financial-diagnostics')).toBeInTheDocument()
    // financial-impact group is defaultOpen
    expect(screen.getByTestId('nav-item-financial-impact')).toBeInTheDocument()
  })

  it('groups with defaultOpen=false are collapsed initially', () => {
    renderSidebar()
    expect(screen.queryByTestId('nav-group-items-client-books')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-group-items-deliverables')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-group-items-setup')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-group-items-admin')).not.toBeInTheDocument()
  })

  it('clicking a collapsed group header expands it', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('nav-group-toggle-setup'))
    expect(screen.getByTestId('nav-group-items-setup')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-accounts')).toBeInTheDocument()
  })

  it('clicking an expanded group header collapses it', () => {
    renderSidebar()
    expect(screen.getByTestId('nav-group-items-workbench')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('nav-group-toggle-workbench'))
    expect(screen.queryByTestId('nav-group-items-workbench')).not.toBeInTheDocument()
  })

  it('admin-only item is hidden for non-admin user', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('nav-group-toggle-admin'))
    expect(screen.queryByTestId('nav-item-admin-users')).not.toBeInTheDocument()
  })

  it('admin-only item is visible for superuser', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1, email: 'admin@test.com', is_superuser: true, organization_id: 'default-org' } as never,
      token: 'tok',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    })
    renderSidebar()
    fireEvent.click(screen.getByTestId('nav-group-toggle-admin'))
    expect(screen.getByTestId('nav-item-admin-users')).toBeInTheDocument()
  })

  it('non-admin sees settings and help in admin group', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('nav-group-toggle-admin'))
    expect(screen.getByTestId('nav-item-reporting-settings')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-help')).toBeInTheDocument()
  })

  it('all nav item testids are present across open groups', () => {
    renderSidebar()
    for (const group of NAV_GROUPS) {
      const toggle = screen.queryByTestId(`nav-group-toggle-${group.id}`)
      if (toggle) {
        const items = screen.queryByTestId(`nav-group-items-${group.id}`)
        if (!items) fireEvent.click(toggle)
      }
    }
    // dashboard
    expect(screen.getByTestId('nav-item-dashboard')).toBeInTheDocument()
    // workbench
    expect(screen.getByTestId('nav-item-adjustment-workspace')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-adjustment-bridge')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-journal-entries')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-draft-preview')).toBeInTheDocument()
    // intelligence
    expect(screen.getByTestId('nav-item-quarterly-review')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-issue-repository')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-financial-diagnostics')).toBeInTheDocument()
    // financial-impact
    expect(screen.getByTestId('nav-item-financial-impact')).toBeInTheDocument()
    // client-books
    expect(screen.getByTestId('nav-item-import-center')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-documents')).toBeInTheDocument()
    // deliverables
    expect(screen.getByTestId('nav-item-deliverables-workspace')).toBeInTheDocument()
    // setup
    expect(screen.getByTestId('nav-item-accounts')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-taxonomy')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-reporting-views')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-entities')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-periods')).toBeInTheDocument()
  })

  it('setup group has accounts, taxonomy, reporting-views, entities, periods', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('nav-group-toggle-setup'))
    expect(screen.getByTestId('nav-item-accounts')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-taxonomy')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-reporting-views')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-entities')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-periods')).toBeInTheDocument()
  })

  it('intelligence group has quarterly-review, issue-repository, financial-diagnostics', () => {
    renderSidebar()
    expect(screen.getByTestId('nav-item-quarterly-review')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-issue-repository')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-financial-diagnostics')).toBeInTheDocument()
  })

  it('removed items are no longer in the nav', () => {
    renderSidebar()
    for (const group of NAV_GROUPS) {
      const toggle = screen.queryByTestId(`nav-group-toggle-${group.id}`)
      if (toggle) {
        const items = screen.queryByTestId(`nav-group-items-${group.id}`)
        if (!items) fireEvent.click(toggle)
      }
    }
    expect(screen.queryByTestId('nav-item-close-package')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-item-workpapers')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-item-reconciliations')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-item-advisor-package')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-item-analysis-workspace')).not.toBeInTheDocument()
  })

  it('active group auto-expands when navigating into it', () => {
    renderSidebar('/intelligence/quarterly-review')
    expect(screen.getByTestId('nav-group-items-intelligence')).toBeInTheDocument()
  })

  it('workbench group has 4 items', () => {
    const wb = NAV_GROUPS.find((g) => g.id === 'workbench')!
    expect(wb.items.length).toBe(4)
    expect(wb.items[0].id).toBe('adjustment-workspace')
    expect(wb.items[3].id).toBe('draft-preview')
  })

  it('intelligence group has 3 items', () => {
    const g = NAV_GROUPS.find((g) => g.id === 'intelligence')!
    expect(g.items.length).toBe(3)
  })

  it('financial-impact group has exactly 1 item', () => {
    const g = NAV_GROUPS.find((g) => g.id === 'financial-impact')!
    expect(g.items.length).toBe(1)
    expect(g.items[0].id).toBe('financial-impact')
  })

  it('total nav item count is 20', () => {
    const total = NAV_GROUPS.reduce((sum, g) => sum + g.items.length, 0)
    expect(total).toBe(20)
  })
})
