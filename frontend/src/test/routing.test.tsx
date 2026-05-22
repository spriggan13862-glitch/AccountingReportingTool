import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect } from 'vitest'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { DocumentsPage } from '@/pages/DocumentsPage'

function wrap(element: React.ReactNode, path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Routing', () => {
  it('renders PlaceholderPage with correct title', () => {
    render(wrap(<PlaceholderPage title="Trial Balances" />))
    expect(screen.getByText('Trial Balances')).toBeInTheDocument()
  })

  it('renders DocumentsPage', () => {
    render(wrap(<DocumentsPage />))
    expect(screen.getByText('Document Registry')).toBeInTheDocument()
  })

  it('placeholder shows coming soon text', () => {
    render(wrap(<PlaceholderPage title="Consolidations" />))
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })
})
