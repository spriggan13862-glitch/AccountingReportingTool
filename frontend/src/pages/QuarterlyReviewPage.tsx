import { useState } from 'react'
import { CalendarCheck, TrendingUp, AlertTriangle, HelpCircle, SlidersHorizontal, Brain } from 'lucide-react'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'

const OUTPUT_SECTIONS = [
  { id: 'variance-review', label: 'Variance Review', icon: TrendingUp, description: 'Period-over-period movement analysis with materiality thresholds.' },
  { id: 'risk-indicators', label: 'Risk Indicators', icon: AlertTriangle, description: 'Accounts and ratios outside expected ranges flagged for follow-up.' },
  { id: 'accounting-issues', label: 'Potential Accounting Issues', icon: Brain, description: 'Pattern-matched issues surfaced from transaction data.' },
  { id: 'follow-up', label: 'Suggested Follow-Up Questions', icon: HelpCircle, description: 'Client inquiry questions generated from anomalies identified.' },
  { id: 'suggested-adjustments', label: 'Suggested Adjustments', icon: SlidersHorizontal, description: 'Draft AJEs proposed based on detected issues.' },
]

export function QuarterlyReviewPage() {
  const [currentPeriod, setCurrentPeriod] = useState('')
  const [priorPeriod, setPriorPeriod] = useState('')

  return (
    <PageLayout
      title="Quarterly Review"
      subtitle="Structured period-over-period review — identify variances, risks, and adjustment opportunities"
      breadcrumb={
        <Breadcrumb items={[
          { label: 'Accounting Intelligence', href: '/intelligence/quarterly-review' },
          { label: 'Quarterly Review' },
        ]} />
      }
      actions={<WorkspaceCrossLinks current="intelligence" />}
    >
      <div className="space-y-6" data-testid="quarterly-review-page">

        {/* Input panel */}
        <div className="bg-white border border-slate-200 rounded-lg p-4" data-testid="period-inputs">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">Review Inputs</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Current Period</label>
              <input
                type="month"
                data-testid="current-period-input"
                value={currentPeriod}
                onChange={(e) => setCurrentPeriod(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Prior Period</label>
              <input
                type="month"
                data-testid="prior-period-input"
                value={priorPeriod}
                onChange={(e) => setPriorPeriod(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          </div>
          <button
            data-testid="run-review-btn"
            disabled={!currentPeriod || !priorPeriod}
            className="mt-3 px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Run Quarterly Review
          </button>
        </div>

        {/* Output sections (placeholders) */}
        <div className="grid grid-cols-1 gap-3" data-testid="output-sections">
          {OUTPUT_SECTIONS.map(({ id, label, icon: Icon, description }) => (
            <div
              key={id}
              data-testid={`output-section-${id}`}
              className="bg-white border border-dashed border-slate-300 rounded-lg p-4 flex items-start gap-3"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-indigo-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{description}</p>
                <span className="inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full uppercase tracking-wide">
                  Intelligence Engine — Coming Soon
                </span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </PageLayout>
  )
}
