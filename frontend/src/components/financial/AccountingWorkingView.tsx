import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown, Plus, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import type { AccountingWorkingViewResponse, AwvTaxonomyRow, AwvAccountRow, AwvSection } from '@/types'

function fmtAccounting(val: number, fmt: (v: number | null | undefined) => string): string {
  if (Math.abs(val) < 0.005) return '—'
  if (val < 0) return `(${fmt(Math.abs(val))})`
  return fmt(val)
}

function AmountCell({ value, className }: { value: number; className?: string }) {
  const fmtCurrency = useFormatCurrency()
  const isNeg = value < -0.005
  const isZero = Math.abs(value) < 0.005
  return (
    <span className={cn(
      'tabular-nums',
      isNeg ? 'text-rose-700' : isZero ? 'text-slate-400' : 'text-slate-900',
      className,
    )}>
      {fmtAccounting(value, fmtCurrency)}
    </span>
  )
}

function JeRows({ jes }: { jes: AwvAccountRow['journal_entries'] }) {
  const fmtCurrency = useFormatCurrency()
  if (jes.length === 0) {
    return (
      <tr>
        <td colSpan={5} className="py-2 pl-16 text-xs text-slate-400 italic">No journal entries</td>
      </tr>
    )
  }
  return (
    <>
      {jes.map((je, i) => (
        <tr key={`${je.je_id}-${i}`} className="border-b border-slate-50 bg-slate-50/30 hover:bg-slate-50/60">
          <td className="py-1.5 pl-16 text-[10px] text-slate-500 font-mono">JE #{je.je_id}</td>
          <td className="py-1.5 pl-2 text-[10px] text-slate-500 max-w-[200px] truncate" colSpan={2}>{je.description || '—'}</td>
          <td className="py-1.5 text-[10px] text-right tabular-nums text-slate-600 pr-2">
            {fmtAccounting(je.amount, fmtCurrency)}
          </td>
          <td />
        </tr>
      ))}
    </>
  )
}

function AccountRow({ row }: { row: AwvAccountRow }) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const hasJes = row.journal_entries.length > 0

  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-amber-50/20 transition-colors group"
        data-testid={`awv-account-row-${row.account_id}`}
      >
        <td className="py-2 pl-12">
          <div className="flex items-center gap-1.5">
            <button
              data-testid={`awv-expand-${row.account_id}`}
              onClick={() => setExpanded((v) => !v)}
              className={cn(
                'p-0.5 rounded hover:bg-slate-200 transition-colors',
                !hasJes && 'opacity-30 cursor-default',
              )}
              disabled={!hasJes}
            >
              {expanded
                ? <ChevronDown className="w-3 h-3 text-slate-500" />
                : <ChevronRight className="w-3 h-3 text-slate-500" />
              }
            </button>
            <span className="font-mono text-xs text-slate-500 shrink-0">{row.account_number}</span>
            <span className="text-xs text-slate-700">{row.account_name}</span>
            <span className="text-[9px] text-slate-400 font-semibold ml-1 uppercase">
              ({row.normal_balance === 'debit' ? 'DR' : 'CR'})
            </span>
          </div>
        </td>
        <td className="py-2 pr-3 text-right text-xs">
          <AmountCell value={row.imported_balance} />
        </td>
        <td className="py-2 pr-3 text-right text-xs">
          {Math.abs(row.posted_adj) > 0.005
            ? <AmountCell value={row.posted_adj} />
            : <span className="text-slate-300">—</span>
          }
        </td>
        <td className="py-2 pr-3 text-right text-xs">
          <AmountCell value={row.awv_display_amount} />
        </td>
        <td className="py-2 pr-3 text-right">
          <button
            data-testid={`awv-create-aje-${row.account_id}`}
            onClick={() => navigate(`/adjustments/new?account_id=${row.account_id}`)}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] font-semibold text-amber-700 border border-amber-200 bg-amber-50 rounded px-1.5 py-0.5 hover:bg-amber-100"
          >
            <Plus className="w-2.5 h-2.5" /> AJE
          </button>
        </td>
      </tr>
      {expanded && <JeRows jes={row.journal_entries} />}
    </>
  )
}

function TaxonomyRow({ row }: { row: AwvTaxonomyRow }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        className={cn(
          'border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors',
          row.is_subtotal && 'bg-slate-50/60 font-semibold border-t border-slate-200',
        )}
        data-testid={`awv-taxonomy-row-${row.taxonomy_line_id ?? 'unmapped'}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2 pl-8">
          <div className="flex items-center gap-1.5">
            <button
              data-testid={`awv-expand-taxonomy-${row.taxonomy_line_id ?? 'unmapped'}`}
              className="p-0.5 rounded hover:bg-slate-200 transition-colors"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
            >
              {expanded
                ? <ChevronDown className="w-3 h-3 text-slate-500" />
                : <ChevronRight className="w-3 h-3 text-slate-500" />
              }
            </button>
            <span className={cn('text-xs text-slate-700', row.is_subtotal && 'font-bold text-slate-900')}>
              {row.line_name}
            </span>
            {row.accounts.length > 0 && (
              <span className="text-[9px] font-semibold text-slate-400">({row.accounts.length})</span>
            )}
          </div>
        </td>
        <td className="py-2 pr-3 text-right text-xs"><AmountCell value={row.imported_balance} /></td>
        <td className="py-2 pr-3 text-right text-xs">
          {Math.abs(row.posted_adj) > 0.005 ? <AmountCell value={row.posted_adj} /> : <span className="text-slate-300">—</span>}
        </td>
        <td className="py-2 pr-3 text-right text-xs font-semibold"><AmountCell value={row.awv_display_amount} /></td>
        <td />
      </tr>
      {expanded && row.accounts.map((acc) => (
        <AccountRow key={acc.account_id} row={acc} />
      ))}
    </>
  )
}

function SectionBlock({ section }: { section: AwvSection }) {
  const [collapsed, setCollapsed] = useState(false)

  const sectionTotal = section.taxonomy_lines.reduce((s, r) => s + r.awv_display_amount, 0)

  return (
    <div data-testid={`awv-section-${section.section}`} className="mb-2">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-100/80 border-b border-slate-200 text-left hover:bg-slate-100 transition-colors"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
          <span className="text-xs font-bold uppercase tracking-widest text-slate-700">{section.label}</span>
        </div>
        <span className="text-xs font-bold tabular-nums text-slate-800">
          {section.label}
        </span>
      </button>
      {!collapsed && (
        <table className="w-full">
          <tbody>
            {section.taxonomy_lines.map((row) => (
              <TaxonomyRow key={row.taxonomy_line_id ?? `unmapped-${row.line_name}`} row={row} />
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td className="py-2 pl-4 text-xs font-bold text-slate-900">Total {section.label}</td>
              <td className="py-2 pr-3 text-right text-xs font-bold">
                <AmountCell value={section.taxonomy_lines.reduce((s, r) => s + r.imported_balance, 0)} />
              </td>
              <td className="py-2 pr-3 text-right text-xs font-bold">
                <AmountCell value={section.taxonomy_lines.reduce((s, r) => s + r.posted_adj, 0)} />
              </td>
              <td className="py-2 pr-3 text-right text-xs font-bold">
                <AmountCell value={sectionTotal} />
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}

interface Props {
  data: AccountingWorkingViewResponse
  isLoading: boolean
}

export function AccountingWorkingView({ data, isLoading }: Props) {
  const fmtCurrency = useFormatCurrency()

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <RefreshCw className="w-5 h-5 text-gray-300 animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-400">Loading accounting view…</p>
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
    <div data-testid="awv-container" className="space-y-0">
      <div className="mb-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
        <span className="font-semibold">Accounting View</span> — debit-normal signs. Revenue appears negative (credit balance). Switch to <span className="font-semibold">Financial Statement View</span> for client-ready presentation.
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 pl-4 text-left">Line Item / Account</th>
                <th className="py-2.5 pr-3 text-right w-36">Imported Balance</th>
                <th className="py-2.5 pr-3 text-right w-32">Posted Adj.</th>
                <th className="py-2.5 pr-3 text-right w-36">AWV Balance</th>
                <th className="py-2.5 pr-3 text-right w-24">Actions</th>
              </tr>
            </thead>
          </table>
        </div>

        {data.sections.map((sec) => (
          <SectionBlock key={sec.section} section={sec} />
        ))}

        <div className="border-t-2 border-slate-400 px-4 py-3 flex items-center justify-between bg-slate-50">
          <span className="text-sm font-bold text-slate-900">Net Income</span>
          <span className={cn(
            'text-sm font-bold tabular-nums',
            data.net_income < 0 ? 'text-rose-700' : 'text-emerald-700',
          )}>
            {fmtAccounting(data.net_income, fmtCurrency)}
          </span>
        </div>
      </div>
    </div>
  )
}
