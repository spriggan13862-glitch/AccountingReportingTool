import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Play, AlertTriangle, Info, Loader, ChevronDown, ChevronRight } from 'lucide-react'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'
import {
  evaluateRules,
  getMetricCatalog,
  type TriggeredIssue,
  type MetricsDict,
} from '@/api/accountingIntelligence'

const EXAMPLE_METRICS: MetricsDict = {
  current_ratio: 0.85,
  dso: 65,
  revenue_pct_change: 42,
  accounts_receivable_pct_change: 80,
  beneish_m_score: -1.5,
  ghost_vendor_indicators: true,
}

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  moderate: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
}

function TriggeredIssueRow({ issue }: { issue: TriggeredIssue }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        data-testid={`issue-row-${issue.code}`}
      >
        <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded border ${RISK_COLORS[issue.risk_level] ?? 'bg-slate-100 text-slate-700'}`}>
          {issue.risk_level}
        </span>
        <span className="font-mono text-xs text-slate-400 flex-shrink-0">{issue.code}</span>
        <span className="text-sm text-slate-800 flex-1 truncate">{issue.name}</span>
        <span className="flex-shrink-0 text-xs font-bold text-slate-600 w-10 text-right">
          {issue.score}
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs space-y-1.5">
          <p className="text-slate-500"><span className="font-semibold text-slate-700">Category:</span> {issue.category}</p>
          <p className="text-slate-500"><span className="font-semibold text-slate-700">Rule type:</span> {issue.rule_type}</p>
          <p className="text-slate-500"><span className="font-semibold text-slate-700">Score:</span> {issue.score}/100</p>
          {issue.magnitude != null && (
            <p className="text-slate-500"><span className="font-semibold text-slate-700">Magnitude:</span> {issue.magnitude.toFixed(3)}</p>
          )}
          <p className="text-slate-500 font-mono bg-white border border-slate-200 rounded p-2">{issue.explanation}</p>
        </div>
      )}
    </div>
  )
}

export function RuleHarnessPage() {
  const [metricsText, setMetricsText] = useState(
    JSON.stringify(EXAMPLE_METRICS, null, 2),
  )
  const [parseError, setParseError] = useState<string | null>(null)
  const [showCatalog, setShowCatalog] = useState(false)

  const { data: catalog } = useQuery({
    queryKey: ['metric-catalog'],
    queryFn: getMetricCatalog,
  })

  const mutation = useMutation({
    mutationFn: (metrics: MetricsDict) => evaluateRules(metrics),
  })

  function handleRun() {
    setParseError(null)
    let parsed: MetricsDict
    try {
      parsed = JSON.parse(metricsText)
    } catch {
      setParseError('Invalid JSON — check your metrics input')
      return
    }
    mutation.mutate(parsed)
  }

  const result = mutation.data
  const triggered = result?.triggered_issues ?? []
  const sortedTriggered = [...triggered].sort((a, b) => b.score - a.score)

  return (
    <PageLayout
      title="Rule Execution Harness"
      subtitle="Test detection rules against a metrics dictionary — paste values, run, see triggered issues"
      breadcrumb={
        <Breadcrumb items={[
          { label: 'Accounting Intelligence', href: '/intelligence/quarterly-review' },
          { label: 'Rule Harness' },
        ]} />
      }
      actions={<WorkspaceCrossLinks current="intelligence" />}
    >
      <div className="space-y-4" data-testid="rule-harness-page">

        <div className="grid grid-cols-2 gap-4">
          {/* Input panel */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Metrics Input
              </h3>
              <span className="text-[10px] text-slate-400">JSON dictionary</span>
            </div>
            <textarea
              data-testid="metrics-input"
              value={metricsText}
              onChange={(e) => setMetricsText(e.target.value)}
              rows={18}
              className="w-full font-mono text-xs border border-slate-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
              spellCheck={false}
            />
            {parseError && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{parseError}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                data-testid="run-harness-btn"
                onClick={handleRun}
                disabled={mutation.isPending}
                className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {mutation.isPending ? (
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {mutation.isPending ? 'Running…' : 'Run Detection Rules'}
              </button>
              <button
                onClick={() => setMetricsText(JSON.stringify(EXAMPLE_METRICS, null, 2))}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Reset to example
              </button>
            </div>
          </div>

          {/* Results panel */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Results
              </h3>
              {result && (
                <span className="text-[10px] text-slate-400">
                  {result.total_triggered} triggered / {result.total_evaluated} evaluated
                </span>
              )}
            </div>

            {!result && !mutation.isPending && (
              <div
                className="flex flex-col items-center justify-center py-16 text-center text-slate-400"
                data-testid="harness-empty"
              >
                <Play className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">Run detection to see triggered issues</p>
              </div>
            )}

            {mutation.isPending && (
              <div className="flex items-center justify-center py-16">
                <Loader className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            )}

            {mutation.isError && (
              <p className="text-xs text-red-600 p-3 bg-red-50 border border-red-200 rounded-lg">
                Evaluation failed. Check the metrics format.
              </p>
            )}

            {result && (
              <div className="space-y-2" data-testid="harness-results">
                {result.metrics_validation.warning && (
                  <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {result.metrics_validation.warning}
                  </div>
                )}
                {sortedTriggered.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No rules triggered</p>
                ) : (
                  <div className="space-y-1.5 overflow-y-auto max-h-[420px] pr-1">
                    {sortedTriggered.map((issue) => (
                      <TriggeredIssueRow key={issue.code} issue={issue} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Metric catalog reference */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <button
            className="w-full flex items-center justify-between p-4 text-left"
            onClick={() => setShowCatalog((v) => !v)}
            data-testid="catalog-toggle"
          >
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Metric Catalog Reference
            </h3>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              {catalog && (
                <span>{catalog.total_quantitative} quantitative · {catalog.total_qualitative} qualitative flags</span>
              )}
              {showCatalog ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </div>
          </button>
          {showCatalog && catalog && (
            <div className="p-4 border-t border-slate-200" data-testid="catalog-panel">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Quantitative Metrics ({catalog.total_quantitative})
                  </p>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {Object.entries(catalog.quantitative_metrics).map(([key, meta]) => (
                      <div key={key} className="flex items-start gap-2">
                        <code className="text-[10px] font-mono text-indigo-700 flex-shrink-0 w-48 truncate">{key}</code>
                        <span className="text-[10px] text-slate-500">{meta.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Qualitative Flags ({catalog.total_qualitative})
                  </p>
                  <div className="columns-2 gap-2 max-h-64 overflow-y-auto">
                    {catalog.qualitative_flags.map((flag) => (
                      <code key={flag} className="block text-[10px] font-mono text-slate-600 truncate">{flag}</code>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </PageLayout>
  )
}
