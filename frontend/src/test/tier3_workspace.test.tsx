import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import {
  WorkspaceShell,
  WorkspaceHeader,
  WorkspaceContextBar,
  WorkspaceFilterBar,
  WorkspaceStatusBadge,
  WorkspaceToolbar,
  WorkspaceEmptyState,
  WorkspaceBody,
} from '@/components/workspace'

vi.mock('@/providers/WorkspaceProvider', () => ({
  useWorkspace: vi.fn(() => ({ activeEntity: null, setActiveEntity: vi.fn() })),
}))

import { useWorkspace } from '@/providers/WorkspaceProvider'

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

// ── WorkspaceShell ──────────────────────────────────────────────────────────

describe('WorkspaceShell', () => {
  it('renders children with workspace-shell testid', () => {
    wrap(<WorkspaceShell><div>content</div></WorkspaceShell>)
    expect(screen.getByTestId('workspace-shell')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })
})

// ── WorkspaceHeader ─────────────────────────────────────────────────────────

describe('WorkspaceHeader', () => {
  it('renders title and description', () => {
    wrap(<WorkspaceHeader title="Journal Entries" description="Draft and post AJEs" />)
    expect(screen.getByTestId('workspace-header')).toBeInTheDocument()
    expect(screen.getByText('Journal Entries')).toBeInTheDocument()
    expect(screen.getByText('Draft and post AJEs')).toBeInTheDocument()
  })

  it('renders breadcrumbs when provided', () => {
    wrap(
      <WorkspaceHeader
        title="Test"
        breadcrumbs={[{ label: 'Workbench', href: '/workbench' }, { label: 'Test' }]}
      />
    )
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByText('Workbench')).toBeInTheDocument()
  })

  it('renders actions slot', () => {
    wrap(
      <WorkspaceHeader
        title="Test"
        actions={<button>Save</button>}
      />
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('renders status slot', () => {
    wrap(
      <WorkspaceHeader
        title="Test"
        status={<span data-testid="status-badge">Draft</span>}
      />
    )
    expect(screen.getByTestId('status-badge')).toBeInTheDocument()
  })

  it('does not render description when omitted', () => {
    wrap(<WorkspaceHeader title="Test" />)
    expect(screen.queryByText('description')).not.toBeInTheDocument()
  })
})

// ── WorkspaceContextBar ─────────────────────────────────────────────────────

describe('WorkspaceContextBar', () => {
  it('renders nothing when no context available', () => {
    vi.mocked(useWorkspace).mockReturnValue({ activeEntity: null, setActiveEntity: vi.fn() })
    const { container } = wrap(<WorkspaceContextBar />)
    expect(container.firstChild).toBeNull()
  })

  it('renders entity pill from useWorkspace', () => {
    vi.mocked(useWorkspace).mockReturnValue({
      activeEntity: { id: 1, code: 'ACME', name: 'Acme Corp' },
      setActiveEntity: vi.fn(),
    })
    wrap(<WorkspaceContextBar />)
    expect(screen.getByTestId('workspace-context-bar')).toBeInTheDocument()
    expect(screen.getByTestId('ctx-entity')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('renders period pill when period prop provided', () => {
    vi.mocked(useWorkspace).mockReturnValue({ activeEntity: null, setActiveEntity: vi.fn() })
    wrap(<WorkspaceContextBar period="Dec 2024" />)
    expect(screen.getByTestId('ctx-period')).toBeInTheDocument()
    expect(screen.getByText('Dec 2024')).toBeInTheDocument()
  })

  it('renders scenario pill when scenario prop provided', () => {
    vi.mocked(useWorkspace).mockReturnValue({ activeEntity: null, setActiveEntity: vi.fn() })
    wrap(<WorkspaceContextBar scenario="Draft" />)
    expect(screen.getByTestId('ctx-scenario')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders reporting view pill when reportingView prop provided', () => {
    vi.mocked(useWorkspace).mockReturnValue({ activeEntity: null, setActiveEntity: vi.fn() })
    wrap(<WorkspaceContextBar reportingView="GAAP" />)
    expect(screen.getByTestId('ctx-reporting-view')).toBeInTheDocument()
    expect(screen.getByText('GAAP')).toBeInTheDocument()
  })

  it('renders all four pills when all props provided', () => {
    vi.mocked(useWorkspace).mockReturnValue({
      activeEntity: { id: 1, code: 'ACME', name: 'Acme Corp' },
      setActiveEntity: vi.fn(),
    })
    wrap(<WorkspaceContextBar period="Q4 2024" scenario="Final" reportingView="GAAP" />)
    expect(screen.getByTestId('ctx-entity')).toBeInTheDocument()
    expect(screen.getByTestId('ctx-period')).toBeInTheDocument()
    expect(screen.getByTestId('ctx-scenario')).toBeInTheDocument()
    expect(screen.getByTestId('ctx-reporting-view')).toBeInTheDocument()
  })
})

// ── WorkspaceFilterBar ──────────────────────────────────────────────────────

describe('WorkspaceFilterBar', () => {
  it('renders children', () => {
    wrap(<WorkspaceFilterBar><input placeholder="search" /></WorkspaceFilterBar>)
    expect(screen.getByTestId('workspace-filter-bar')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('search')).toBeInTheDocument()
  })
})

// ── WorkspaceStatusBadge ────────────────────────────────────────────────────

describe('WorkspaceStatusBadge', () => {
  const cases: Array<[string, string]> = [
    ['draft', 'Draft'],
    ['ready', 'Ready'],
    ['out_of_balance', 'Out of Balance'],
    ['mapped', 'Mapped'],
    ['validated', 'Validated'],
    ['posted', 'Posted'],
    ['needs_review', 'Needs Review'],
    ['finalized', 'Finalized'],
    ['failed', 'Failed'],
    ['pending', 'Pending'],
    ['applied', 'Applied'],
    ['mapping_required', 'Mapping Required'],
  ]

  for (const [status, label] of cases) {
    it(`renders "${label}" for status "${status}"`, () => {
      wrap(<WorkspaceStatusBadge status={status} />)
      expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.getByTestId(`ws-status-${status}`)).toBeInTheDocument()
    })
  }

  it('falls back to raw status string for unknown status', () => {
    wrap(<WorkspaceStatusBadge status="custom_status" />)
    expect(screen.getByText('custom_status')).toBeInTheDocument()
  })
})

// ── WorkspaceToolbar ────────────────────────────────────────────────────────

describe('WorkspaceToolbar', () => {
  it('renders left and right slots', () => {
    wrap(
      <WorkspaceToolbar
        left={<button>Filter</button>}
        right={<button>Export</button>}
      />
    )
    expect(screen.getByTestId('workspace-toolbar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })

  it('renders children in left slot', () => {
    wrap(<WorkspaceToolbar><span>Tool</span></WorkspaceToolbar>)
    expect(screen.getByText('Tool')).toBeInTheDocument()
  })
})

// ── WorkspaceEmptyState ─────────────────────────────────────────────────────

describe('WorkspaceEmptyState', () => {
  it('renders default title and description', () => {
    wrap(<WorkspaceEmptyState />)
    expect(screen.getByTestId('workspace-empty-state')).toBeInTheDocument()
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
    expect(screen.getByText('No items to display.')).toBeInTheDocument()
  })

  it('renders custom title and description', () => {
    wrap(<WorkspaceEmptyState title="No entries" description="Create one to get started" />)
    expect(screen.getByText('No entries')).toBeInTheDocument()
    expect(screen.getByText('Create one to get started')).toBeInTheDocument()
  })

  it('renders action slot when provided', () => {
    wrap(<WorkspaceEmptyState action={<button>Create Entry</button>} />)
    expect(screen.getByRole('button', { name: 'Create Entry' })).toBeInTheDocument()
  })

  it('renders without action slot by default', () => {
    wrap(<WorkspaceEmptyState />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

// ── WorkspaceBody ───────────────────────────────────────────────────────────

describe('WorkspaceBody', () => {
  it('renders children with workspace-body testid', () => {
    wrap(<WorkspaceBody><div>body content</div></WorkspaceBody>)
    expect(screen.getByTestId('workspace-body')).toBeInTheDocument()
    expect(screen.getByText('body content')).toBeInTheDocument()
  })

  it('applies noPadding class when prop set', () => {
    wrap(<WorkspaceBody noPadding><div>content</div></WorkspaceBody>)
    const el = screen.getByTestId('workspace-body')
    expect(el.className).not.toContain('p-6')
  })
})
