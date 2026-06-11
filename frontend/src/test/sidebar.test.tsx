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

describe('Sidebar — Sprint 3.1', () => {
  it('renders all 6 nav groups', () => {
    renderSidebar()
    for (const group of NAV_GROUPS) {
      expect(screen.getByTestId(`nav-group-${group.id}`)).toBeInTheDocument()
    }
  })

  it('shows group labels in expanded mode', () => {
    renderSidebar()
    expect(screen.getByText('Engagement Overview')).toBeInTheDocument()
    expect(screen.getByText('Client Data')).toBeInTheDocument()
    expect(screen.getByText('Adjustment Workbench')).toBeInTheDocument()
    expect(screen.getByText('Financial Impact')).toBeInTheDocument()
    expect(screen.getByText('Deliverables')).toBeInTheDocument()
    expect(screen.getByText('Admin / Setup')).toBeInTheDocument()
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
    // client-data group is defaultOpen (hub + import-center both visible)
    expect(screen.getByTestId('nav-item-client-data-hub')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-import-center')).toBeInTheDocument()
    // workbench group is defaultOpen
    expect(screen.getByTestId('nav-item-adjustment-bridge')).toBeInTheDocument()
  })

  it('groups with defaultOpen=false are collapsed initially', () => {
    renderSidebar()
    // deliverables defaultOpen=false
    expect(screen.queryByTestId('nav-group-items-deliverables')).not.toBeInTheDocument()
    // admin defaultOpen=false
    expect(screen.queryByTestId('nav-group-items-admin')).not.toBeInTheDocument()
  })

  it('clicking a collapsed group header expands it', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('nav-group-toggle-deliverables'))
    expect(screen.getByTestId('nav-group-items-deliverables')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-close-package')).toBeInTheDocument()
  })

  it('clicking an expanded group header collapses it', () => {
    renderSidebar()
    // client-data is open by default
    expect(screen.getByTestId('nav-group-items-client-data')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('nav-group-toggle-client-data'))
    expect(screen.queryByTestId('nav-group-items-client-data')).not.toBeInTheDocument()
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

  it('Coming Soon badges render for placeholder items', () => {
    renderSidebar()
    // engagement-status has Coming Soon badge and is in open group
    const badge = screen.getByTestId('badge-engagement-status')
    expect(badge).toBeInTheDocument()
    expect(badge.textContent).toBe('Coming Soon')
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
    // Check a representative item from each group
    expect(screen.getByTestId('nav-item-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-client-data-hub')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-pdf-import')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-journal-entries')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-trial-balances')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-reports')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-help')).toBeInTheDocument()
  })

  it('active group auto-expands when navigating into it', () => {
    // deliverables is defaultOpen=false; navigate to a route inside it
    renderSidebar('/deliverables/close-package')
    expect(screen.getByTestId('nav-group-items-deliverables')).toBeInTheDocument()
  })
})
