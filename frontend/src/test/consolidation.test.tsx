import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConsolidationPage } from '@/pages/ConsolidationPage'

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={['/consolidation']}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

const { mockEntities, mockStatements } = vi.hoisted(() => ({
  mockEntities: [
    { id: 1, name: 'Entity Alpha', entity_type: 'operating', code: 'ALPHA', currency: 'USD', active: true },
    { id: 2, name: 'Entity Beta',  entity_type: 'operating', code: 'BETA',  currency: 'USD', active: true },
    { id: 3, name: 'Elim Co',      entity_type: 'elimination', code: 'ELIM', currency: 'USD', active: true },
  ],
  mockStatements: {
    entity_balances: {
      1: { '10': 5000 },
      2: { '10': 3000, '20': 1500 },
    },
    consolidated: { '10': 8000, '20': 1500 },
    eliminated: {},
  },
}))

vi.mock('@/api/entities', () => ({
  entitiesApi: {
    list: vi.fn(() => Promise.resolve(mockEntities)),
  },
}))

vi.mock('@/api/consolidation', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/api/consolidation')>()
  return {
    ...mod,
    consolidationApi: {
      ...mod.consolidationApi,
      statements: vi.fn(() => Promise.resolve(mockStatements)),
    },
  }
})

describe('ConsolidationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders entity checkboxes after loading', async () => {
    render(wrap(<ConsolidationPage />))
    await waitFor(() => {
      expect(screen.getByText('Entity Alpha')).toBeInTheDocument()
      expect(screen.getByText('Entity Beta')).toBeInTheDocument()
      expect(screen.getByText('Elim Co')).toBeInTheDocument()
    })
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThanOrEqual(3)
  })

  it('build button triggers API call when form is filled', async () => {
    const { consolidationApi } = await import('@/api/consolidation')

    render(wrap(<ConsolidationPage />))

    await waitFor(() => screen.getByText('Entity Alpha'))

    const alphaCheckbox = screen.getAllByRole('checkbox')[0]
    fireEvent.click(alphaCheckbox)

    const [periodInput, viewInput] = screen.getAllByPlaceholderText('e.g. 1')
    fireEvent.change(periodInput, { target: { value: '1' } })
    fireEvent.change(viewInput, { target: { value: '1' } })

    const buildButton = screen.getByRole('button', { name: /Build Consolidated Statements/i })
    fireEvent.click(buildButton)

    await waitFor(() => {
      expect(consolidationApi.statements).toHaveBeenCalledWith(
        expect.objectContaining({ entity_ids: [1], period_id: 1, view_id: 1 }),
      )
    })
  })

  it('results table shows entity columns', async () => {
    render(wrap(<ConsolidationPage />))

    await waitFor(() => screen.getByText('Entity Alpha'))

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])

    const [periodInput, viewInput] = screen.getAllByPlaceholderText('e.g. 1')
    fireEvent.change(periodInput, { target: { value: '1' } })
    fireEvent.change(viewInput, { target: { value: '1' } })

    fireEvent.click(screen.getByRole('button', { name: /Build Consolidated Statements/i }))

    await waitFor(() => {
      const headers = screen.getAllByText('Entity Alpha')
      expect(headers.length).toBeGreaterThan(0)
      expect(screen.getAllByText('Entity Beta').length).toBeGreaterThan(0)
    })
  })

  it('elimination column is rendered with amber styling', async () => {
    render(wrap(<ConsolidationPage />))

    await waitFor(() => screen.getByText('Entity Alpha'))

    fireEvent.click(screen.getAllByRole('checkbox')[0])

    const [periodInput, viewInput] = screen.getAllByPlaceholderText('e.g. 1')
    fireEvent.change(periodInput, { target: { value: '1' } })
    fireEvent.change(viewInput, { target: { value: '1' } })

    fireEvent.click(screen.getByRole('button', { name: /Build Consolidated Statements/i }))

    await waitFor(() => {
      const elimHeader = screen.getByText('Eliminations')
      expect(elimHeader).toBeInTheDocument()
      expect(elimHeader.className).toMatch(/amber/)
    })
  })
})
