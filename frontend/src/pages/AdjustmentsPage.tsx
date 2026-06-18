import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ChevronDown, ChevronRight, Search, X, ArrowUpDown } from 'lucide-react'
import { adjustmentWorkspaceApi, type AdjustmentListItem } from '@/api/adjustmentWorkspace'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { cn } from '@/utils/cn'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type JETab = 'all' | 'draft' | 'posted' | 'reversed'

const TABS: { value: JETab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'reversed', label: 'Reversed' },
]

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800',
  posted: 'bg-emerald-100 text-emerald-800',
  reversed: 'bg-gray-100 text-gray-600',
  voided: 'bg-red-100 text-red-700',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', cls)}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function JELinesRows({
  lines,
  fmt,
  colSpan,
}: {
  lines: NonNullable<AdjustmentListItem['lines']>
  fmt: (v: number | null | undefined) => string
  colSpan: number
}) {
  return (
    <>
      {lines.map((ln) => {
        const net = ln.debit - ln.credit
        return (
          <tr key={ln.line_number} className="bg-slate-50 border-t border-slate-100 hover:bg-indigo-50/30">
            <td className="w-8" />
            <td className="w-5" />
            <td className="px-3 py-1 font-mono text-[10px] text-slate-500">{ln.account_number}</td>
            <td className="px-3 py-1 text-[10px] text-slate-700 max-w-[220px] truncate">{ln.account_name}</td>
            <td className="px-3 py-1 text-right font-mono text-[10px] text-slate-700">
              {ln.debit > 0 ? fmt(ln.debit) : <span className="text-slate-300">—</span>}
            </td>
            <td className="px-3 py-1 text-right font-mono text-[10px] text-slate-700">
              {ln.credit > 0 ? fmt(ln.credit) : <span className="text-slate-300">—</span>}
            </td>
            <td className="px-3 py-1 text-right font-mono text-[10px] font-semibold">
              {net !== 0 ? (
                <span className={net > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {net > 0 ? '+' : ''}{fmt(net)}
                </span>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </td>
            <td colSpan={colSpan - 7} className="px-3 py-1 text-[10px] text-slate-400 italic">
              {ln.description ?? ''}
            </td>
          </tr>
        )
      })}
      {/* Totals row */}
      <tr className="bg-slate-100 border-t border-slate-200">
        <td className="w-8" />
        <td className="w-5" />
        <td colSpan={2} className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
          Totals
        </td>
        <td className="px-3 py-1 text-right font-mono text-[10px] font-semibold text-slate-700">
          {fmt(lines.reduce((s, l) => s + l.debit, 0))}
        </td>
        <td className="px-3 py-1 text-right font-mono text-[10px] font-semibold text-slate-700">
          {fmt(lines.reduce((s, l) => s + l.credit, 0))}
        </td>
        <td colSpan={colSpan - 6} />
      </tr>
    </>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdjustmentsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { activeEntity } = useWorkspace()
  const fmt = useFormatCurrency()

  const [tab, setTab] = useState<JETab>('all')
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [sortKey, setSortKey] = useState<string>('entry_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const filters = useMemo(() => ({
    status: tab === 'all' ? undefined : tab,
    search: search || undefined,
    include_lines: true,
    limit: 300,
  }), [tab, search])

  const { data: items, isLoading, isError, error } = useQuery({
    queryKey: ['adjustments-jes', activeEntity?.id, filters],
    queryFn: () => adjustmentWorkspaceApi.listAdjustments({
      ...filters,
      entity_id: activeEntity?.id,
    }),
    enabled: !!activeEntity,
    staleTime: 15_000,
  })

  if (!activeEntity) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-sm text-gray-500">Select an entity in the context bar above.</p>
      </div>
    )
  }

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSort(key: string) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sortedItems = useMemo(() => {
    if (!items) return []
    return [...items].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      if (sortKey === 'je_number') { av = a.je_number; bv = b.je_number }
      else if (sortKey === 'entry_date') { av = a.entry_date; bv = b.entry_date }
      else if (sortKey === 'description') { av = a.description ?? ''; bv = b.description ?? '' }
      else if (sortKey === 'status') { av = a.status; bv = b.status }
      else if (sortKey === 'total_debit') { av = a.total_debit; bv = b.total_debit }
      else if (sortKey === 'total_credit') { av = a.total_credit; bv = b.total_credit }
      else if (sortKey === 'ni_impact') { av = a.impact.ni_impact; bv = b.impact.ni_impact }
      const cmp = typeof av === 'number'
        ? (av as number) - (bv as number)
        : String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [items, sortKey, sortDir])

  function SortTh({ col, label, right }: { col: string; label: string; right?: boolean }) {
    const active = sortKey === col
    return (
      <th
        className={cn(
          'px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:bg-slate-100 transition-colors',
          right && 'text-right',
        )}
        onClick={() => handleSort(col)}
      >
        <span className={cn('flex items-center gap-1', right && 'justify-end')}>
          {label}
          <ArrowUpDown className={cn('w-3 h-3 shrink-0', active ? 'text-indigo-500' : 'text-slate-300')} />
        </span>
      </th>
    )
  }

  const TOTAL_COLS = 10

  return (
    <div className="flex flex-col h-full" data-testid="adjustments-page">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-sm font-semibold text-gray-800">Adjustments</h1>
        <button
          type="button"
          onClick={() => navigate('/adjustments/journal-entries/new')}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          data-testid="new-aje-btn"
        >
          <Plus className="h-3.5 w-3.5" /> New AJE
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pt-2 border-b border-gray-100 bg-white">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
              tab === value ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
            data-testid={`tab-${value}`}
          >
            {label}
          </button>
        ))}

        {/* Search */}
        <div className="ml-auto relative mb-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-6 pr-6 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 w-40"
            data-testid="adj-search"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading && <LoadingState />}
        {isError && <ErrorState message={(error as Error).message} />}

        {!isLoading && !isError && (
          <table className="w-full text-xs" data-testid="adjustments-table">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="w-5 px-1 py-2" />
                <SortTh col="je_number" label="JE #" />
                <SortTh col="entry_date" label="Date" />
                <SortTh col="description" label="Description" />
                <SortTh col="status" label="Status" />
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Account #</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Account Name</th>
                <SortTh col="total_debit" label="Debit" right />
                <SortTh col="total_credit" label="Credit" right />
                <SortTh col="ni_impact" label="NI Impact" right />
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedItems.length === 0 && (
                <tr>
                  <td colSpan={TOTAL_COLS + 3} className="px-4 py-10 text-center text-slate-400 text-xs">
                    No adjustments found.
                  </td>
                </tr>
              )}

              {sortedItems.map((item) => {
                const expanded = expandedIds.has(item.id)
                const hasLines = item.lines && item.lines.length > 0
                const firstLine = item.lines?.[0]
                const remainingLines = item.lines?.slice(1) ?? []

                return (
                  <>
                    {/* Summary row */}
                    <tr
                      key={item.id}
                      data-testid={`adj-row-${item.id}`}
                      className={cn(
                        'hover:bg-slate-50 transition-colors',
                        expanded && 'bg-indigo-50/40',
                      )}
                    >
                      {/* Expand toggle */}
                      <td className="px-3 py-2">
                        {hasLines && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(item.id)}
                            className="text-slate-400 hover:text-slate-600 p-0.5"
                            aria-label={expanded ? 'Collapse lines' : 'Expand lines'}
                          >
                            {expanded
                              ? <ChevronDown className="w-3.5 h-3.5" />
                              : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </td>
                      <td className="w-5" />

                      {/* JE-level columns */}
                      <td className="px-3 py-2 font-mono text-slate-700">{item.je_number}</td>
                      <td className="px-3 py-2 text-slate-500">{item.entry_date}</td>
                      <td className="px-3 py-2 text-slate-800 max-w-[200px] truncate">{item.description}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={item.status} />
                      </td>

                      {/* First line's account fields inline */}
                      <td className="px-3 py-2 font-mono text-slate-500 text-[10px]">
                        {firstLine?.account_number ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-700 max-w-[180px] truncate text-[10px]">
                        {firstLine?.account_name ?? '—'}
                        {remainingLines.length > 0 && (
                          <span className="ml-1 text-slate-400 text-[9px]">+{remainingLines.length} more</span>
                        )}
                      </td>

                      {/* Totals */}
                      <td className="px-3 py-2 text-right font-mono text-slate-700" data-testid="total-debit">
                        {fmt(item.total_debit)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700" data-testid="total-credit">
                        {fmt(item.total_credit)}
                      </td>

                      {/* NI Impact */}
                      <td className="px-3 py-2 text-right">
                        {item.impact.ni_impact !== 0 ? (
                          <span className={cn('font-semibold', item.impact.ni_impact > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                            {item.impact.ni_impact > 0 ? '+' : ''}{fmt(Math.abs(item.impact.ni_impact))}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2 text-slate-400 text-[10px]">{item.source}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/adjustments/journal-entries/${item.id}`)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                          data-testid={`edit-btn-${item.id}`}
                        >
                          View
                        </button>
                      </td>
                    </tr>

                    {/* Expanded JE lines */}
                    {expanded && hasLines && (
                      <JELinesRows
                        key={`lines-${item.id}`}
                        lines={item.lines!}
                        fmt={fmt}
                        colSpan={TOTAL_COLS + 3}
                      />
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
