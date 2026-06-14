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

describe('Sidebar — Sprint 3.18 flat rail', () => {
  it('renders all 6 nav groups', () => {
    renderSidebar()
    for (const group of NAV_GROUPS) {
      expect(screen.getByTestId(`nav-group-${group.id}`)).toBeInTheDocument()
    }
  })

  it('shows correct group testids', () => {
    renderSidebar()
    expect(screen.getByTestId('nav-group-overview')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-import')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-review')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-adjustments')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-deliverables')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-setup')).toBeInTheDocument()
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

  it('single-item groups render as direct NavLinks (no toggle button)', () => {
    renderSidebar()
    expect(screen.queryByTestId('nav-group-toggle-overview')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-group-toggle-import')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-group-toggle-setup')).not.toBeInTheDocument()
  })

  it('multi-item groups have toggle buttons', () => {
    renderSidebar()
    expect(screen.getByTestId('nav-group-toggle-review')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-toggle-adjustments')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-toggle-deliverables')).toBeInTheDocument()
  })

  it('default-open groups show their items', () => {
    renderSidebar()
    // overview group is defaultOpen (single item — direct NavLink)
    expect(screen.getByTestId('nav-item-overview')).toBeInTheDocument()
    // import group is defaultOpen (single item — direct NavLink)
    expect(screen.getByTestId('nav-item-import-center')).toBeInTheDocument()
    // review group is defaultOpen
    expect(screen.getByTestId('nav-item-review')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-review-tb')).toBeInTheDocument()
    // adjustments group is defaultOpen
    expect(screen.getByTestId('nav-item-adjustments')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-journal-entries')).toBeInTheDocument()
  })

  it('deliverables group is collapsed by default', () => {
    renderSidebar()
    expect(screen.queryByTestId('nav-group-items-deliverables')).not.toBeInTheDocument()
  })

  it('clicking a collapsed group header expands it', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('nav-group-toggle-deliverables'))
    expect(screen.getByTestId('nav-group-items-deliverables')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-deliverables-workspace')).toBeInTheDocument()
  })

  it('clicking an expanded group header collapses it', () => {
    renderSidebar()
    expect(screen.getByTestId('nav-group-items-review')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('nav-group-toggle-review'))
    expect(screen.queryByTestId('nav-group-items-review')).not.toBeInTheDocument()
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
    expect(screen.getByTestId('nav-item-overview')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-import-center')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-review')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-review-tb')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-review-comparatives')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-review-issues')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-adjustments')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-journal-entries')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-consolidations')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-deliverables-workspace')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-deliverables-workpapers')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-deliverables-reconciliations')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-deliverables-close')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-deliverables-reports')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-setup')).toBeInTheDocument()
  })

  it('review group has 4 items', () => {
    const g = NAV_GROUPS.find((g) => g.id === 'review')!
    expect(g.items.length).toBe(4)
  })

  it('adjustments group has 3 items', () => {
    const g = NAV_GROUPS.find((g) => g.id === 'adjustments')!
    expect(g.items.length).toBe(3)
    expect(g.items[0].id).toBe('adjustments')
  })

  it('deliverables group has 5 items', () => {
    const g = NAV_GROUPS.find((g) => g.id === 'deliverables')!
    expect(g.items.length).toBe(5)
    expect(g.items[0].id).toBe('deliverables-workspace')
  })

  it('total nav item count is 15', () => {
    const total = NAV_GROUPS.reduce((sum, g) => sum + g.items.length, 0)
    expect(total).toBe(15)
  })

  it('active group auto-expands when navigating into it', () => {
    renderSidebar('/review/trial-balance')
    expect(screen.getByTestId('nav-group-items-review')).toBeInTheDocument()
  })
})
