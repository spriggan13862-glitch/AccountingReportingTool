import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart2, TrendingUp, TrendingDown, Minus,
  RefreshCw, AlertTriangle, X, ChevronRight,
  Scale, DollarSign, Building2, GitCompare, Activity,
  Search, Download,
} from 'lucide-react'

import { reportingApi } from '@/api/reporting'
import { financialStatementsApi } from '@/api/financialStatements'
import { overlayApi } from '@/api/overlay'
import { periodGovernanceApi } from '@/api/periodGovernance'
import { adjustmentWorkspaceApi } from '@/api/adjustmentWorkspace'
import { reportingViewsApi } from '@/api/reportingViews'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { ScenarioSelect } from '@/components/ui/ScenarioSelect'
import { PeriodSelect } from '@/components/ui/PeriodSelect'
import { DrilldownPanel } from '@/components/reports/DrilldownPanel'
import { TaxonomyTable } from '@/pages/FinancialStatementsPage'
import { useOrg } from '@/providers/OrgProvider'
import { cn } from '@/utils/cn'
import type { TBRow, TaxonomyFsLine, ComparativeReport, ComparativeLine } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ScenarioMode = 'as_reported' | 'draft_adjusted' | 'posted_adjusted' | 'pro_forma'

const SCENARIO_MODE_OPTIONS: { value: ScenarioMode; label: string; description: string }[] = [
  { value: 'as_reported', label: 'As Reported', description: 'Book values only — no adjustments applied' },
  { value: 'draft_adjusted', label: 'Draft Adjusted', description: 'Book + all draft adjustments' },
  { value: 'posted_adjusted', label: 'Posted Adjusted', description: 'Book + posted adjustments only' },
  { value: 'pro_forma', label: 'Pro Forma', description: 'All scenarios including eliminations and pro forma' },
]

function fmt(val: string | number | null | undefined): string {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0)
  if (isNaN(n) || n === 0) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtK(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '(' : ''
  const end = n < 0 ? ')' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M${end}`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K${end}`
  return `${sign}$${abs.toFixed(0)}${end}`
}

function varianceClass(v: number): string {
  if (v > 0) return 'text-emerald-600'
  if (v < 0) return 'text-rose-600'
  return 'text-slate-400'
}

const INCOME_TYPES = new Set(['revenue', 'other_income'])
const EXPENSE_TYPES = new Set(['cogs', 'expense', 'other_expense', 'tax'])
const ASSET_TYPES = new Set(['asset'])
const LIABILITY_TYPES = new Set(['liability', 'intercompany'])
const EQUITY_TYPES = new Set(['equity'])

interface KPIs {
  net_income: number
  ebitda: number
  total_assets: number
  total_liabilities: number
  total_equity: number
}

function computeKPIs(rows: TBRow[]): KPIs {
  let income = 0, expenses = 0, assets = 0, liabilities = 0, equity = 0
  for (const r of rows) {
    const signed = parseFloat(r.signed_balance || '0')
    const t = r.account_type
    if (INCOME_TYPES.has(t)) income += signed
    else if (EXPENSE_TYPES.has(t)) expenses += signed
    else if (ASSET_TYPES.has(t)) assets += signed
    else if (LIABILITY_TYPES.has(t)) liabilities += signed
    else if (EQUITY_TYPES.has(t)) equity += signed
  }
  const ni = income - expenses
  return { net_income: ni, ebitda: ni, total_assets: assets, total_liabilities: liabilities, total_equity: equity }
}

// ---------------------------------------------------------------------------
// KPI cards
// ---------------------------------------------------------------------------

interface KPICardProps {
  label: string
  book: number
  adjusted: number
  icon: React.ComponentType<{ className?: string }>
  invertVariance?: boolean
}

function KPICard({ label, book, adjusted, icon: Icon, invertVariance }: KPICardProps) {
  const variance = adjusted - book
  const displayVariance = invertVariance ? -variance : variance
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-col gap-1" data-testid={`kpi-card-${label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`}>
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold uppercase tracking-wide">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="grid grid-cols-3 gap-1 text-xs mt-1">
        <div>
          <div className="text-[9px] text-slate-400 mb-0.5">Book</div>
          <div className="font-semibold text-slate-800">{book === 0 ? '—' : fmtK(book)}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-400 mb-0.5">Adjusted</div>
          <div className="font-semibold text-slate-800">{adjusted === 0 ? '—' : fmtK(adjusted)}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-400 mb-0.5">Variance</div>
          <div className={cn('font-semibold', varianceClass(displayVariance))}>
            {variance === 0 ? '—' : `${displayVariance > 0 ? '+' : ''}${fmtK(displayVariance)}`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scenario mode toggle
// ---------------------------------------------------------------------------

function ScenarioModeToggle({ value, onChange }: { value: ScenarioMode; onChange: (m: ScenarioMode) => void }) {
  return (
    <div className="flex items-center gap-0" data-testid="scenario-mode-toggle">
      {SCENARIO_MODE_OPTIONS.map((opt, i) => (
        <button
          key={opt.value}
          data-testid={`scenario-mode-${opt.value}`}
          onClick={() => onChange(opt.value)}
          title={opt.description}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold border transition-colors',
            i === 0 ? 'rounded-l-lg' : '',
            i === SCENARIO_MODE_OPTIONS.length - 1 ? 'rounded-r-lg' : '',
            i > 0 && i < SCENARIO_MODE_OPTIONS.length - 1 ? 'border-l-0' : '',
            i > 0 ? 'border-l-0' : '',
            value === opt.value
              ? 'bg-indigo-600 text-white border-indigo-600 z-10 relative'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Financial Statements tab (wraps existing taxonomy-based view)
// ---------------------------------------------------------------------------

function StatementsTab({
  entityId,
  asOfDate,
  bookScenarioIds,
  adjScenarioIds,
  viewId,
  onDrilldown,
}: {
  entityId: number
  asOfDate: string
  bookScenarioIds: number[]
  adjScenarioIds: number[]
  viewId?: number
  onDrilldown: (code: string) => void
}) {
  const [statement, setStatement] = useState<'BS' | 'IS' | 'CF'>('IS')
  const [search, setSearch] = useState('')

  const { data: bsBook, isLoading: bsBkLoading } = useQuery({
    queryKey: ['fiw-bs-book', entityId, asOfDate, bookScenarioIds, viewId],
    queryFn: () => reportingApi.taxonomyBalanceSheet(entityId, asOfDate, bookScenarioIds, viewId),
    enabled: !!entityId && !!asOfDate,
  })
  const { data: bsAdj } = useQuery({
    queryKey: ['fiw-bs-adj', entityId, asOfDate, adjScenarioIds, viewId],
    queryFn: () => reportingApi.taxonomyBalanceSheet(entityId, asOfDate, adjScenarioIds, viewId),
    enabled: !!entityId && !!asOfDate && adjScenarioIds.length > 0,
  })
  const { data: isBook, isLoading: isBkLoading } = useQuery({
    queryKey: ['fiw-is-book', entityId, asOfDate, bookScenarioIds, viewId],
    queryFn: () => reportingApi.taxonomyIncomeStatement(entityId, asOfDate, bookScenarioIds, viewId),
    enabled: !!entityId && !!asOfDate,
  })
  const { data: isAdj } = useQuery({
    queryKey: ['fiw-is-adj', entityId, asOfDate, adjScenarioIds, viewId],
    queryFn: () => reportingApi.taxonomyIncomeStatement(entityId, asOfDate, adjScenarioIds, viewId),
    enabled: !!entityId && !!asOfDate && adjScenarioIds.length > 0,
  })

  const cfQuery = useQuery({
    queryKey: ['fiw-cf', entityId, asOfDate, adjScenarioIds],
    queryFn: () =>
      financialStatementsApi
        .getCashFlow(entityId, `${asOfDate.slice(0, 4)}-01-01`, asOfDate, adjScenarioIds.length > 0 ? adjScenarioIds : bookScenarioIds)
        .then((r) => r.data),
    enabled: !!entityId && !!asOfDate && statement === 'CF',
  })

  function mergeWithAdj(book: TaxonomyFsLine[], adj?: TaxonomyFsLine[]) {
    if (!adj || adj.length === 0) return book
    const adjMap = new Map(adj.map((r) => [r.taxonomy_id, r]))
    return book.map((r) => {
      const a = adjMap.get(r.taxonomy_id)
      const bookBal = parseFloat(r.display_balance)
      const adjBal = a ? parseFloat(a.display_balance) : bookBal
      return {
        ...r,
        importedBalance: bookBal,
        postedAdjustments: 0,
        draftAdjustments: adjBal - bookBal,
        adjustedBalance: adjBal,
      }
    })
  }

  const bsRows = useMemo(() => mergeWithAdj(bsBook ?? [], bsAdj), [bsBook, bsAdj])
  const isRows = useMemo(() => mergeWithAdj(isBook ?? [], isAdj), [isBook, isAdj])

  const filteredRows = useMemo(() => {
    const rows = statement === 'BS' ? bsRows : isRows
    if (!search) return rows
    return rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
  }, [statement, bsRows, isRows, search])

  const isLoading = statement === 'IS' ? isBkLoading : bsBkLoading

  return (
    <div data-testid="statements-tab" className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-0 rounded-lg border border-slate-200 overflow-hidden">
          {(['IS', 'BS', 'CF'] as const).map((t) => (
            <button
              key={t}
              data-testid={`stmt-tab-${t}`}
              onClick={() => setStatement(t)}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold transition-colors border-r last:border-r-0',
                statement === t ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {t === 'IS' ? 'Income Statement' : t === 'BS' ? 'Balance Sheet' : 'Cash Flow'}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="Filter lines…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {statement !== 'CF' && (
          <TaxonomyTable
            rows={filteredRows}
            isLoading={isLoading}
            entityId={entityId}
            onDrilldown={onDrilldown}
          />
        )}
        {statement === 'CF' && (
          <div className="p-4">
            {cfQuery.isLoading && <div className="py-8 text-center text-slate-400 text-sm">Loading cash flow…</div>}
            {cfQuery.data && (
              <div className="space-y-4">
                {[cfQuery.data.operating, cfQuery.data.investing, cfQuery.data.financing].map((section) => (
                  <div key={section.label}>
                    <div className="text-xs font-semibold text-slate-700 border-b pb-1 mb-2">{section.label}</div>
                    {section.lines.map((line, i) => (
                      <div key={i} className={cn('flex justify-between text-xs py-0.5', line.is_subtotal ? 'font-semibold border-t mt-1' : 'pl-4 text-slate-600')}>
                        <span>{line.label}</span>
                        <span className="tabular-nums">{fmt(line.amount)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="flex justify-between font-semibold text-sm border-t pt-2">
                  <span>Net Change in Cash</span>
                  <span className="tabular-nums">{fmt(cfQuery.data.net_change)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trial Balance tab — Book | Adjustments | Adjusted columns
// ---------------------------------------------------------------------------

function TrialBalanceTab({
  entityId,
  asOfDate,
  bookScenarioIds,
  adjScenarioIds,
}: {
  entityId: number
  asOfDate: string
  bookScenarioIds: number[]
  adjScenarioIds: number[]
}) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const { data: bookRows, isLoading } = useQuery({
    queryKey: ['fiw-tb-book', entityId, asOfDate, bookScenarioIds],
    queryFn: () => reportingApi.trialBalance(entityId, asOfDate, bookScenarioIds),
    enabled: !!entityId && !!asOfDate,
  })
  const { data: adjRows } = useQuery({
    queryKey: ['fiw-tb-adj', entityId, asOfDate, adjScenarioIds],
    queryFn: () => reportingApi.trialBalance(entityId, asOfDate, adjScenarioIds),
    enabled: !!entityId && !!asOfDate && adjScenarioIds.length > 0,
  })

  const adjMap = useMemo(() => {
    const m = new Map<number, TBRow>()
    adjRows?.forEach((r) => m.set(r.account_id, r))
    return m
  }, [adjRows])

  const merged = useMemo(() => {
    if (!bookRows) return []
    return bookRows.map((r) => {
      const a = adjMap.get(r.account_id)
      const book = parseFloat(r.signed_balance || '0')
      const adj = a ? parseFloat(a.signed_balance || '0') : book
      return { ...r, book_balance: book, adj_balance: adj, variance: adj - book }
    })
  }, [bookRows, adjMap])

  const filtered = useMemo(() => {
    let rows = merged
    if (typeFilter) rows = rows.filter((r) => r.account_type === typeFilter)
    if (search) rows = rows.filter((r) =>
      r.account_name.toLowerCase().includes(search.toLowerCase()) ||
      r.account_number.includes(search),
    )
    return rows
  }, [merged, typeFilter, search])

  const types = useMemo(() => Array.from(new Set(merged.map((r) => r.account_type))).sort(), [merged])

  return (
    <div data-testid="trial-balance-tab" className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="Search account…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          data-testid="tb-type-filter"
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />Loading trial balance…
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" data-testid="tb-grid">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Account #</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Book</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Adjustments</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Adjusted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No accounts to display.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.account_id} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-mono text-slate-600">{r.account_number}</td>
                  <td className="px-3 py-1.5 text-slate-800">{r.account_name}</td>
                  <td className="px-3 py-1.5">
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">{r.account_type}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{r.book_balance === 0 ? '—' : fmtK(r.book_balance)}</td>
                  <td className={cn('px-3 py-1.5 text-right tabular-nums font-semibold', varianceClass(r.variance))}>
                    {r.variance === 0 ? '—' : `${r.variance > 0 ? '+' : ''}${fmtK(r.variance)}`}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-900">{r.adj_balance === 0 ? '—' : fmtK(r.adj_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Comparatives tab
// ---------------------------------------------------------------------------

function ComparativesTab({ entityId, scenarioId }: { entityId: number; scenarioId: number | '' }) {
  const [currentPeriodId, setCurrentPeriodId] = useState<number | ''>('')
  const [comparisonPeriodId, setComparisonPeriodId] = useState<number | ''>('')
  const [reportType, setReportType] = useState('income_statement')
  const [submitted, setSubmitted] = useState(false)

  const { data: report, isFetching } = useQuery<ComparativeReport>({
    queryKey: ['fiw-comparative', entityId, currentPeriodId, comparisonPeriodId, reportType, scenarioId],
    queryFn: () => periodGovernanceApi.buildComparativeReport({
      entity_id: entityId,
      current_period_id: Number(currentPeriodId),
      comparison_period_id: Number(comparisonPeriodId),
      report_type: reportType,
      scenario_id: scenarioId !== '' ? scenarioId : undefined,
    }),
    enabled: submitted && !!currentPeriodId && !!comparisonPeriodId,
    retry: false,
  })

  return (
    <div data-testid="comparatives-tab" className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-lg p-4">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">Current Period</label>
          <PeriodSelect entityId={entityId} value={currentPeriodId} onChange={setCurrentPeriodId} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">Comparison Period</label>
          <PeriodSelect entityId={entityId} value={comparisonPeriodId} onChange={setComparisonPeriodId} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">Statement</label>
          <select
            className="text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
          >
            <option value="income_statement">Income Statement</option>
            <option value="balance_sheet">Balance Sheet</option>
          </select>
        </div>
        <button
          onClick={() => setSubmitted(true)}
          disabled={!currentPeriodId || !comparisonPeriodId}
          className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          Compare
        </button>
      </div>

      {isFetching && (
        <div className="py-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />Loading comparative…
        </div>
      )}

      {report && !isFetching && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" data-testid="comparatives-grid">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Line Item</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Current</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Prior</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">$ Variance</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">% Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.lines.map((line: ComparativeLine, i) => {
                const varNum = parseFloat(line.amount_variance)
                const pctNum = line.percent_change ? parseFloat(line.percent_change) : null
                return (
                  <tr key={i} className={cn('hover:bg-slate-50', line.is_section_header ? 'bg-slate-50 font-semibold' : '')}>
                    <td className="px-3 py-1.5 text-slate-800" style={{ paddingLeft: `${(line.hierarchy_depth || 0) * 12 + 12}px` }}>{line.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{fmt(line.current_amount)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{fmt(line.comparison_amount)}</td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums font-semibold', varianceClass(varNum))}>
                      {varNum === 0 ? '—' : `${varNum > 0 ? '+' : ''}${fmt(varNum)}`}
                    </td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums', pctNum !== null ? varianceClass(pctNum) : 'text-slate-400')}>
                      {pctNum !== null ? `${pctNum >= 0 ? '+' : ''}${pctNum.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!submitted && (
        <div className="py-8 text-center text-slate-400 text-sm">Select two periods and click Compare to view side-by-side financials.</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variance Analysis tab — account-level book vs adjusted
// ---------------------------------------------------------------------------

function VarianceTab({ entityId, scenarioId }: { entityId: number; scenarioId: number | '' }) {
  const [search, setSearch] = useState('')

  const { data: rows, isLoading } = useQuery({
    queryKey: ['fiw-variance', entityId, scenarioId],
    queryFn: () => adjustmentWorkspaceApi.rollforward(entityId, scenarioId !== '' ? Number(scenarioId) : undefined),
    enabled: !!entityId,
  })

  const filtered = useMemo(() => {
    if (!rows) return []
    let r = rows.filter((row) => row.adjustments !== 0)
    if (search) r = r.filter((row) =>
      row.account_name.toLowerCase().includes(search.toLowerCase()) ||
      row.account_number.includes(search),
    )
    return r
  }, [rows, search])

  const totalAdjustments = useMemo(() => filtered.reduce((s, r) => s + r.adjustments, 0), [filtered])

  return (
    <div data-testid="variance-tab" className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="Filter accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {filtered.length > 0 && (
          <span className="text-xs text-slate-500">
            {filtered.length} account{filtered.length !== 1 ? 's' : ''} with variance
            {' '}·{' '}
            <span className={cn('font-semibold', varianceClass(totalAdjustments))}>
              {totalAdjustments > 0 ? '+' : ''}{fmtK(totalAdjustments)} net adjustment
            </span>
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />Computing variances…
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" data-testid="variance-grid">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Account #</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Account Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">As Reported</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Adjustments</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Adjusted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No accounts with variances found.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.account_id} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-mono text-slate-600">{r.account_number}</td>
                  <td className="px-3 py-1.5 text-slate-800">{r.account_name}</td>
                  <td className="px-3 py-1.5">
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">{r.account_type}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{r.as_reported === 0 ? '—' : fmtK(r.as_reported)}</td>
                  <td className={cn('px-3 py-1.5 text-right tabular-nums font-semibold', varianceClass(r.adjustments))}>
                    {r.adjustments === 0 ? '—' : `${r.adjustments > 0 ? '+' : ''}${fmtK(r.adjustments)}`}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-900">{r.adjusted === 0 ? '—' : fmtK(r.adjusted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main workspace page
// ---------------------------------------------------------------------------

type WorkspaceTab = 'statements' | 'trial-balance' | 'comparatives' | 'variance'

const TABS: { id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'statements', label: 'Financial Statements', icon: BarChart2 },
  { id: 'trial-balance', label: 'Trial Balance', icon: Scale },
  { id: 'comparatives', label: 'Comparatives', icon: GitCompare },
  { id: 'variance', label: 'Variance Analysis', icon: Activity },
]

export function FinancialImpactWorkspacePage() {
  const { org } = useOrg()

  const [entityId, setEntityId] = useState<number | ''>('')
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10))
  const [bookScenarioId, setBookScenarioId] = useState<number | ''>('')
  const [adjScenarioId, setAdjScenarioId] = useState<number | ''>('')
  const [scenarioMode, setScenarioMode] = useState<ScenarioMode>('as_reported')
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('statements')
  const [drilldownCode, setDrilldownCode] = useState<string | null>(null)
  const [viewId, setViewId] = useState<number | ''>('')

  const { data: reportingViews = [] } = useQuery({
    queryKey: ['reporting-views'],
    queryFn: () => reportingViewsApi.list(),
  })

  const bookScenarioIds = useMemo(
    () => (bookScenarioId !== '' ? [bookScenarioId] : []),
    [bookScenarioId],
  )

  const adjScenarioIds = useMemo(() => {
    if (scenarioMode === 'as_reported') return bookScenarioIds
    const base = bookScenarioId !== '' ? [bookScenarioId] : []
    const adj = adjScenarioId !== '' ? [adjScenarioId] : []
    return [...base, ...adj]
  }, [scenarioMode, bookScenarioId, adjScenarioId, bookScenarioIds])

  const ready = entityId !== '' && !!asOfDate

  // KPI data
  const { data: bookTb } = useQuery({
    queryKey: ['fiw-kpi-book', entityId, asOfDate, bookScenarioIds],
    queryFn: () => reportingApi.trialBalance(entityId as number, asOfDate, bookScenarioIds),
    enabled: ready,
  })
  const { data: adjTb } = useQuery({
    queryKey: ['fiw-kpi-adj', entityId, asOfDate, adjScenarioIds],
    queryFn: () => reportingApi.trialBalance(entityId as number, asOfDate, adjScenarioIds),
    enabled: ready,
  })

  const { data: drilldown } = useQuery({
    queryKey: ['fiw-drilldown', entityId, asOfDate, drilldownCode, adjScenarioIds],
    queryFn: () => financialStatementsApi.getDrilldown(
      entityId as number,
      asOfDate,
      adjScenarioIds.length > 0 ? adjScenarioIds : bookScenarioIds,
      drilldownCode!,
    ).then((r) => r.data),
    enabled: !!drilldownCode && ready,
  })

  const bookKPIs = useMemo(() => computeKPIs(bookTb ?? []), [bookTb])
  const adjKPIs = useMemo(() => computeKPIs(adjTb ?? []), [adjTb])

  return (
    <div className="flex flex-col h-full">
      <PageLayout
        title="Financial Impact Workspace"
        subtitle="Unified financial analysis — Book, Adjusted, and Variance across all statements"
        breadcrumb={
          <Breadcrumb items={[
            { label: 'Financial Impact', href: '/financial-impact' },
            { label: 'Workspace' },
          ]} />
        }
        actions={
          <div className="flex items-center gap-3">
            <WorkspaceCrossLinks current="analysis" />
            <button
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
              title="Export adjusted financials (coming soon)"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
        }
      >

        {/* Context bar — entity, date, scenarios, mode */}
        <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-lg p-4" data-testid="workspace-context-bar">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">Entity</label>
            <EntitySelect value={entityId} onChange={setEntityId} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">As Of Date</label>
            <input
              data-testid="as-of-date-input"
              type="date"
              className="text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">Book Scenario</label>
            <ScenarioSelect value={bookScenarioId} onChange={setBookScenarioId} placeholder="Base scenario…" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">Adj. Scenario</label>
            <ScenarioSelect value={adjScenarioId} onChange={setAdjScenarioId} placeholder="Overlay scenario…" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">View Mode</label>
            <ScenarioModeToggle value={scenarioMode} onChange={setScenarioMode} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block">Reporting View</label>
            <select
              data-testid="view-selector"
              value={viewId}
              onChange={(e) => setViewId(e.target.value ? Number(e.target.value) : '')}
              className="text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">Default</option>
              {reportingViews.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-5 gap-3" data-testid="kpi-strip">
          <KPICard label="Net Income" book={bookKPIs.net_income} adjusted={adjKPIs.net_income} icon={TrendingUp} />
          <KPICard label="EBITDA" book={bookKPIs.ebitda} adjusted={adjKPIs.ebitda} icon={Activity} />
          <KPICard label="Total Assets" book={bookKPIs.total_assets} adjusted={adjKPIs.total_assets} icon={Building2} />
          <KPICard label="Total Liabilities" book={bookKPIs.total_liabilities} adjusted={adjKPIs.total_liabilities} icon={DollarSign} invertVariance />
          <KPICard label="Total Equity" book={bookKPIs.total_equity} adjusted={adjKPIs.total_equity} icon={Scale} />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-slate-200" data-testid="workspace-tabs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              data-testid={`tab-${id}`}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
                activeTab === id
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="min-h-0">
          {!ready && (
            <div className="py-12 text-center" data-testid="empty-state">
              <BarChart2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500">Select an entity and date to begin analysis.</p>
              <p className="text-xs text-slate-400 mt-1">Use the controls above to configure your financial impact view.</p>
            </div>
          )}

          {ready && activeTab === 'statements' && (
            <StatementsTab
              entityId={entityId as number}
              asOfDate={asOfDate}
              bookScenarioIds={bookScenarioIds}
              adjScenarioIds={adjScenarioIds}
              viewId={viewId !== '' ? viewId : undefined}
              onDrilldown={setDrilldownCode}
            />
          )}
          {ready && activeTab === 'trial-balance' && (
            <TrialBalanceTab
              entityId={entityId as number}
              asOfDate={asOfDate}
              bookScenarioIds={bookScenarioIds}
              adjScenarioIds={adjScenarioIds}
            />
          )}
          {ready && activeTab === 'comparatives' && (
            <ComparativesTab
              entityId={entityId as number}
              scenarioId={adjScenarioId}
            />
          )}
          {ready && activeTab === 'variance' && (
            <VarianceTab
              entityId={entityId as number}
              scenarioId={adjScenarioId}
            />
          )}
        </div>

      </PageLayout>

      {/* Drilldown drawer */}
      {drilldownCode && (
        <div className="fixed inset-y-0 right-0 z-50">
          <DrilldownPanel
            drilldown={drilldown ?? null}
            onClose={() => setDrilldownCode(null)}
          />
        </div>
      )}
    </div>
  )
}
