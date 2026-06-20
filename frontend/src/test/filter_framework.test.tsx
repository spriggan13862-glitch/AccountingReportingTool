import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FilterBar } from '@/components/data-grid/FilterBar'
import { ColumnFilterMenu } from '@/components/data-grid/ColumnFilterMenu'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Filter Framework', () => {
  it('FilterBar renders all filter inputs', () => {
    render(
      wrap(
        <FilterBar
          data-testid="test-filter-bar"
          activeCount={0}
          onClearAll={vi.fn()}
          filters={[
            { key: 'f-text', label: 'Name', type: 'text', value: '', onChange: vi.fn() },
            { key: 'f-checklist', label: 'Type', type: 'checklist', value: [], onChange: vi.fn(), options: ['a', 'b'] },
            { key: 'f-range', label: 'Amount', type: 'numeric-range', value: {}, onChange: vi.fn() },
          ]}
        />
      )
    )
    expect(screen.getByTestId('test-filter-bar')).toBeTruthy()
    expect(screen.getByTestId('f-text')).toBeTruthy()
    expect(screen.getByTestId('f-checklist')).toBeTruthy()
    expect(screen.getByTestId('f-range-min')).toBeTruthy()
    expect(screen.getByTestId('f-range-max')).toBeTruthy()
  })

  it('FilterBar shows active filter count when filters are active', () => {
    render(
      wrap(
        <FilterBar
          data-testid="count-filter-bar"
          activeCount={3}
          onClearAll={vi.fn()}
          filters={[
            { key: 'f1', label: 'Name', type: 'text', value: 'cash', onChange: vi.fn() },
          ]}
        />
      )
    )
    expect(screen.getByTestId('filter-active-count').textContent).toContain('3')
  })

  it('FilterBar clear all resets filters', () => {
    const onClearAll = vi.fn()
    render(
      wrap(
        <FilterBar
          data-testid="clear-filter-bar"
          activeCount={2}
          onClearAll={onClearAll}
          filters={[
            { key: 'f1', label: 'Name', type: 'text', value: 'cash', onChange: vi.fn() },
          ]}
        />
      )
    )
    fireEvent.click(screen.getByTestId('filter-clear-all'))
    expect(onClearAll).toHaveBeenCalledTimes(1)
  })

  it('FilterBar does not show clear all when no active filters', () => {
    render(
      wrap(
        <FilterBar
          data-testid="no-active-bar"
          activeCount={0}
          onClearAll={vi.fn()}
          filters={[
            { key: 'f1', label: 'Name', type: 'text', value: '', onChange: vi.fn() },
          ]}
        />
      )
    )
    expect(screen.queryByTestId('filter-clear-all')).toBeNull()
    expect(screen.queryByTestId('filter-active-count')).toBeNull()
  })

  it('checklist filter renders checkboxes on click', async () => {
    render(
      wrap(
        <FilterBar
          data-testid="checklist-bar"
          activeCount={0}
          onClearAll={vi.fn()}
          filters={[
            {
              key: 'coa-filter-account-type',
              label: 'Account Type',
              type: 'checklist',
              value: [],
              onChange: vi.fn(),
              options: ['asset', 'liability', 'equity'],
            },
          ]}
        />
      )
    )
    fireEvent.click(screen.getByTestId('coa-filter-account-type'))
    expect(screen.getByText('asset')).toBeTruthy()
    expect(screen.getByText('liability')).toBeTruthy()
    expect(screen.getByText('equity')).toBeTruthy()
  })

  it('ColumnFilterMenu checklist mode renders checkboxes', () => {
    const onChange = vi.fn()
    render(
      wrap(
        <ColumnFilterMenu
          columnKey="type"
          header="Type"
          sortable={false}
          filterType="checklist"
          checklistValues={['draft', 'posted']}
          checklistSelected={['draft']}
          sortDir={null}
          filterValue=""
          filterMode="contains"
          filterMin=""
          filterMax=""
          isActive={true}
          onSort={vi.fn()}
          onFilterChange={vi.fn()}
          onModeChange={vi.fn()}
          onMinChange={vi.fn()}
          onMaxChange={vi.fn()}
          onChecklistChange={onChange}
          onClear={vi.fn()}
        />
      )
    )
    fireEvent.click(screen.getByTestId('col-filter-btn-type'))
    expect(screen.getByTestId('checklist-item-type-draft')).toBeTruthy()
    expect(screen.getByTestId('checklist-item-type-posted')).toBeTruthy()
  })

  it('COA filter bar renders with correct data-testid', () => {
    // Just verify FilterBar can be used with the COA-specific testids
    const { container } = render(
      wrap(
        <FilterBar
          data-testid="coa-filter-bar"
          activeCount={0}
          onClearAll={vi.fn()}
          filters={[
            { key: 'coa-filter-account-number', label: 'Acct #', type: 'text', value: '', onChange: vi.fn() },
            { key: 'coa-filter-account-name', label: 'Account Name', type: 'text', value: '', onChange: vi.fn() },
          ]}
        />
      )
    )
    expect(container.querySelector('[data-testid="coa-filter-bar"]')).toBeTruthy()
    expect(screen.getByTestId('coa-filter-account-number')).toBeTruthy()
    expect(screen.getByTestId('coa-filter-account-name')).toBeTruthy()
  })

  it('Adjustment filter bar renders with correct data-testid', () => {
    render(
      wrap(
        <FilterBar
          data-testid="adj-filter-bar"
          clearButtonTestId="adj-filter-clear"
          activeCount={1}
          onClearAll={vi.fn()}
          filters={[
            { key: 'adj-filter-description', label: 'Description', type: 'text', value: 'audit', onChange: vi.fn() },
            { key: 'adj-filter-status', label: 'Status', type: 'checklist', value: [], onChange: vi.fn(), options: ['draft', 'posted'] },
            { key: 'adj-filter-ni-impact', label: 'NI Impact', type: 'numeric-range', value: {}, onChange: vi.fn() },
          ]}
        />
      )
    )
    expect(screen.getByTestId('adj-filter-bar')).toBeTruthy()
    expect(screen.getByTestId('adj-filter-description')).toBeTruthy()
    expect(screen.getByTestId('adj-filter-ni-impact-min')).toBeTruthy()
    expect(screen.getByTestId('adj-filter-ni-impact-max')).toBeTruthy()
    expect(screen.getByTestId('adj-filter-clear')).toBeTruthy()
  })
})
