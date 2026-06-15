import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'

// Mock deps that hit API or context
vi.mock('@/providers/WorkspaceProvider', () => ({
  useWorkspace: () => ({ activeEntity: { id: 1, name: 'Acme' }, activePeriod: null }),
}))
vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => () => {},
}))
vi.mock('@/api/journalEntries', () => ({
  journalEntriesApi: {
    createDraft: vi.fn(),
    createAndPost: vi.fn(),
  },
}))
vi.mock('@/api/periods', () => ({ periodsApi: { list: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

import { JournalEntryCreatePage } from '@/pages/JournalEntryCreatePage'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <JournalEntryCreatePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('JournalEntryCreatePage — default lines', () => {
  it('renders 6 account picker rows by default', () => {
    renderPage()
    // AccountSearch renders a "Search accounts..." placeholder or similar input
    // Each of the 6 lines has an account search input
    const accountInputs = screen.getAllByPlaceholderText(/search/i)
    expect(accountInputs.length).toBeGreaterThanOrEqual(6)
  })
})
