import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DataTable, type Column } from '@/components/ui/DataTable'

interface Row {
  id: number
  name: string
  status: string
}

const columns: Column<Row>[] = [
  { key: 'id', header: 'ID', render: (r) => r.id },
  { key: 'name', header: 'Name', render: (r) => r.name },
  { key: 'status', header: 'Status', render: (r) => r.status },
]

const data: Row[] = [
  { id: 1, name: 'Alpha', status: 'open' },
  { id: 2, name: 'Beta', status: 'closed' },
]

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable columns={columns} data={data} rowKey={(r) => r.id} />)
    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('renders all rows', () => {
    render(<DataTable columns={columns} data={data} rowKey={(r) => r.id} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('calls onRowClick when a row is clicked', () => {
    const onRowClick = vi.fn()
    render(
      <DataTable columns={columns} data={data} rowKey={(r) => r.id} onRowClick={onRowClick} />,
    )
    fireEvent.click(screen.getByText('Alpha'))
    expect(onRowClick).toHaveBeenCalledWith(data[0])
  })

  it('renders empty table without crashing', () => {
    render(<DataTable columns={columns} data={[]} rowKey={(r) => r.id} />)
    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
  })
})
