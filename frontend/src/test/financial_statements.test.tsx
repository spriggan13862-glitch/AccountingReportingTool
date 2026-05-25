import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { VarianceIndicator } from '@/components/reports/VarianceIndicator'
import { StatementViewer } from '@/components/reports/StatementViewer'
import { DrilldownPanel } from '@/components/reports/DrilldownPanel'
import { ReportParameterModal } from '@/components/reports/ReportParameterModal'
import { TaxonomyTable } from '@/pages/FinancialStatementsPage'
import type { Variance, ReportLineDrilldown } from '@/types'

// ---- fixtures ----------------------------------------------------------------

const positiveVariance: Variance = { amount: '5000', percentage: '12.5' }
const negativeVariance: Variance = { amount: '-3000', percentage: '-8.2' }
const zeroVariance: Variance = { amount: '0', percentage: '0' }

const fsLines = [
  { code: 'CASH', name: 'Cash and Equivalents', display_balance: '100000', is_subtotal: false },
  { code: 'AR', name: 'Accounts Receivable', display_balance: '50000', is_subtotal: false },
  { code: 'TOTAL_ASSETS', name: 'Total Assets', display_balance: '150000', is_subtotal: true },
]

const drilldownData: ReportLineDrilldown = {
  fs_line_code: 'CASH',
  fs_line_name: 'Cash and Equivalents',
  total_balance: '100000',
  accounts: [
    {
      account_id: 1,
      account_number: '1000',
      account_name: 'Operating Checking',
      net_debit: '100000',
      signed_balance: '100000',
      journal_entries: [
        {
          je_id: 10,
          je_number: 'JE-0001',
          entry_date: '2024-03-15',
          description: 'March deposit',
          net_debit: '100000',
        },
      ],
    },
  ],
}

// ---- tests ------------------------------------------------------------------

describe('Milestone 20: Financial Statement Engine', () => {
  it('VarianceIndicator renders positive variance with green color and up arrow', () => {
    render(<VarianceIndicator variance={positiveVariance} />)
    const el = screen.getByText(/▲/)
    expect(el).toBeInTheDocument()
    expect(el.className).toContain('text-green-600')
    expect(screen.getByText(/12\.5%/)).toBeInTheDocument()
  })

  it('VarianceIndicator renders negative variance with red color and down arrow', () => {
    render(<VarianceIndicator variance={negativeVariance} />)
    const el = screen.getByText(/▼/)
    expect(el).toBeInTheDocument()
    expect(el.className).toContain('text-red-600')
    expect(screen.getByText(/8\.2%/)).toBeInTheDocument()
  })

  it('VarianceIndicator renders zero variance with neutral dash', () => {
    render(<VarianceIndicator variance={zeroVariance} />)
    const el = screen.getByText(/—/)
    expect(el).toBeInTheDocument()
    expect(el.className).toContain('text-gray-500')
  })

  it('StatementViewer renders line labels and title', () => {
    render(<StatementViewer lines={fsLines} title="Balance Sheet" />)
    expect(screen.getByText('Balance Sheet')).toBeInTheDocument()
    expect(screen.getByText('Cash and Equivalents')).toBeInTheDocument()
    expect(screen.getByText('Accounts Receivable')).toBeInTheDocument()
    expect(screen.getByText('Total Assets')).toBeInTheDocument()
  })

  it('StatementViewer calls onLineClick when row is clicked', () => {
    const onLineClick = vi.fn()
    render(<StatementViewer lines={fsLines} title="Balance Sheet" onLineClick={onLineClick} />)
    fireEvent.click(screen.getByText('Cash and Equivalents'))
    expect(onLineClick).toHaveBeenCalledWith('CASH')
  })

  it('DrilldownPanel renders null when drilldown is null', () => {
    const { container } = render(<DrilldownPanel drilldown={null} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('DrilldownPanel renders account and journal entry data', () => {
    render(<DrilldownPanel drilldown={drilldownData} onClose={vi.fn()} />)
    expect(screen.getByText('Cash and Equivalents')).toBeInTheDocument()
    expect(screen.getByText('CASH')).toBeInTheDocument()
    expect(screen.getByText(/1000 — Operating Checking/)).toBeInTheDocument()
    expect(screen.getByText('JE-0001')).toBeInTheDocument()
    expect(screen.getByText('2024-03-15')).toBeInTheDocument()
  })

  it('ReportParameterModal submits with correct values', () => {
    const onSubmit = vi.fn()
    render(<ReportParameterModal onSubmit={onSubmit} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Entity ID/i), { target: { value: '42' } })
    fireEvent.change(screen.getByLabelText(/Scenario IDs/i), { target: { value: '1,2' } })

    const select = screen.getByLabelText(/Statement/i)
    fireEvent.change(select, { target: { value: 'CF' } })

    fireEvent.click(screen.getByRole('button', { name: /Run Report/i }))

    expect(onSubmit).toHaveBeenCalledOnce()
    const submitted = onSubmit.mock.calls[0][0]
    expect(submitted.entityId).toBe('42')
    expect(submitted.scenarioIds).toBe('1,2')
    expect(submitted.statement).toBe('CF')
  })

  it('TaxonomyTable renders rows and triggers onDrilldown for rows with accounts', () => {
    const onDrilldown = vi.fn()
    const rows = [
      {
        taxonomy_id: 1,
        code: '1.1',
        name: 'Cash',
        display_balance: '1000',
        hierarchy_depth: 1,
        is_subtotal: false,
        account_count: 2,
      },
      {
        taxonomy_id: 2,
        code: '1.2',
        name: 'AR',
        display_balance: '2000',
        hierarchy_depth: 1,
        is_subtotal: false,
        account_count: 0,
      },
    ]

    render(<TaxonomyTable rows={rows} isLoading={false} entityId={1} onDrilldown={onDrilldown} />)

    // Click Cash (account_count > 0, not header, not subtotal)
    fireEvent.click(screen.getByText(/Cash/))
    expect(onDrilldown).toHaveBeenCalledWith('1.1')

    // Click AR (account_count === 0)
    onDrilldown.mockClear()
    fireEvent.click(screen.getByText(/AR/))
    expect(onDrilldown).toHaveBeenCalledWith('1.2')
  })

  it('DrilldownPanel renders empty state when accounts is empty', () => {
    const emptyDrilldown: ReportLineDrilldown = {
      fs_line_code: 'EMPTY',
      fs_line_name: 'Empty Line',
      total_balance: '0',
      accounts: [],
    }
    render(<DrilldownPanel drilldown={emptyDrilldown} onClose={vi.fn()} />)
    expect(screen.getByTestId('drilldown-empty-state')).toBeInTheDocument()
    expect(screen.getByText('No accounts mapped to this reporting line.')).toBeInTheDocument()
  })

  it('DrilldownPanel renders breadcrumbs when taxonomyLines are provided', () => {
    const taxonomyLines = [
      { id: 10, code: 'ROOT', name: 'Assets', parent_id: null, section: 'asset', statement_type: 'balance_sheet', sort_order: 1, hierarchy_depth: 0, is_subtotal: false, normal_balance: 'debit', sign_behavior: 'positive', active: true, editable: false, system_defined: true, sec_xbrl_tag: null },
      { id: 11, code: 'CHILD', name: 'Current Assets', parent_id: 10, section: 'asset', statement_type: 'balance_sheet', sort_order: 2, hierarchy_depth: 1, is_subtotal: false, normal_balance: 'debit', sign_behavior: 'positive', active: true, editable: false, system_defined: true, sec_xbrl_tag: null },
      { id: 12, code: 'CASH', name: 'Cash and Equivalents', parent_id: 11, section: 'asset', statement_type: 'balance_sheet', sort_order: 3, hierarchy_depth: 2, is_subtotal: false, normal_balance: 'debit', sign_behavior: 'positive', active: true, editable: false, system_defined: true, sec_xbrl_tag: null },
    ]
    render(
      <DrilldownPanel
        drilldown={drilldownData}
        onClose={vi.fn()}
        taxonomyLines={taxonomyLines}
      />
    )
    expect(screen.getByText('Hierarchy Path')).toBeInTheDocument()
    expect(screen.getByText('Assets > Current Assets > Cash and Equivalents')).toBeInTheDocument()
  })

  it('DrilldownPanel renders source import and document links when present', () => {
    const richDrilldown: ReportLineDrilldown = {
      fs_line_code: 'CASH',
      fs_line_name: 'Cash and Equivalents',
      total_balance: '100000',
      accounts: [
        {
          account_id: 1,
          account_number: '1000',
          account_name: 'Operating Checking',
          net_debit: '100000',
          signed_balance: '100000',
          journal_entries: [
            {
              je_id: 10,
              je_number: 'JE-0001',
              entry_date: '2024-03-15',
              debit: '100000',
              credit: '0',
              description: 'March deposit',
              source_import_filename: 'tb_march.csv',
              document_id: 55,
              document_name: 'bank_statement.pdf',
            },
          ],
        },
      ],
    }
    render(<DrilldownPanel drilldown={richDrilldown} onClose={vi.fn()} />)
    expect(screen.getByText('tb_march.csv')).toBeInTheDocument()
    expect(screen.getByText('bank_statement.pdf')).toBeInTheDocument()
  })
})
