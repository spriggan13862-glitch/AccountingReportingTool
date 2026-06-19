import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, AlertCircle, CheckCircle, Info, X, ChevronRight, RefreshCw,
  TrendingDown, TrendingUp, Minus, BarChart2, FileText, Zap, Shield,
  Activity, Package, ArrowRight,
} from 'lucide-react'
import {
  runDetection, listDetectedIssues, updateIssueStatus, getMaterialityProfile,
  getTrends, getAdjustmentAnalysis,
  type DetectedIssue, type IssueSeverity, type MaterialityProfile,
  type TrendReport, type AdjustmentAnalysisReport,
} from '@/api/accountingIntelligence'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { periodsApi } from '@/api/periods'
import { useFormatCurrencyCompact } from '@/hooks/useFormatCurrency'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEV_ORDER: IssueSeverity[] = ['critical', 'high', 'moderate', 'low', 'informational']

const SEV_CONFIG: Record<IssueSeverity, { label: string; bg: string; border: string; text: string; icon: React.ElementType; dot: string }> = {
  critical: { label: 'Critical', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: AlertCircle, dot: 'bg-red-500' },
  high:     { label: 'High Risk', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: AlertTriangle, dot: 'bg-orange-400' },
  moderate: { label: 'Moderate', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: AlertTriangle, dot: 'bg-amber-400' },
  low:      { label: 'Low', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: Info, dot: 'bg-blue-400' },
  informational: { label: 'Informational', bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600', icon: Info, dot: 'bg-gray-300' },
}

function useFmt() {
  const fmt = useFormatCurrencyCompact()
  return (n: number | undefined | null, unit: 'amount' | 'percent' | 'ratio' = 'amount') => {
    if (n == null) return '—'
    if (unit === 'percent') return `${n.toFixed(1)}%`
    if (unit === 'ratio') return `${n.toFixed(2)}x`
    return fmt(n)
  }
}

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

function SevBadge({ severity }: { severity: IssueSeverity }) {
  const c = SEV_CONFIG[severity]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${c.bg} ${c.border} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Finding row (in the list)
// ---------------------------------------------------------------------------

function FindingRow({
  issue,
  selected,
  onClick,
}: {
  issue: DetectedIssue
  selected: boolean
  onClick: () => void
}) {
  const c = SEV_CONFIG[issue.severity];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${selected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-800 truncate">{issue.title}</p>
          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{issue.description}</p>
        </div>
        <SevBadge severity={issue.severity} />
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Finding detail panel
// ---------------------------------------------------------------------------

function FindingDetail({ issue, onClose, onStatusChange }: {
  issue: DetectedIssue
  onClose: () => void
  onStatusChange: (id: number, status: string) => void
}) {
  const c = SEV_CONFIG[issue.severity]
  const Icon = c.icon

  const procedures = issue.suggested_procedures
    ? issue.suggested_procedures.split('\n').filter(Boolean)
    : []
  const ajes = issue.suggested_ajes
    ? issue.suggested_ajes.split('\n').filter(Boolean)
    : []
  const metrics = issue.supporting_metrics ?? {}

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`px-4 py-3 border-b ${c.bg} ${c.border} flex items-start justify-between gap-2`}>
        <div className="flex items-start gap-2">
          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${c.text}`} />
          <div>
            <p className={`text-xs font-bold ${c.text}`}>{issue.title}</p>
            <p className="text-[10px] text-gray-500 mt-0.5 font-mono">{issue.issue_code}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4 text-xs">
        {/* What was detected */}
        <section>
          <p className="font-semibold text-gray-700 mb-1 flex items-center gap-1"><Shield className="h-3 w-3" /> What was detected</p>
          <p className="text-gray-600 leading-relaxed">{issue.description}</p>
        </section>

        {/* Why it triggered */}
        {issue.detection_trigger && (
          <section>
            <p className="font-semibold text-gray-700 mb-1 flex items-center gap-1"><Zap className="h-3 w-3" /> Why triggered</p>
            <p className="text-gray-600 leading-relaxed bg-amber-50 border border-amber-100 rounded p-2">{issue.detection_trigger}</p>
          </section>
        )}

        {/* Supporting data */}
        {Object.keys(metrics).length > 0 && (
          <section>
            <p className="font-semibold text-gray-700 mb-1 flex items-center gap-1"><BarChart2 className="h-3 w-3" /> Supporting data</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(metrics).slice(0, 8).map(([k, v]) => (
                <div key={k} className="rounded bg-gray-50 border border-gray-100 px-2 py-1.5">
                  <p className="text-[10px] text-gray-400 capitalize">{k.replace(/_/g, ' ')}</p>
                  <p className="font-semibold text-gray-800">{v}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Category */}
        <section>
          <p className="font-semibold text-gray-700 mb-1">Category</p>
          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] bg-blue-50 border border-blue-100 text-blue-700 capitalize">
            {issue.category.replace(/_/g, ' ')}
          </span>
        </section>

        {/* Suggested procedures */}
        {procedures.length > 0 && (
          <section>
            <p className="font-semibold text-gray-700 mb-1 flex items-center gap-1"><FileText className="h-3 w-3" /> Suggested procedures</p>
            <ol className="space-y-1 text-gray-600">
              {procedures.map((p, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-gray-400 shrink-0">{i + 1}.</span>
                  <span className="leading-relaxed">{p.replace(/^\d+\.\s*/, '')}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Potential AJE areas */}
        {ajes.length > 0 && (
          <section>
            <p className="font-semibold text-gray-700 mb-1 flex items-center gap-1"><ArrowRight className="h-3 w-3" /> Potential AJE areas</p>
            <ul className="space-y-1 text-gray-600">
              {ajes.map((a, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-gray-400 shrink-0">•</span>
                  <span className="leading-relaxed">{a.replace(/^[-•]\s*/, '')}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Management questions */}
        {issue.management_questions && (
          <section>
            <p className="font-semibold text-gray-700 mb-1 flex items-center gap-1"><FileText className="h-3 w-3" /> Management inquiry questions</p>
            <ul className="space-y-1 text-gray-600">
              {issue.management_questions.split('\n').filter(Boolean).map((q, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-gray-400 shrink-0">•</span>
                  <span className="leading-relaxed">{q.replace(/^[-•]\s*/, '')}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Status actions */}
        <section className="border-t border-gray-100 pt-3">
          <p className="font-semibold text-gray-700 mb-2">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {(['open', 'acknowledged', 'resolved', 'dismissed'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => issue.id && onStatusChange(issue.id, s)}
                className={`rounded px-2.5 py-1 text-[10px] font-medium border capitalize transition-colors ${
                  issue.status === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* Related actions */}
        <section className="border-t border-gray-100 pt-3">
          <Link
            to="/adjustments/journal-entries/new"
            className="flex items-center justify-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 w-full"
          >
            <ArrowRight className="h-3 w-3" /> Create AJE from this finding
          </Link>
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Severity section
// ---------------------------------------------------------------------------

function SeveritySection({
  severity,
  issues,
  selectedId,
  onSelect,
}: {
  severity: IssueSeverity
  issues: DetectedIssue[]
  selectedId: number | null
  onSelect: (issue: DetectedIssue) => void
}) {
  const [collapsed, setCollapsed] = useState(severity === 'informational' || severity === 'low')
  const c = SEV_CONFIG[severity]

  if (issues.length === 0) return null

  return (
    <div className="border-b border-gray-100">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-2 ${c.bg} hover:brightness-95`}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${c.dot}`} />
          <span className={`text-xs font-semibold ${c.text}`}>{c.label}</span>
          <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${c.bg} ${c.text} border ${c.border} font-semibold`}>{issues.length}</span>
        </div>
        <ChevronRight className={`h-3.5 w-3.5 ${c.text} transition-transform ${collapsed ? '' : 'rotate-90'}`} />
      </button>
      {!collapsed && issues.map((issue) => (
        <FindingRow
          key={issue.id ?? issue.issue_code}
          issue={issue}
          selected={selectedId === issue.id}
          onClick={() => onSelect(issue)}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Materiality panel
// ---------------------------------------------------------------------------

function MaterialityPanel({ profile }: { profile: MaterialityProfile }) {
  const fmt = useFmt()
  const bases = profile.basis_used.split(',').filter(Boolean)
  return (
    <div className="space-y-3">
      {/* DEFECT-07: floor warning */}
      {profile.floor_applied && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
          <span>Materiality uses the $10,000 default floor — insufficient financial data exists for this entity/period to compute a data-driven threshold.</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Overall Materiality', value: fmt(profile.overall), desc: 'Planning threshold' },
          { label: 'Performance Mat.', value: fmt(profile.performance), desc: '75% of overall' },
          { label: 'Trivial Threshold', value: fmt(profile.trivial), desc: '3% of overall' },
        ].map(({ label, value, desc }) => (
          <div key={label} className="rounded border border-gray-100 bg-gray-50 p-2 text-center">
            <p className="text-[10px] text-gray-400">{label}</p>
            <p className="text-sm font-bold text-gray-900">{value}</p>
            <p className="text-[10px] text-gray-400">{desc}</p>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-gray-500">
        <span className="font-medium">Basis: </span>{bases.join(', ')}
      </div>
      {/* DEFECT-06: EBITDA proxy label */}
      {profile.ebitda_is_proxy && (
        <div className="text-[11px] text-gray-500 italic">
          * EBITDA shown as estimated proxy (10% of revenue or net income, whichever is higher).
          Depreciation &amp; amortization is not separately classified in the current chart of accounts.
        </div>
      )}
      <div className="text-[11px] text-gray-500 bg-gray-50 rounded p-2 leading-relaxed">
        <span className="font-medium text-gray-700">Severity thresholds: </span>
        Critical ≥ {fmt(profile.thresholds.critical)} · High ≥ {fmt(profile.thresholds.high)} · Moderate ≥ {fmt(profile.thresholds.moderate)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trend row
// ---------------------------------------------------------------------------

function TrendRow({ trend }: { trend: import('@/api/accountingIntelligence').TrendResult }) {
  const pct = trend.pct_change_recent ?? trend.pct_change_yoy
  const dir = trend.direction

  const DirIcon = dir === 'increasing' ? TrendingUp : dir === 'decreasing' ? TrendingDown : Minus
  const dirColor = trend.is_concerning
    ? 'text-red-600'
    : dir === 'increasing' ? 'text-emerald-600' : dir === 'decreasing' ? 'text-red-500' : 'text-gray-400'

  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded border text-xs ${trend.is_concerning ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
      <div className="flex-1 min-w-0">
        <p className={`font-medium ${trend.is_concerning ? 'text-red-800' : 'text-gray-700'}`}>{trend.label}</p>
        {trend.concern_reason && (
          <p className="text-[10px] text-red-600 mt-0.5 line-clamp-1">{trend.concern_reason}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {pct != null && (
          <span className={`font-semibold tabular-nums ${pct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
          </span>
        )}
        <DirIcon className={`h-3.5 w-3.5 ${dirColor}`} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type DashboardTab = 'findings' | 'materiality' | 'trends' | 'adjustments'

export function IntelligenceDashboardPage() {
  const { activeEntity, activePeriod } = useWorkspace()
  const queryClient = useQueryClient()
  const fmt = useFmt()
  const [activeTab, setActiveTab] = useState<DashboardTab>('findings')
  const [selectedIssue, setSelectedIssue] = useState<DetectedIssue | null>(null)
  const [compPeriodId, setCompPeriodId] = useState<number | null>(null)
  const [lastRunWarnings, setLastRunWarnings] = useState<string[]>([])
  const [lastRunSkippedComparison, setLastRunSkippedComparison] = useState<boolean | null>(null)

  const entityId = activeEntity?.id
  const periodId = activePeriod?.id
  const asOfDate = activePeriod?.end_date ?? ''

  const enabled = !!entityId && !!periodId

  // Load all periods for comparison selector
  const { data: periods = [] } = useQuery({
    queryKey: ['periods', entityId],
    queryFn: () => periodsApi.list(entityId!),
    enabled: !!entityId,
  })

  // Issues list
  const { data: issuesData, isLoading: issuesLoading, isError: issuesError } = useQuery({
    queryKey: ['detected-issues', entityId, periodId],
    queryFn: () => listDetectedIssues({ entity_id: entityId!, current_period_id: periodId! }),
    enabled,
    staleTime: 30_000,
  })

  // Materiality
  const { data: matProfile, isLoading: matLoading } = useQuery({
    queryKey: ['materiality', entityId, periodId],
    queryFn: () => getMaterialityProfile({ entity_id: entityId!, period_id: periodId! }),
    enabled: enabled && activeTab === 'materiality',
    staleTime: 60_000,
  })

  // Trends — requires at least 2 periods
  const trendPeriodIds = useMemo(() => {
    const prior = periods.filter((p) => p.id !== periodId).slice(-2).map((p) => p.id)
    return [...prior, periodId!].filter(Boolean) as number[]
  }, [periods, periodId])

  const { data: trendReport, isLoading: trendsLoading } = useQuery({
    queryKey: ['trends', entityId, trendPeriodIds.join(',')],
    queryFn: () => getTrends({ entity_id: entityId!, period_ids: trendPeriodIds }),
    enabled: enabled && activeTab === 'trends' && trendPeriodIds.length >= 2,
    staleTime: 60_000,
  })

  // Adjustment analysis
  const { data: adjReport, isLoading: adjLoading } = useQuery({
    queryKey: ['adj-analysis', entityId, asOfDate, matProfile?.overall],
    queryFn: () => getAdjustmentAnalysis({
      entity_id: entityId!,
      as_of_date: asOfDate,
      materiality: matProfile?.overall,
    }),
    enabled: enabled && activeTab === 'adjustments' && !!asOfDate,
    staleTime: 60_000,
  })

  // Run detection mutation
  const runMutation = useMutation({
    mutationFn: () => runDetection({
      entity_id: entityId!,
      current_period_id: periodId!,
      comparison_period_id: compPeriodId ?? undefined,
    }),
    onSuccess: (result) => {
      const data = result as import('@/api/accountingIntelligence').DetectionRunResult
      setLastRunWarnings(data.warnings ?? [])
      setLastRunSkippedComparison(data.comparison_period_skipped ?? false)
      queryClient.invalidateQueries({ queryKey: ['detected-issues', entityId, periodId] })
    },
  })

  // Status update mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      updateIssueStatus(id, status as DetectedIssue['status']),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['detected-issues', entityId, periodId] })
    },
  })

  const issues: DetectedIssue[] = Array.isArray(issuesData)
    ? issuesData
    : (issuesData as { issues?: DetectedIssue[] })?.issues ?? []

  const grouped = useMemo(() => {
    const map: Record<IssueSeverity, DetectedIssue[]> = {
      critical: [], high: [], moderate: [], low: [], informational: [],
    }
    for (const issue of issues) {
      map[issue.severity]?.push(issue)
    }
    return map
  }, [issues])

  const sevCounts = useMemo(() => ({
    critical: grouped.critical.length,
    high: grouped.high.length,
    moderate: grouped.moderate.length,
    low: grouped.low.length,
    informational: grouped.informational.length,
  }), [grouped])

  const totalFindings = issues.length
  const openFindings = issues.filter((i) => i.status === 'open' || i.status === 'acknowledged').length

  // No context guard
  if (!enabled) {
    return (
      <div className="flex flex-1 items-center justify-center h-full p-8">
        <div className="text-center max-w-sm">
          <Activity className="h-10 w-10 text-indigo-200 mx-auto mb-4" />
          <p className="text-sm font-semibold text-gray-800 mb-1">Accounting Intelligence Engine</p>
          <p className="text-xs text-gray-500 leading-relaxed mb-4">
            Select an entity and period to run a deterministic accounting review. The engine evaluates
            200+ rules across revenue recognition, AR, inventory, debt, leases, equity, and more.
          </p>
          <div className="grid grid-cols-3 gap-2 text-center mb-4">
            {[['200+', 'Rules'], ['26', 'Categories'], ['10', 'Concern Areas']].map(([n, l]) => (
              <div key={l} className="rounded border border-indigo-100 bg-indigo-50 p-2">
                <p className="text-base font-bold text-indigo-700">{n}</p>
                <p className="text-[10px] text-indigo-500">{l}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400">Select an entity and period in the context bar above.</p>
        </div>
      </div>
    )
  }

  const TABS: { value: DashboardTab; label: string }[] = [
    { value: 'findings', label: `Findings${totalFindings > 0 ? ` (${totalFindings})` : ''}` },
    { value: 'materiality', label: 'Materiality' },
    { value: 'trends', label: 'Trends' },
    { value: 'adjustments', label: 'Adjustments' },
  ]

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 lg:px-6 pt-4 pb-2 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Intelligence</h1>
          <p className="text-xs text-gray-500">{activeEntity?.name} · {activePeriod?.period_name}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Comparison period */}
          <select
            value={compPeriodId ?? ''}
            onChange={(e) => setCompPeriodId(e.target.value ? Number(e.target.value) : null)}
            className="rounded border border-gray-200 text-xs px-2 py-1 text-gray-600 bg-white"
          >
            <option value="">No comparison period</option>
            {periods.filter((p) => p.id !== periodId).map((p) => (
              <option key={p.id} value={p.id}>{p.period_name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${runMutation.isPending ? 'animate-spin' : ''}`} />
            {runMutation.isPending ? 'Running…' : 'Run Review'}
          </button>
        </div>
      </div>

      {/* Comparison period warning — DEFECT-04 */}
      {lastRunSkippedComparison === true && (
        <div className="mx-4 lg:mx-6 mb-1 shrink-0 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
          <span>
            <strong>Review run without comparison period.</strong> Trend and comparative rules were skipped.
            Select a comparison period above for full trend-based analysis.
          </span>
        </div>
      )}

      {/* Detection path warnings — DEFECT-02 */}
      {lastRunWarnings.length > 0 && (
        <div className="mx-4 lg:mx-6 mb-1 shrink-0 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 space-y-1">
          <p className="font-semibold flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> Partial detection — some rules skipped</p>
          {lastRunWarnings.map((w, i) => <p key={i} className="text-red-700">{w}</p>)}
        </div>
      )}

      {/* Summary strip */}
      <div className="flex gap-2 px-4 lg:px-6 pb-2 shrink-0">
        {SEV_ORDER.filter((s) => s !== 'low' && s !== 'informational').map((sev) => {
          const c = SEV_CONFIG[sev]
          const count = sevCounts[sev]
          return (
            <button
              key={sev}
              type="button"
              onClick={() => setActiveTab('findings')}
              className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold transition-colors ${count > 0 ? `${c.bg} ${c.border} ${c.text}` : 'bg-gray-50 border-gray-100 text-gray-300'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${count > 0 ? c.dot : 'bg-gray-200'}`} />
              {count} {c.label}
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-1 text-[11px] text-gray-400">
          {openFindings > 0 && <><span className="w-2 h-2 rounded-full bg-amber-300 inline-block" />{openFindings} open</>}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center border-b border-gray-200 px-4 lg:px-6 shrink-0">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveTab(value)}
            className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              activeTab === value ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto pb-1 flex items-center gap-2">
          <Link
            to="/deliverables"
            className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"
          >
            <Package className="h-3 w-3" /> Add to Package
          </Link>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">

        {/* --- FINDINGS TAB --- */}
        {activeTab === 'findings' && (
          <>
            <div className={`flex flex-col border-r border-gray-200 overflow-hidden ${selectedIssue ? 'w-1/2' : 'flex-1'}`}>
              <div className="flex-1 overflow-auto">
                {issuesLoading && <LoadingState />}
                {issuesError && <ErrorState message="Could not load findings" />}
                {!issuesLoading && !issuesError && issues.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
                    <CheckCircle className="h-8 w-8 text-emerald-300" />
                    <p className="text-sm font-medium text-gray-700">No findings yet</p>
                    <p className="text-xs text-gray-400 max-w-xs">
                      Click "Run Review" to evaluate 200+ deterministic rules against the imported books.
                      Findings will appear here grouped by severity.
                    </p>
                    <button
                      type="button"
                      onClick={() => runMutation.mutate()}
                      disabled={runMutation.isPending}
                      className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Run Review
                    </button>
                  </div>
                )}
                {runMutation.isPending && (
                  <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-700 flex items-center gap-2">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Running accounting review…
                  </div>
                )}
                {runMutation.isError && (
                  <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700">
                    Review failed — check that this entity has imported data.
                  </div>
                )}
                {SEV_ORDER.map((sev) => (
                  <SeveritySection
                    key={sev}
                    severity={sev}
                    issues={grouped[sev]}
                    selectedId={selectedIssue?.id ?? null}
                    onSelect={setSelectedIssue}
                  />
                ))}
              </div>
            </div>

            {/* Detail panel */}
            {selectedIssue && (
              <div className="w-1/2 border-l border-gray-200 overflow-hidden">
                <FindingDetail
                  issue={selectedIssue}
                  onClose={() => setSelectedIssue(null)}
                  onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
                />
              </div>
            )}
          </>
        )}

        {/* --- MATERIALITY TAB --- */}
        {activeTab === 'materiality' && (
          <div className="flex-1 overflow-auto p-6">
            {matLoading && <LoadingState />}
            {!matLoading && !matProfile && (
              <p className="text-xs text-gray-400 italic">No financial data available for materiality computation.</p>
            )}
            {matProfile && (
              <div className="max-w-xl space-y-6">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800 mb-1">Materiality Framework</h2>
                  <p className="text-xs text-gray-500">
                    AICPA blended benchmark approach — averages multiple financial bases to produce a defensible planning materiality.
                  </p>
                </div>
                <MaterialityPanel profile={matProfile} />
                <div className="rounded border border-gray-100 bg-gray-50 p-3">
                  <p className="text-[11px] font-medium text-gray-600 mb-1">Computation detail</p>
                  <p className="text-[11px] text-gray-500 leading-relaxed">{matProfile.rationale}</p>
                </div>
                <div className="rounded border border-blue-100 bg-blue-50 p-3 text-[11px] text-blue-700">
                  <p className="font-semibold mb-1">How to use this</p>
                  <ul className="space-y-1 list-disc list-inside text-blue-600">
                    <li>Use <strong>overall materiality</strong> as the threshold for requiring an AJE.</li>
                    <li>Use <strong>performance materiality</strong> to set lower thresholds for testing.</li>
                    <li>Items below <strong>trivial threshold</strong> are typically passed without further review.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- TRENDS TAB --- */}
        {activeTab === 'trends' && (
          <div className="flex-1 overflow-auto p-6">
            {trendsLoading && <LoadingState />}
            {!trendsLoading && trendPeriodIds.length < 2 && (
              <div className="text-center py-12">
                <TrendingUp className="h-8 w-8 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">Need at least 2 periods</p>
                <p className="text-xs text-gray-400 mt-1">Import data for prior periods to enable trend analysis.</p>
              </div>
            )}
            {trendReport && (
              <div className="max-w-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800">Trend Analysis</h2>
                    <p className="text-xs text-gray-500">{trendReport.periods_analyzed} periods · {trendReport.period_names.join(' → ')}</p>
                  </div>
                  {trendReport.key_concerns.length > 0 && (
                    <span className="text-[10px] rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-semibold border border-red-200">
                      {trendReport.key_concerns.length} concern{trendReport.key_concerns.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {trendReport.key_concerns.length > 0 && (
                  <div className="rounded border border-red-100 bg-red-50 p-3">
                    <p className="text-[11px] font-semibold text-red-700 mb-1.5">Key Concerns</p>
                    <ul className="space-y-1">
                      {trendReport.key_concerns.map((c, i) => (
                        <li key={i} className="flex gap-1.5 text-[11px] text-red-600">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-1.5">
                  {trendReport.trends.map((t) => <TrendRow key={t.metric} trend={t} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- ADJUSTMENTS TAB --- */}
        {activeTab === 'adjustments' && (
          <div className="flex-1 overflow-auto p-6">
            {adjLoading && <LoadingState />}
            {adjReport && (
              <div className="max-w-2xl space-y-5">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Adjustment Analysis</h2>
                  <p className="text-xs text-gray-500">AJE patterns and concentrations as of {adjReport.as_of_date}</p>
                </div>

                {/* Summary */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Posted AJEs', value: adjReport.summary.total_posted, sub: `${fmt(adjReport.summary.total_amount_posted)} total`, color: 'text-gray-900' },
                    { label: 'Draft / Pending', value: adjReport.summary.total_draft, sub: `${fmt(adjReport.summary.total_amount_draft)} exposure`, color: adjReport.summary.total_draft > 5 ? 'text-amber-700' : 'text-gray-900' },
                  ].map(({ label, value, sub, color }) => (
                    <div key={label} className="rounded border border-gray-100 bg-gray-50 p-3">
                      <p className="text-[10px] text-gray-400">{label}</p>
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                      <p className="text-[10px] text-gray-400">{sub}</p>
                    </div>
                  ))}
                </div>

                {/* Concentration warning */}
                {adjReport.concentration_warning && (
                  <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 flex gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {adjReport.concentration_warning}
                  </div>
                )}

                {/* Patterns */}
                {adjReport.patterns.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-2">Detected Patterns</p>
                    <div className="space-y-2">
                      {adjReport.patterns.map((p) => {
                        const sev = p.severity as IssueSeverity
                        const c = SEV_CONFIG[sev] ?? SEV_CONFIG.moderate
                        return (
                          <div key={p.code} className={`rounded border ${c.border} ${c.bg} px-3 py-2`}>
                            <div className="flex items-center gap-2 mb-0.5">
                              <SevBadge severity={sev} />
                              <span className={`text-xs font-semibold ${c.text}`}>{p.title}</span>
                            </div>
                            <p className={`text-[11px] ${c.text}`}>{p.description}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Large AJEs */}
                {adjReport.large_ajes.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-2">AJEs at or above Materiality</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-gray-400">
                          <th className="pb-1 text-left font-medium">JE #</th>
                          <th className="pb-1 text-left font-medium">Description</th>
                          <th className="pb-1 text-right font-medium w-20">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adjReport.large_ajes.map((s) => (
                          <tr key={s.je_id} className="border-b border-gray-50">
                            <td className="py-1 font-mono text-gray-600">
                              <Link to={`/adjustments/journal-entries/${s.je_id}`} className="hover:text-blue-600">{s.je_number}</Link>
                            </td>
                            <td className="py-1 text-gray-700 truncate max-w-[200px]">{s.description}</td>
                            <td className="py-1 text-right tabular-nums font-semibold text-gray-800">{fmt(s.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {adjReport.patterns.length === 0 && adjReport.large_ajes.length === 0 && adjReport.summary.total_posted === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle className="h-7 w-7 text-emerald-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-600">No adjustments found</p>
                    <p className="text-xs text-gray-400 mt-1">Create AJEs in the Adjustments workspace to see analysis here.</p>
                  </div>
                )}
              </div>
            )}
            {!adjLoading && !adjReport && (
              <div className="text-center py-8">
                <p className="text-xs text-gray-400">Select a period to analyze adjustments.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
