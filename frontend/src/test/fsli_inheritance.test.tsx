import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FsliEffectiveMapping } from '@/types'

// ---------------------------------------------------------------------------
// Minimal stubs — we test the rendering logic in isolation
// ---------------------------------------------------------------------------

const makeMapping = (
  overrides: Partial<FsliEffectiveMapping> = {},
): FsliEffectiveMapping => ({
  account_id: 1,
  account_number: '1000',
  account_name: 'Cash',
  taxonomy_line_id: 10,
  taxonomy_line_name: 'Cash & Equivalents',
  mapping_source: 'explicit',
  inherited_from_account_id: null,
  inherited_from_account_number: null,
  ...overrides,
})

// ---------------------------------------------------------------------------
// InheritedFrom cell component — isolated rendering test
// ---------------------------------------------------------------------------

interface InheritedFromCellProps {
  mapping: FsliEffectiveMapping | undefined
}

function InheritedFromCell({ mapping }: InheritedFromCellProps) {
  if (!mapping) return <span>—</span>
  const { mapping_source, inherited_from_account_number } = mapping
  if (mapping_source === 'explicit') {
    return (
      <span data-testid="badge-explicit">Explicit</span>
    )
  }
  if (mapping_source === 'parent' || mapping_source === 'grandparent') {
    return (
      <span data-testid="badge-inherited">↑ {inherited_from_account_number}</span>
    )
  }
  if (mapping_source === 'legacy') {
    return <span data-testid="badge-legacy">Legacy</span>
  }
  return <span data-testid="badge-unmapped">— Unmapped</span>
}

// ---------------------------------------------------------------------------
// FSLI select cell — shows inherited styling
// ---------------------------------------------------------------------------

interface FsliSelectCellProps {
  mapping: FsliEffectiveMapping | undefined
  currentValue: number | null
  onChange: (val: number | null) => void
}

function FsliSelectCell({ mapping, currentValue, onChange }: FsliSelectCellProps) {
  const isInherited =
    mapping &&
    (mapping.mapping_source === 'parent' || mapping.mapping_source === 'grandparent')

  return (
    <div>
      <select
        data-testid="fsli-select"
        value={currentValue ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className={isInherited ? 'inherited' : 'explicit'}
      >
        <option value="">— Select FSLI —</option>
        <option value="10">Cash & Equivalents</option>
        <option value="20">Accounts Receivable</option>
      </select>
      {isInherited && <span data-testid="inherited-label">inherited</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FSLI Inheritance', () => {
  it('shows Explicit badge when account has own mapping', () => {
    const mapping = makeMapping({ mapping_source: 'explicit' })
    render(<InheritedFromCell mapping={mapping} />)
    expect(screen.getByTestId('badge-explicit')).toHaveTextContent('Explicit')
  })

  it('shows parent account info when source is parent', () => {
    const mapping = makeMapping({
      mapping_source: 'parent',
      inherited_from_account_id: 5,
      inherited_from_account_number: '1000',
    })
    render(<InheritedFromCell mapping={mapping} />)
    const badge = screen.getByTestId('badge-inherited')
    expect(badge).toHaveTextContent('↑ 1000')
  })

  it('shows grandparent account info when source is grandparent', () => {
    const mapping = makeMapping({
      mapping_source: 'grandparent',
      inherited_from_account_id: 3,
      inherited_from_account_number: '1000',
    })
    render(<InheritedFromCell mapping={mapping} />)
    const badge = screen.getByTestId('badge-inherited')
    expect(badge).toHaveTextContent('↑ 1000')
  })

  it('shows unmapped label when no mapping exists', () => {
    const mapping = makeMapping({
      mapping_source: 'none',
      taxonomy_line_id: null,
      taxonomy_line_name: null,
    })
    render(<InheritedFromCell mapping={mapping} />)
    expect(screen.getByTestId('badge-unmapped')).toHaveTextContent('— Unmapped')
  })

  it('shows legacy badge when mapping comes from account field', () => {
    const mapping = makeMapping({ mapping_source: 'legacy' })
    render(<InheritedFromCell mapping={mapping} />)
    expect(screen.getByTestId('badge-legacy')).toHaveTextContent('Legacy')
  })

  it('applies inherited class and label when mapping is inherited', () => {
    const mapping = makeMapping({
      mapping_source: 'parent',
      inherited_from_account_number: '1000',
    })
    const onChange = vi.fn()
    render(<FsliSelectCell mapping={mapping} currentValue={10} onChange={onChange} />)
    const select = screen.getByTestId('fsli-select')
    expect(select).toHaveClass('inherited')
    expect(screen.getByTestId('inherited-label')).toBeInTheDocument()
  })

  it('does not show inherited label for explicit mapping', () => {
    const mapping = makeMapping({ mapping_source: 'explicit' })
    const onChange = vi.fn()
    render(<FsliSelectCell mapping={mapping} currentValue={10} onChange={onChange} />)
    expect(screen.queryByTestId('inherited-label')).not.toBeInTheDocument()
  })

  it('renders dash when no mapping provided', () => {
    render(<InheritedFromCell mapping={undefined} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
