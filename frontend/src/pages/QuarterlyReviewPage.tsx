import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Brain, Loader, AlertTriangle, RefreshCw, BookOpen, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { PeriodSelect } from '@/components/ui/PeriodSelect'
import { IssueCard } from '@/components/intelligence/IssueCard'
import { IssueDetailDrawer } from '@/components/intelligence/IssueDetailDrawer'
import { IssueSummaryWidget } from '@/components/intelligence/IssueSummaryWidget'
import {
  runDetection,
  listDetectedIssues,
  updateIssueStatus,
  listRepository,
  type DetectedIssue,
  type IssueStatus,
  type IssueTemplate,
} from '@/api/accountingIntelligence'

const RISK_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  moderate: 'bg-amber-100 text-amber-700',
  low:      'bg-green-100 text-green-700',
}

function SuggestedTemplatesPanel({ detectedCategories }: { detectedCategories: string[] }) {
  const uniqueCats = [...new Set(detectedCategories)].slice(0, 3)

  const { data: templates } = useQuery({
    queryKey: ['repository-templates-review', uniqueCats],
    queryFn: async () => {
      const results = await Promise.all(
        uniqueCats.map((cat) => listRepository({ category: cat }))
      )
      return results.flat().slice(0, 6)
    },
    enabled: uniqueCats.length > 0,
  })

  if (!templates || templates.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4" data-testid="suggested-templates">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-500" />
          <h3 className="text-xs font-semibold text-slate-700">Suggested Review Templates</h3>
        </div>
        <Link
          to="/intelligence/issue-repository"
          className="flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800"
        >
          View full repository <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="space-y-2">
        {templates.map((t: IssueTemplate) => (
          <Link
            key={t.code}
            to={`/intelligence/issue-repository?code=${t.code}`}
            className="flex items-start justify-between gap-2 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-700 truncate group-hover:text-indigo-700">{t.name}</p>
              <p className="text-[10px] text-slate-400 truncate">{t.code} · {t.category.replace(/_/g, ' ')}</p>
            </div>
            <span className={`flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${RISK_BADGE[t.risk_level] ?? 'bg-slate-100 text-slate-600'}`}>
              {t.risk_level}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

const CATEGORY_LABELS: Record<string, string> = {
  accounts_receivable: 'Accounts Receivable',
  revenue_recognition: 'Revenue Recognition',
  inventory: 'Inventory',
  cash: 'Cash',
  payroll: 'Payroll',
  debt: 'Debt',
  working_capital: 'Working Capital',
  gross_margin: 'Gross Margin',
  equity: 'Equity',
  expense_fluctuation: 'Expense Fluctuation',
}

export function QuarterlyReviewPage() {
  const qc = useQueryClient()
  const [entityId, setEntityId] = useState<number | ''>('')
  const [currentPeriodId, setCurrentPeriodId] = useState<number | ''>('')
  const [comparisonPeriodId, setComparisonPeriodId] = useState<number | ''>('')
  const [selectedIssue, setSelectedIssue] = useState<DetectedIssue | null>(null)

  const canRun = !!entityId && !!currentPeriodId && !!comparisonPeriodId

  const { data: existingIssues, isLoading: loadingExisting } = useQuery({
    queryKey: ['detected-issues', entityId, currentPeriodId],
    queryFn: () =>
      listDetectedIssues({ entity_id: entityId as number, current_period_id: currentPeriodId as number }),
    enabled: !!entityId && !!currentPeriodId,
    select: (d) => d.issues,
  })

  const detection = useMutation({
    mutationFn: () =>
      runDetection({
        entity_id: entityId as number,
        current_period_id: currentPeriodId as number,
        comparison_period_id: comparisonPeriodId as number,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['detected-issues', entityId, currentPeriodId] })
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: IssueStatus }) =>
      updateIssueStatus(id, status),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['detected-issues', entityId, currentPeriodId] })
      setSelectedIssue(updated)
    },
  })

  const issues = detection.data?.issues ?? existingIssues ?? []

  const issuesByCategory = issues.reduce<Record<string, DetectedIssue[]>>((acc, issue) => {
    const cat = issue.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(issue)
    return acc
  }, {})

  const criticalOrHigh = issues.filter((i) => ['critical', 'high'].includes(i.severity) && i.status === 'open')

  return (
    <PageLayout
      title="Quarterly Review"
      subtitle="Run the detection engine to automatically identify potential accounting issues"
      breadcrumb={
        <Breadcrumb items={[
          { label: 'Accounting Intelligence', href: '/intelligence/quarterly-review' },
          { label: 'Quarterly Review' },
        ]} />
      }
      actions={<WorkspaceCrossLinks current="intelligence" />}
    >
      <div className="space-y-5" data-testid="quarterly-review-page">

        {/* Detection Inputs */}
        <div className="bg-white border border-slate-200 rounded-lg p-4" data-testid="period-inputs">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">Detection Inputs</h3>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Entity</label>
              <EntitySelect value={entityId} onChange={(v) => setEntityId(v ?? '')} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Current Period</label>
              <PeriodSelect
                entityId={entityId || undefined}
                value={currentPeriodId}
                onChange={(v) => setCurrentPeriodId(v ?? '')}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Comparison Period</label>
              <PeriodSelect
                entityId={entityId || undefined}
                value={comparisonPeriodId}
                onChange={(v) => setComparisonPeriodId(v ?? '')}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              data-testid="run-review-btn"
              disabled={!canRun || detection.isPending}
              onClick={() => detection.mutate()}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {detection.isPending ? (
                <Loader className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Brain className="w-3.5 h-3.5" />
              )}
              {detection.isPending ? 'Running Detection…' : 'Run Detection Engine'}
            </button>
            {issues.length > 0 && (
              <button
                onClick={() => detection.mutate()}
                disabled={!canRun || detection.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Re-run
              </button>
            )}
          </div>
          {detection.isError && (
            <p className="mt-2 text-xs text-red-600">Detection failed. Check period selection and try again.</p>
          )}
        </div>

        {/* Results */}
        {loadingExisting && (
          <div className="flex items-center justify-center py-8">
            <Loader className="w-5 h-5 animate-spin text-indigo-400" />
          </div>
        )}

        {issues.length > 0 && (
          <>
            <IssueSummaryWidget issues={issues} />

            <SuggestedTemplatesPanel detectedCategories={issues.map((i) => i.category)} />

            {criticalOrHigh.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg" data-testid="critical-alert">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">
                  <span className="font-semibold">{criticalOrHigh.length} high-priority</span> issue{criticalOrHigh.length > 1 ? 's' : ''} detected requiring immediate attention.
                </p>
              </div>
            )}

            <div className="space-y-5" data-testid="issues-by-category">
              {Object.entries(issuesByCategory).map(([cat, catIssues]) => (
                <div key={cat} data-testid={`category-${cat}`}>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                    {CATEGORY_LABELS[cat] ?? cat} ({catIssues.length})
                  </p>
                  <div className="space-y-2">
                    {catIssues.map((issue) => (
                      <IssueCard
                        key={issue.issue_code + (issue.id ?? '')}
                        issue={issue}
                        onClick={() => setSelectedIssue(issue)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!loadingExisting && issues.length === 0 && canRun && !detection.isPending && (
          <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="no-issues-state">
            <Brain className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-medium text-slate-500">No issues detected</p>
            <p className="text-xs text-slate-400 mt-1">Run the detection engine to analyze this period pair.</p>
          </div>
        )}

        {!canRun && (
          <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="configure-state">
            <Brain className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-medium text-slate-500">Select entity and periods to begin</p>
            <p className="text-xs text-slate-400 mt-1">Choose current and comparison periods, then run the detection engine.</p>
          </div>
        )}

      </div>

      <IssueDetailDrawer
        issue={selectedIssue}
        onClose={() => setSelectedIssue(null)}
        onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
      />
    </PageLayout>
  )
}
