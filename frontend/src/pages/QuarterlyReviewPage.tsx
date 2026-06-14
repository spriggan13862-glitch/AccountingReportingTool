import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Brain, Loader, Download, FileText, ChevronDown, ChevronRight,
  AlertTriangle, TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { PeriodSelect } from '@/components/ui/PeriodSelect'
import {
  generateQuarterlyReview,
  downloadQuarterlyReview,
  type QuarterlyReviewReport,
  type FinancialChangeRow,
  type ReviewIssue,
  type ProcedureGroup,
} from '@/api/accountingIntelligence'

const RISK_BADGE: Record<string, string> = {
  elevated: 'bg-red-100 text-red-700 border border-red-200',
  moderate: 'bg-amber-100 text-amber-700 border border-amber-200',
  low: 'bg-green-100 text-green-700 border border-green-200',
}

const SEV_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  moderate: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
  informational: 'bg-slate-100 text-slate-500',
}

function Collapsible({ title, children, defaultOpen = true }: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{title}</span>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

function ChangeIcon({ direction }: { direction: FinancialChangeRow['direction'] }) {
  if (direction === 'increase') return <TrendingUp className="w-3 h-3 text-green-500 flex-shrink-0" />
  if (direction === 'decrease') return <TrendingDown className="w-3 h-3 text-red-500 flex-shrink-0" />
  return <Minus className="w-3 h-3 text-slate-300 flex-shrink-0" />
}

function FinancialTable({ rows }: { rows: FinancialChangeRow[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-slate-100">
          <th className="text-left py-1.5 text-slate-500 font-medium w-48">Metric</th>
          <th className="text-right py-1.5 text-slate-500 font-medium">Prior</th>
          <th className="text-right py-1.5 text-slate-500 font-medium">Current</th>
          <th className="text-right py-1.5 text-slate-500 font-medium">Change</th>
          <th className="w-6" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.metric}
            className={`border-b border-slate-50 ${row.significant ? 'bg-amber-50' : ''}`}
          >
            <td className="py-1.5 text-slate-700 font-medium">{row.label}</td>
            <td className="py-1.5 text-right text-slate-500">{row.prior_value}</td>
            <td className="py-1.5 text-right text-slate-700">{row.current_value}</td>
            <td className="py-1.5 text-right text-slate-600">
              {row.change_amount}
              {row.change_pct ? <span className="ml-1 text-slate-400">({row.change_pct})</span> : null}
            </td>
            <td className="py-1.5 pl-2"><ChangeIcon direction={row.direction} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function IssueList({ issues }: { issues: ReviewIssue[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  if (!issues.length) return <p className="text-xs text-slate-400 italic">No issues detected.</p>
  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <div key={issue.issue_code} className="border border-slate-100 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === issue.issue_code ? null : issue.issue_code)}
            className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
          >
            <span className={`flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${SEV_BADGE[issue.severity] ?? 'bg-slate-100 text-slate-600'}`}>
              {issue.severity.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-700">{issue.title}</p>
              <p className="text-[10px] text-slate-400">{issue.issue_code} · {issue.category}</p>
            </div>
            {expanded === issue.issue_code
              ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
              : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />}
          </button>
          {expanded === issue.issue_code && (
            <div className="px-3 pb-3 space-y-2 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-600 pt-2">{issue.description}</p>
              {issue.detection_trigger && (
                <p className="text-[10px] text-slate-500"><span className="font-semibold">Trigger:</span> {issue.detection_trigger}</p>
              )}
              {issue.management_questions.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Management Questions</p>
                  <ul className="space-y-0.5">
                    {issue.management_questions.map((q, i) => (
                      <li key={i} className="text-[10px] text-slate-600">• {q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ProcedureList({ groups, label }: { groups: ProcedureGroup[]; label: string }) {
  if (!groups.length) return <p className="text-xs text-slate-400 italic">No {label.toLowerCase()} generated.</p>
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.issue_code}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${SEV_BADGE[g.severity] ?? 'bg-slate-100 text-slate-600'}`}>
              {g.severity.toUpperCase()}
            </span>
            <p className="text-xs font-semibold text-slate-700">{g.title}</p>
          </div>
          <ul className="space-y-1 ml-2">
            {g.items.map((item, i) => (
              <li key={i} className="text-xs text-slate-600">• {item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function ReportView({
  report, entityId, currentPeriodId, comparisonPeriodId, materiality,
}: {
  report: QuarterlyReviewReport
  entityId: number
  currentPeriodId: number
  comparisonPeriodId: number
  materiality: number
}) {
  const summ = report.executive_summary
  return (
    <div className="space-y-4" data-testid="report-sections">
      {/* 1. Executive Summary */}
      <Collapsible title="1. Executive Summary">
        <div className="flex items-center gap-3 mb-3 pt-1">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${RISK_BADGE[summ.overall_risk] ?? 'bg-slate-100 text-slate-600'}`}>
            Risk: {summ.overall_risk.toUpperCase()}
          </span>
          <span className="text-xs text-slate-500">{summ.total_issues} issue{summ.total_issues !== 1 ? 's' : ''} detected</span>
        </div>
        <p className="text-xs text-slate-600 mb-3 leading-relaxed">{summ.narrative}</p>
        {summ.key_findings.length > 0 && (
          <ul className="space-y-1">
            {summ.key_findings.map((f, i) => (
              <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                <span className="text-indigo-400 flex-shrink-0 mt-0.5">•</span>
                {f}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={() => downloadQuarterlyReview('markdown', { entity_id: entityId, current_period_id: currentPeriodId, comparison_period_id: comparisonPeriodId, materiality_threshold: materiality })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            data-testid="export-markdown-btn"
          >
            <FileText className="w-3 h-3" />
            Export Markdown
          </button>
          <button
            onClick={() => downloadQuarterlyReview('excel', { entity_id: entityId, current_period_id: currentPeriodId, comparison_period_id: comparisonPeriodId, materiality_threshold: materiality })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            data-testid="export-excel-btn"
          >
            <Download className="w-3 h-3" />
            Export Excel
          </button>
        </div>
      </Collapsible>

      {/* 2. Key Financial Changes */}
      <Collapsible title="2. Key Financial Changes">
        <div className="mt-1 overflow-x-auto">
          <FinancialTable rows={report.key_financial_changes} />
        </div>
        {report.significant_variances.length > 0 && (
          <div className="mt-3 flex items-start gap-2 p-2 bg-amber-50 border border-amber-100 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700">
              <span className="font-semibold">{report.significant_variances.length} significant variance{report.significant_variances.length > 1 ? 's' : ''}</span> exceeded the materiality threshold.
            </p>
          </div>
        )}
      </Collapsible>

      {/* 3. Triggered Issues */}
      <Collapsible title={`3. Triggered Accounting Issues (${report.triggered_issues.length})`}>
        <div className="mt-1">
          <IssueList issues={report.triggered_issues} />
        </div>
      </Collapsible>

      {/* 4. Management Questions */}
      <Collapsible title="4. Management Questions" defaultOpen={false}>
        {report.management_questions.length > 0 ? (
          <ol className="space-y-1.5 mt-1">
            {report.management_questions.map((q, i) => (
              <li key={i} className="text-xs text-slate-600">
                <span className="font-semibold text-slate-400 mr-1.5">{i + 1}.</span>{q}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-slate-400 italic mt-1">No management questions generated.</p>
        )}
      </Collapsible>

      {/* 5. Suggested Procedures */}
      <Collapsible title="5. Suggested Procedures" defaultOpen={false}>
        <div className="mt-1">
          <ProcedureList groups={report.suggested_procedures} label="Procedures" />
        </div>
      </Collapsible>

      {/* 6. Suggested Adjustments */}
      <Collapsible title="6. Suggested Adjusting Journal Entries" defaultOpen={false}>
        <div className="mt-1">
          <ProcedureList groups={report.suggested_adjustments} label="AJEs" />
        </div>
      </Collapsible>

      {/* 7. Advisor Notes */}
      <Collapsible title="7. Advisor Notes" defaultOpen={false}>
        <pre className="mt-1 text-[10px] text-slate-600 leading-relaxed whitespace-pre-wrap font-mono bg-slate-50 rounded-lg p-3 border border-slate-100">
          {report.advisor_notes}
        </pre>
      </Collapsible>
    </div>
  )
}

export function QuarterlyReviewPage() {
  const [entityId, setEntityId] = useState<number | ''>('')
  const [currentPeriodId, setCurrentPeriodId] = useState<number | ''>('')
  const [comparisonPeriodId, setComparisonPeriodId] = useState<number | ''>('')
  const [materiality, setMateriality] = useState<number>(1000)
  const [report, setReport] = useState<QuarterlyReviewReport | null>(null)

  const canRun = !!entityId && !!currentPeriodId && !!comparisonPeriodId

  const reviewMutation = useMutation({
    mutationFn: () =>
      generateQuarterlyReview({
        entity_id: entityId as number,
        current_period_id: currentPeriodId as number,
        comparison_period_id: comparisonPeriodId as number,
        materiality_threshold: materiality,
      }),
    onSuccess: (data) => setReport(data),
  })

  return (
    <PageLayout
      title="Quarterly Review"
      subtitle="Generate a full 8-section quarterly review report"
      breadcrumb={
        <Breadcrumb items={[
          { label: 'Accounting Intelligence', href: '/intelligence/quarterly-review' },
          { label: 'Quarterly Review' },
        ]} />
      }
      actions={<WorkspaceCrossLinks current="intelligence" />}
    >
      <div className="space-y-5" data-testid="quarterly-review-page">

        {/* Inputs */}
        <div className="bg-white border border-slate-200 rounded-lg p-4" data-testid="period-inputs">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">Report Inputs</h3>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Entity</label>
              <EntitySelect value={entityId} onChange={(v) => setEntityId(v ?? '')} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Materiality Threshold ($)</label>
              <input
                type="number"
                data-testid="materiality-input"
                value={materiality}
                min={0}
                onChange={(e) => setMateriality(Number(e.target.value))}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Current Period</label>
              <PeriodSelect
                entityId={entityId}
                value={currentPeriodId}
                onChange={(v) => setCurrentPeriodId(v ?? '')}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Comparison Period</label>
              <PeriodSelect
                entityId={entityId}
                value={comparisonPeriodId}
                onChange={(v) => setComparisonPeriodId(v ?? '')}
              />
            </div>
          </div>
          <button
            data-testid="run-review-btn"
            disabled={!canRun || reviewMutation.isPending}
            onClick={() => reviewMutation.mutate()}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {reviewMutation.isPending
              ? <Loader className="w-3.5 h-3.5 animate-spin" />
              : <Brain className="w-3.5 h-3.5" />}
            {reviewMutation.isPending ? 'Generating Report…' : 'Generate Quarterly Report'}
          </button>
          {reviewMutation.isError && (
            <p className="mt-2 text-xs text-red-600">Report generation failed. Check your selections and try again.</p>
          )}
        </div>

        {/* Configure state */}
        {!canRun && (
          <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="configure-state">
            <Brain className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-medium text-slate-500">Select entity and periods to begin</p>
            <p className="text-xs text-slate-400 mt-1">Choose current and comparison periods, then generate the quarterly report.</p>
          </div>
        )}

        {/* Loading state */}
        {reviewMutation.isPending && (
          <div className="flex items-center justify-center py-8">
            <Loader className="w-5 h-5 animate-spin text-indigo-400" />
            <p className="ml-2 text-xs text-slate-500">Running detection engine and building report…</p>
          </div>
        )}

        {/* Report */}
        {report && (
          <ReportView
            report={report}
            entityId={entityId as number}
            currentPeriodId={currentPeriodId as number}
            comparisonPeriodId={comparisonPeriodId as number}
            materiality={materiality}
          />
        )}

      </div>
    </PageLayout>
  )
}
