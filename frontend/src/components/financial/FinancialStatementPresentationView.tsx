import { useState } from 'react'
import { Printer, Download, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import type { PresentationViewResponse, IncomeStatementSummary, BalanceSheetSummary } from '@/api/financialStatements'
import type { AwvSection } from '@/types'

function fmt(fmtCurrency: (v: number | null | undefined) => string, value: number): string {
  if (Math.abs(value) < 0.005) return '—'
  return fmtCurrency(value)
}

interface LineProps {
  label: string
  value: number
  indent?: number
  bold?: boolean
  underline?: boolean
  hideZero?: boolean
  fmtCurrency: (v: number | null | undefined) => string
}

function StatementLine({ label, value, indent = 0, bold = false, underline = false, hideZero = false, fmtCurrency }: LineProps) {
  if (hideZero && Math.abs(value) < 0.005) return null
  return (
    <div
      className={cn(
        'flex items-end gap-1 py-0.5 text-sm',
        bold && 'font-bold',
        underline && 'border-t border-slate-400',
      )}
      style={{ paddingLeft: `${indent * 16}px` }}
    >
      <span className="flex-1 min-w-0 pr-2 relative">
        {label}
        <span
          className="absolute bottom-0.5 left-0 right-2 border-b border-dotted border-slate-300 -z-10"
          style={{ display: bold ? 'none' : 'block' }}
        />
      </span>
      <span className={cn('tabular-nums shrink-0 w-36 text-right', bold ? 'font-bold' : 'text-slate-700')}>
        {fmt(fmtCurrency, value)}
      </span>
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mt-5 mb-1 text-xs font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200 pb-1">
      {label}
    </div>
  )
}

function Spacer() {
  return <div className="h-2" />
}

interface IncomeStatementProps {
  sections: AwvSection[]
  summary: IncomeStatementSummary
  hideZero: boolean
  fmtCurrency: (v: number | null | undefined) => string
}

function IncomeStatementSection({ sections, summary, hideZero, fmtCurrency }: IncomeStatementProps) {
  const revenueSection = sections.find((s) => s.section === 'revenue' || s.section === 'income')
  const expenseSection = sections.find((s) => s.section === 'expenses' || s.section === 'expense')

  return (
    <div data-testid="fsp-income-statement">
      <SectionHeader label="Income Statement" />

      {/* Revenue */}
      <div className="mb-1 text-xs font-semibold text-slate-600 mt-3">Revenue</div>
      {revenueSection?.taxonomy_lines.map((line) => (
        <StatementLine
          key={line.taxonomy_line_id ?? line.line_name}
          label={line.line_name}
          value={line.awv_display_amount}
          indent={1}
          hideZero={hideZero}
          fmtCurrency={fmtCurrency}
        />
      ))}
      <StatementLine
        label="Total Revenue"
        value={summary.revenue}
        bold
        fmtCurrency={fmtCurrency}
        data-testid="fsp-revenue-total"
      />
      <div data-testid="fsp-revenue-total" className="hidden">{fmt(fmtCurrency, summary.revenue)}</div>

      {/* COGS */}
      {summary.cogs !== 0 && (
        <>
          <Spacer />
          <div className="mb-1 text-xs font-semibold text-slate-600">Cost of Goods Sold</div>
          <StatementLine label="Total COGS" value={summary.cogs} bold fmtCurrency={fmtCurrency} />
        </>
      )}

      {/* Gross Profit */}
      <Spacer />
      <StatementLine label="Gross Profit" value={summary.gross_profit} bold underline fmtCurrency={fmtCurrency} />

      {/* Operating Expenses */}
      <Spacer />
      <div className="mb-1 text-xs font-semibold text-slate-600">Operating Expenses</div>
      {expenseSection?.taxonomy_lines.map((line) => (
        <StatementLine
          key={line.taxonomy_line_id ?? line.line_name}
          label={line.line_name}
          value={line.awv_display_amount}
          indent={1}
          hideZero={hideZero}
          fmtCurrency={fmtCurrency}
        />
      ))}
      <StatementLine label="Total Expenses" value={summary.total_expenses} bold fmtCurrency={fmtCurrency} />

      {/* Operating Income */}
      <Spacer />
      <StatementLine label="Operating Income" value={summary.operating_income} bold underline fmtCurrency={fmtCurrency} />

      {/* Other income/expense */}
      {(summary.other_income !== 0 || summary.other_expenses !== 0) && (
        <>
          <Spacer />
          {summary.other_income !== 0 && (
            <StatementLine label="Other Income" value={summary.other_income} indent={1} fmtCurrency={fmtCurrency} />
          )}
          {summary.other_expenses !== 0 && (
            <StatementLine label="Other Expenses" value={summary.other_expenses} indent={1} fmtCurrency={fmtCurrency} />
          )}
        </>
      )}

      {/* Net Income */}
      <Spacer />
      <div
        className="flex items-end gap-1 py-1 border-t-2 border-slate-700 mt-1"
        data-testid="fsp-net-income"
      >
        <span className="flex-1 font-bold text-sm text-slate-900">Net Income</span>
        <span className={cn(
          'tabular-nums shrink-0 w-36 text-right font-bold text-sm',
          summary.net_income < -0.005 ? 'text-rose-700' : 'text-emerald-700',
        )}>
          {fmt(fmtCurrency, summary.net_income)}
        </span>
      </div>
    </div>
  )
}

interface BalanceSheetProps {
  sections: AwvSection[]
  summary: BalanceSheetSummary
  hideZero: boolean
  fmtCurrency: (v: number | null | undefined) => string
}

function BalanceSheetSection({ sections, summary, hideZero, fmtCurrency }: BalanceSheetProps) {
  const assetSection = sections.find((s) => s.section === 'assets' || s.section === 'asset')
  const liabilitySection = sections.find((s) => s.section === 'liabilities' || s.section === 'liability')
  const equitySection = sections.find((s) => s.section === 'equity')

  return (
    <div data-testid="fsp-balance-sheet">
      <SectionHeader label="Balance Sheet" />

      {/* Assets */}
      <div className="mb-1 text-xs font-semibold text-slate-600 mt-3">Assets</div>
      {assetSection?.taxonomy_lines.map((line) => (
        <StatementLine
          key={line.taxonomy_line_id ?? line.line_name}
          label={line.line_name}
          value={line.awv_display_amount}
          indent={1}
          hideZero={hideZero}
          fmtCurrency={fmtCurrency}
        />
      ))}
      <div data-testid="fsp-total-assets">
        <StatementLine label="Total Assets" value={summary.total_assets} bold underline fmtCurrency={fmtCurrency} />
      </div>

      {/* Liabilities & Equity */}
      <Spacer />
      <div className="mb-1 text-xs font-semibold text-slate-600">Liabilities</div>
      {liabilitySection?.taxonomy_lines.map((line) => (
        <StatementLine
          key={line.taxonomy_line_id ?? line.line_name}
          label={line.line_name}
          value={line.awv_display_amount}
          indent={1}
          hideZero={hideZero}
          fmtCurrency={fmtCurrency}
        />
      ))}
      <StatementLine label="Total Liabilities" value={summary.total_liabilities} bold fmtCurrency={fmtCurrency} />

      <Spacer />
      <div className="mb-1 text-xs font-semibold text-slate-600">Equity</div>
      {equitySection?.taxonomy_lines.map((line) => (
        <StatementLine
          key={line.taxonomy_line_id ?? line.line_name}
          label={line.line_name}
          value={line.awv_display_amount}
          indent={1}
          hideZero={hideZero}
          fmtCurrency={fmtCurrency}
        />
      ))}
      <StatementLine label="Total Equity" value={summary.total_equity} bold fmtCurrency={fmtCurrency} />

      <Spacer />
      <div
        className="flex items-end gap-1 py-1 border-t-2 border-slate-700 mt-1"
        data-testid="fsp-total-liabilities-equity"
      >
        <span className="flex-1 font-bold text-sm text-slate-900">Total Liabilities &amp; Equity</span>
        <span className={cn(
          'tabular-nums shrink-0 w-36 text-right font-bold text-sm',
          summary.balanced ? 'text-slate-900' : 'text-rose-700',
        )}>
          {fmt(fmtCurrency, summary.total_liabilities + summary.total_equity)}
        </span>
      </div>

      {!summary.balanced && (
        <div className="mt-2 flex items-center gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Balance sheet does not balance — Total Assets ≠ Total Liabilities + Equity
        </div>
      )}
    </div>
  )
}

interface Props {
  data: PresentationViewResponse
  isLoading: boolean
}

export function FinancialStatementPresentationView({ data, isLoading }: Props) {
  const fmtCurrency = useFormatCurrency()
  const [hideZero, setHideZero] = useState(true)

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <RefreshCw className="w-5 h-5 text-gray-300 animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-400">Loading financial statements…</p>
      </div>
    )
  }

  if (!data || data.sections.length === 0) {
    return (
      <div className="py-12 text-center">
        <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700 mb-1">No data available</p>
        <p className="text-xs text-gray-500">Import a trial balance and map accounts to taxonomy lines first.</p>
      </div>
    )
  }

  return (
    <div data-testid="fsp-container" className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs text-slate-500">
          Financial Statement View — client-ready presentation with conventional signs (revenue positive, expenses positive)
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideZero}
              onChange={(e) => setHideZero(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Hide zero lines
          </label>
          <button
            data-testid="fsp-print-btn"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white rounded-md hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white rounded-md hover:bg-slate-50 text-slate-600 transition-colors opacity-60 cursor-not-allowed"
            disabled
            title="Export coming soon"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Statement body */}
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm max-w-3xl mx-auto print:shadow-none print:border-none print:max-w-full">
        <IncomeStatementSection
          sections={data.sections}
          summary={data.income_statement}
          hideZero={hideZero}
          fmtCurrency={fmtCurrency}
        />

        <div className="my-8 border-t border-slate-200" />

        <BalanceSheetSection
          sections={data.sections}
          summary={data.balance_sheet}
          hideZero={hideZero}
          fmtCurrency={fmtCurrency}
        />
      </div>
    </div>
  )
}
