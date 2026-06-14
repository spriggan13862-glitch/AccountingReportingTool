import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle, XCircle, ChevronRight, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { reviewApi, type CheckResult, type VarianceRow, type RatioMetric, type RatioAnalysisResponse, type AnalysisFlag, type IntelligenceFinding } from '@/api/review'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import type { FsLine } from '@/types'

type StatementTab = 'BS' | 'IS' | 'CF' | 'Analysis'

const TABS: { value: StatementTab; label: string }[] = [
  { value: 'BS', label: 'Balance Sheet' },
  { value: 'IS', label: 'Income Statement' },
  { value: 'CF', label: 'Cash Flow' },
  { value: 'Analysis', label: 'Analysis' },
]

// Which tabs each check is relevant to. Checks not listed here show on all statement tabs.
const CHECK_TAB_RELEVANCE: Record<string, Array<'BS' | 'IS' | 'CF'>> = {
  'Balance Sheet balances (A = L + E)': ['BS'],
}

function CheckPill({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
          check.passed
            ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
            : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
        }`}
      >
        {check.passed
          ? <CheckCircle className="h-3 w-3 shrink-0" />
          : <XCircle className="h-3 w-3 shrink-0" />}
        <span>{check.name}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-30 min-w-48 max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-xs text-gray-700">
          {check.detail}
        </div>
      )}
    </div>
  )
}

function VarianceTable({
  rows,
  onDrilldown,
}: {
  rows: VarianceRow[]
  onDrilldown?: (code: string) => void
}) {
  if (rows.length === 0) return <p className="text-xs text-gray-400 italic py-4 text-center">No data</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="pb-2 text-left font-medium">Line</th>
            <th className="pb-2 text-right font-medium w-28">Prior</th>
            <th className="pb-2 text-right font-medium w-28">Current</th>
            <th className="pb-2 text-right font-medium w-24">$ Change</th>
            <th className="pb-2 text-right font-medium w-20">% Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.code}
              className={`border-b border-gray-50 hover:bg-gray-50 ${row.flag ? 'bg-amber-50' : ''}`}
            >
              <td className="py-1.5 pl-1">
                <button
                  type="button"
                  className={`flex items-center gap-1 text-left hover:text-blue-600 group ${row.is_subtotal ? 'font-semibold' : ''}`}
                  onClick={() => onDrilldown?.(row.code)}
                >
                  <span className="text-gray-700 group-hover:text-blue-600">{row.name}</span>
                  <ChevronRight className="h-3 w-3 text-gray-300 group-hover:text-blue-400 shrink-0" />
                </button>
              </td>
              <td className="py-1.5 text-right tabular-nums text-gray-600">{row.prior_balance.toFixed(2)}</td>
              <td className="py-1.5 text-right tabular-nums text-gray-800 font-medium">{row.current_balance.toFixed(2)}</td>
              <td className={`py-1.5 text-right tabular-nums ${row.amount_delta >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                {row.amount_delta >= 0 ? '+' : ''}{row.amount_delta.toFixed(2)}
              </td>
              <td className={`py-1.5 text-right tabular-nums ${row.flag ? 'font-semibold text-amber-700' : 'text-gray-500'}`}>
                {row.pct_delta != null
                  ? `${row.pct_delta >= 0 ? '+' : ''}${row.pct_delta.toFixed(1)}%`
                  : '—'}
                {row.flag && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function buildDepthMap(rows: FsLine[]): Map<number, number> {
  const depthMap = new Map<number, number>()
  const rowById = new Map(rows.map((r) => [r.line_id, r]))
  function depth(id: number): number {
    if (depthMap.has(id)) return depthMap.get(id)!
    const row = rowById.get(id)
    const d = row?.parent_line_id ? 1 + depth(row.parent_line_id) : 0
    depthMap.set(id, d)
    return d
  }
  rows.forEach((r) => depth(r.line_id))
  return depthMap
}

function StatementTable({ rows }: { rows: FsLine[] }) {
  if (rows.length === 0) return <p className="text-xs text-gray-400 italic py-4 text-center">No data</p>
  const depths = buildDepthMap(rows)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="pb-2 text-left font-medium">Line</th>
            <th className="pb-2 text-right font-medium w-32">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const d = depths.get(row.line_id) ?? 0
            return (
              <tr key={row.line_id} className={`border-b border-gray-50 ${row.is_subtotal ? 'bg-gray-50' : ''}`}>
                <td className="py-1.5" style={{ paddingLeft: `${d * 16 + 4}px` }}>
                  <span className={`text-gray-700 ${row.is_subtotal ? 'font-semibold' : ''}`}>{row.name}</span>
                </td>
                <td className={`py-1.5 pr-1 text-right tabular-nums ${row.is_subtotal ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                  {Number(row.display_balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const STATUS_COLORS = {
  good: 'border-green-200 bg-green-50',
  warning: 'border-amber-200 bg-amber-50',
  critical: 'border-red-200 bg-red-50',
  na: 'border-gray-200 bg-gray-50',
}

const STATUS_VALUE_COLORS = {
  good: 'text-green-800',
  warning: 'text-amber-800',
  critical: 'text-red-800',
  na: 'text-gray-400',
}

function RatioCard({ m }: { m: RatioMetric }) {
  const formatted = m.value === null ? '—'
    : m.unit === '%' ? `${m.value.toFixed(1)}%`
    : m.unit === '$' ? `$${m.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `${m.value.toFixed(2)}x`
  return (
    <div className={`rounded-lg border p-3 ${STATUS_COLORS[m.status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.na}`}>
      <p className="text-xs text-gray-500 mb-1">{m.name}</p>
      <p className={`text-xl font-bold tabular-nums ${STATUS_VALUE_COLORS[m.status as keyof typeof STATUS_VALUE_COLORS] ?? 'text-gray-400'}`}>
        {formatted}
      </p>
      <p className="text-[10px] text-gray-500 mt-1 leading-tight">{m.interpretation}</p>
    </div>
  )
}

function FlagCard({ flag }: { flag: AnalysisFlag }) {
  const colors = flag.severity === 'critical'
    ? 'border-red-200 bg-red-50 text-red-800'
    : flag.severity === 'warning'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-blue-200 bg-blue-50 text-blue-800'
  return (
    <div className={`rounded-lg border p-3 ${colors}`}>
      <p className="text-xs font-semibold mb-0.5">{flag.title}</p>
      <p className="text-xs text-gray-700">{flag.detail}</p>
      {flag.suggested_procedures && (
        <p className="text-[10px] text-gray-500 mt-1 italic">{flag.suggested_procedures}</p>
      )}
    </div>
  )
}

const SEVERITY_COLORS: Record<string, string> = {
  high: 'border-red-200 bg-red-50',
  moderate: 'border-amber-200 bg-amber-50',
  low: 'border-blue-200 bg-blue-50',
}

function IntelligenceFindingCard({ finding }: { finding: IntelligenceFinding }) {
  const [expanded, setExpanded] = useState(false)
  const borderBg = SEVERITY_COLORS[finding.severity] ?? 'border-gray-200 bg-gray-50'
  return (
    <div className={`rounded-lg border p-3 ${borderBg}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wide">{finding.category.replace(/_/g, ' ')}</p>
          <p className="text-xs font-semibold text-gray-800 mt-0.5">{finding.title}</p>
          <p className="text-xs text-gray-600 mt-0.5 leading-snug">{finding.description}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 text-gray-400 hover:text-gray-600 mt-0.5"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-gray-200 space-y-2">
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Trigger</p>
            <p className="text-xs text-gray-600 italic mt-0.5">{finding.detection_trigger}</p>
          </div>
          {finding.suggested_procedures && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Suggested Procedures</p>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans mt-0.5 leading-snug">{finding.suggested_procedures}</pre>
            </div>
          )}
          {finding.suggested_ajes && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Suggested AJEs</p>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans mt-0.5 leading-snug">{finding.suggested_ajes}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AnalysisPanel({ data }: { data: RatioAnalysisResponse | undefined }) {
  if (!data) return <LoadingState />
  if (!data.has_data) return (
    <div className="p-8 text-center">
      <p className="text-sm text-gray-500">No posted data found. Import and post a trial balance to see ratio analysis.</p>
    </div>
  )
  const summaryColor = data.flags.some(f => f.severity === 'critical')
    ? 'bg-red-50 text-red-800 border-red-200'
    : data.flags.some(f => f.severity === 'warning')
    ? 'bg-amber-50 text-amber-800 border-amber-200'
    : 'bg-green-50 text-green-800 border-green-200'
  return (
    <div className="space-y-5 overflow-auto">
      <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${summaryColor}`}>
        {data.summary}
      </div>
      {data.intelligence_findings && data.intelligence_findings.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Detected Issues — Accounting Rules Engine ({data.intelligence_findings.length})
          </h3>
          <div className="space-y-2">
            {data.intelligence_findings.map((f) => (
              <IntelligenceFindingCard key={f.issue_code} finding={f} />
            ))}
          </div>
        </div>
      )}
      {data.flags.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ratio Flags</h3>
          <div className="space-y-2">{data.flags.map(f => <FlagCard key={f.code} flag={f} />)}</div>
        </div>
      )}
      {([
        { label: 'Liquidity', metrics: data.liquidity },
        { label: 'Leverage & Solvency', metrics: data.leverage },
        { label: 'Profitability', metrics: data.profitability },
      ] as const).map(({ label, metrics }) => metrics.length > 0 && (
        <div key={label}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {metrics.map(m => <RatioCard key={m.name} m={m} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ReviewWorkspacePage() {
  const navigate = useNavigate()
  const { activeEntity, activePeriod, activeScenarioIds, dataView } = useWorkspace()
  const [tab, setTab] = useState<StatementTab>('BS')
  const [view, setView] = useState<'variance' | 'current' | 'prior'>('variance')

  const enabled = !!activeEntity && !!activePeriod

  const isAnalysisTab = tab === 'Analysis'
  const stmtEnabled = enabled && !isAnalysisTab

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['review-statements', activeEntity?.id, activePeriod?.end_date, activeScenarioIds, dataView, tab],
    queryFn: () =>
      reviewApi.getStatements({
        entity_id: activeEntity!.id,
        as_of_date: activePeriod!.end_date,
        scenario_ids: activeScenarioIds,
        data_view: dataView,
        statement: tab,
        include_checks: true,
      }),
    enabled: stmtEnabled,
    staleTime: 30_000,
  })

  const { data: analysisData, isLoading: analysisLoading } = useQuery({
    queryKey: ['review-analysis', activeEntity?.id, activePeriod?.end_date, activeScenarioIds, dataView],
    queryFn: () =>
      reviewApi.getAnalysis({
        entity_id: activeEntity!.id,
        as_of_date: activePeriod!.end_date,
        scenario_ids: activeScenarioIds,
        data_view: dataView,
      }),
    enabled,
    staleTime: 30_000,
  })

  const varianceRows = data?.variance.filter((r) => r.statement === tab) ?? []
  const currentRows = data?.current.filter((r) => r.statement === tab) ?? []
  const priorRows = data?.prior.filter((r) => r.statement === tab) ?? []
  const allChecks = data?.checks ?? []
  // Only show checks relevant to the current tab
  const visibleChecks = isAnalysisTab ? [] : allChecks.filter((c) => {
    const allowed = CHECK_TAB_RELEVANCE[c.name]
    return allowed ? allowed.includes(tab as 'BS' | 'IS' | 'CF') : true
  })
  const failedChecks = allChecks.filter((c) => !c.passed).length

  function handleDrilldown(code: string) {
    if (!activeEntity) return
    navigate(`/adjustments/journal-entries?entity_id=${activeEntity.id}`)
  }

  if (!enabled) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center max-w-xs">
          <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700 mb-1">
            {!activeEntity ? 'No entity selected' : 'No period selected'}
          </p>
          <p className="text-xs text-gray-400 mb-4">
            {!activeEntity
              ? 'Use the entity selector in the context bar at the top of the page.'
              : 'Select an accounting period from the context bar to load review data.'}
          </p>
          {!activeEntity && (
            <button
              onClick={() => navigate('/client-data/entities')}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Manage Entities →
            </button>
          )}
          {activeEntity && !activePeriod && (
            <button
              onClick={() => navigate('/client-data/periods')}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Manage Periods →
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 p-4 lg:p-6 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Review</h1>
          <p className="text-xs text-gray-500 mt-0.5">{activeEntity?.code} · {activePeriod?.period_name}</p>
        </div>
        {failedChecks > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
            <XCircle className="h-3.5 w-3.5" />{failedChecks} check{failedChecks !== 1 ? 's' : ''} failed
          </span>
        )}
      </div>

      {/* Tab bar + view toggle */}
      <div className="flex items-center gap-1 border-b border-gray-200 shrink-0">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === value
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
        {!isAnalysisTab && (
          <div className="ml-auto flex items-center gap-1 pb-1">
            {(['variance', 'current', 'prior'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded px-2 py-0.5 text-xs font-medium capitalize transition-colors ${
                  view === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {v === 'variance' ? 'Comparison' : v === 'current' ? 'Current' : 'Prior'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Checks strip — contextual per tab, hidden on Analysis */}
      {visibleChecks.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {visibleChecks.map((check) => (
            <CheckPill key={check.name} check={check} />
          ))}
        </div>
      )}

      {/* Content — full width */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 flex-1 overflow-auto min-h-0">
        {isAnalysisTab ? (
          analysisLoading ? <LoadingState /> : <AnalysisPanel data={analysisData} />
        ) : (
          <>
            {isLoading && <LoadingState />}
            {isError && <ErrorState message={(error as Error).message} />}
            {data && !isLoading && (
              view === 'variance'
                ? <VarianceTable rows={varianceRows} onDrilldown={handleDrilldown} />
                : view === 'current'
                  ? <StatementTable rows={currentRows} />
                  : <StatementTable rows={priorRows} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
