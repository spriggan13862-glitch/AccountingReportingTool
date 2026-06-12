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

describe('Sidebar — Sprint 3.9A', () => {
  it('renders all 7 nav groups', () => {
    renderSidebar()
    for (const group of NAV_GROUPS) {
      expect(screen.getByTestId(`nav-group-${group.id}`)).toBeInTheDocument()
    }
  })

  it('shows correct group labels', () => {
    renderSidebar()
    expect(screen.getByText('Engagement Overview')).toBeInTheDocument()
    expect(screen.getByText('Client Data')).toBeInTheDocument()
    expect(screen.getByText('Adjustment Workbench')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-analysis')).toBeInTheDocument()
    expect(screen.getByText('Deliverables')).toBeInTheDocument()
    expect(screen.getByText('Setup')).toBeInTheDocument()
    expect(screen.getByText('Administration')).toBeInTheDocument()
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

  it('groups default-open show their items', () => {
    renderSidebar()
    // engagement group is defaultOpen
    expect(screen.getByTestId('nav-item-dashboard')).toBeInTheDocument()
    // workbench group is defaultOpen
    expect(screen.getByTestId('nav-item-adjustment-workspace')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-adjustment-bridge')).toBeInTheDocument()
    // analysis group is defaultOpen
    expect(screen.getByTestId('nav-item-analysis-workspace')).toBeInTheDocument()
  })

  it('groups with defaultOpen=false are collapsed initially', () => {
    renderSidebar()
    // client-data defaultOpen=false
    expect(screen.queryByTestId('nav-group-items-client-data')).not.toBeInTheDocument()
    // deliverables defaultOpen=false
    expect(screen.queryByTestId('nav-group-items-deliverables')).not.toBeInTheDocument()
    // setup defaultOpen=false
    expect(screen.queryByTestId('nav-group-items-setup')).not.toBeInTheDocument()
    // administration defaultOpen=false
    expect(screen.queryByTestId('nav-group-items-administration')).not.toBeInTheDocument()
  })

  it('clicking a collapsed group header expands it', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('nav-group-toggle-deliverables'))
    expect(screen.getByTestId('nav-group-items-deliverables')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-close-package')).toBeInTheDocument()
  })

  it('clicking an expanded group header collapses it', () => {
    renderSidebar()
    // workbench is open by default
    expect(screen.getByTestId('nav-group-items-workbench')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('nav-group-toggle-workbench'))
    expect(screen.queryByTestId('nav-group-items-workbench')).not.toBeInTheDocument()
  })

  it('admin-only item is hidden for non-admin user', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('nav-group-toggle-administration'))
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
    fireEvent.click(screen.getByTestId('nav-group-toggle-administration'))
    expect(screen.getByTestId('nav-item-admin-users')).toBeInTheDocument()
  })

  it('all nav item testids are present across open groups', () => {
    renderSidebar()
    // Open all groups
    for (const group of NAV_GROUPS) {
      const toggle = screen.queryByTestId(`nav-group-toggle-${group.id}`)
      if (toggle) {
        const items = screen.queryByTestId(`nav-group-items-${group.id}`)
        if (!items) fireEvent.click(toggle)
      }
    }
    expect(screen.getByTestId('nav-item-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-import-center')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-adjustment-workspace')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-adjustment-bridge')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-journal-entries')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-analysis-workspace')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-deliverables-workspace')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-workpapers')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-accounts')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-reporting-settings')).toBeInTheDocument()
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
    expect(screen.queryByTestId('nav-item-draft-preview')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-item-reconciliations')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-item-advisor-package')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-item-periods')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-item-help')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-item-engagement-status')).not.toBeInTheDocument()
  })

  it('active group auto-expands when navigating into it', () => {
    // deliverables is defaultOpen=false; navigate to a route inside it
    renderSidebar('/deliverables/close-package')
    expect(screen.getByTestId('nav-group-items-deliverables')).toBeInTheDocument()
  })

  it('setup group has accounts, entities, taxonomy, reporting-views, settings', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('nav-group-toggle-setup'))
    expect(screen.getByTestId('nav-item-accounts')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-entities')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-taxonomy')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-reporting-views')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-reporting-settings')).toBeInTheDocument()
  })

  it('analysis group has single entry pointing to statements', () => {
    renderSidebar()
    const item = screen.getByTestId('nav-item-analysis-workspace')
    expect(item).toBeInTheDocument()
    expect(screen.queryByTestId('nav-item-trial-balances')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-item-comparatives')).not.toBeInTheDocument()
  })

  it('workbench group has adjustment-workspace as first item', () => {
    renderSidebar()
    const wb = NAV_GROUPS.find((g) => g.id === 'workbench')!
    expect(wb.items[0].id).toBe('adjustment-workspace')
  })

  it('total nav item count is 15', () => {
    const total = NAV_GROUPS.reduce((sum, g) => sum + g.items.length, 0)
    expect(total).toBe(15)
  })
})
