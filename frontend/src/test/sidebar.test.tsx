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

describe('Sidebar — Sprint 4.0 navigation model', () => {
  it('renders all 5 nav groups', () => {
    renderSidebar()
    for (const group of NAV_GROUPS) {
      expect(screen.getByTestId(`nav-group-${group.id}`)).toBeInTheDocument()
    }
  })

  it('shows correct group testids', () => {
    renderSidebar()
    expect(screen.getByTestId('nav-group-overview')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-client-books')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-review-adjust')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-deliverables')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-administration')).toBeInTheDocument()
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
  })

  it('multi-item groups have toggle buttons', () => {
    renderSidebar()
    expect(screen.getByTestId('nav-group-toggle-client-books')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-toggle-review-adjust')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-toggle-deliverables')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-toggle-administration')).toBeInTheDocument()
  })

  it('default-open groups show their items', () => {
    renderSidebar()
    expect(screen.getByTestId('nav-item-overview')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-import')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-mapping')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-statements')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-bridge')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-adjustments')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-consolidation')).toBeInTheDocument()
  })

  it('deliverables group is collapsed by default', () => {
    renderSidebar()
    expect(screen.queryByTestId('nav-group-items-deliverables')).not.toBeInTheDocument()
  })

  it('administration group is collapsed by default', () => {
    renderSidebar()
    expect(screen.queryByTestId('nav-group-items-administration')).not.toBeInTheDocument()
  })

  it('clicking a collapsed group header expands it', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('nav-group-toggle-deliverables'))
    expect(screen.getByTestId('nav-group-items-deliverables')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-deliverables')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-exports')).toBeInTheDocument()
  })

  it('clicking an expanded group header collapses it', () => {
    renderSidebar()
    expect(screen.getByTestId('nav-group-items-review-adjust')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('nav-group-toggle-review-adjust'))
    expect(screen.queryByTestId('nav-group-items-review-adjust')).not.toBeInTheDocument()
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
    expect(screen.getByTestId('nav-item-import')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-mapping')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-statements')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-bridge')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-adjustments')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-consolidation')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-deliverables')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-exports')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-admin-entities')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-admin-periods')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-admin-documents')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-admin-settings')).toBeInTheDocument()
  })

  it('client-books group has 2 items', () => {
    const g = NAV_GROUPS.find((g) => g.id === 'client-books')!
    expect(g.items.length).toBe(2)
    expect(g.items[0].id).toBe('import')
    expect(g.items[1].id).toBe('mapping')
  })

  it('review-adjust group has 5 items', () => {
    const g = NAV_GROUPS.find((g) => g.id === 'review-adjust')!
    expect(g.items.length).toBe(5)
    expect(g.items[0].id).toBe('statements')
  })

  it('deliverables group has 2 items', () => {
    const g = NAV_GROUPS.find((g) => g.id === 'deliverables')!
    expect(g.items.length).toBe(2)
    expect(g.items[0].id).toBe('deliverables')
  })

  it('administration group has 4 items', () => {
    const g = NAV_GROUPS.find((g) => g.id === 'administration')!
    expect(g.items.length).toBe(4)
  })

  it('total nav item count is 14', () => {
    const total = NAV_GROUPS.reduce((sum, g) => sum + g.items.length, 0)
    expect(total).toBe(14)
  })

  it('review-adjust group auto-expands when navigating into it', () => {
    renderSidebar('/statements')
    expect(screen.getByTestId('nav-group-items-review-adjust')).toBeInTheDocument()
  })
})
