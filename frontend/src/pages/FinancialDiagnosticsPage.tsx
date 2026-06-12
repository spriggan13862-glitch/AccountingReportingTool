import { Activity, TrendingDown, Percent, Scale, AlertCircle } from 'lucide-react'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'

const DIAGNOSTIC_CATEGORIES = [
  {
    id: 'ratio-analysis',
    label: 'Ratio Analysis',
    icon: Percent,
    description: 'Liquidity, profitability, leverage, and efficiency ratios computed from adjusted trial balance.',
    metrics: ['Current Ratio', 'Quick Ratio', 'Gross Margin', 'EBITDA Margin', 'Debt/Equity', 'Asset Turnover'],
  },
  {
    id: 'trend-analysis',
    label: 'Trend Analysis',
    icon: TrendingDown,
    description: 'Multi-period trend detection across key financial line items.',
    metrics: ['Revenue Trend', 'Expense Trend', 'Working Capital Trend', 'Cash Flow Trend'],
  },
  {
    id: 'balance-check',
    label: 'Balance Validation',
    icon: Scale,
    description: 'Double-entry integrity checks and balance sheet equation verification.',
    metrics: ['Assets = Liabilities + Equity', 'Debit/Credit Balance', 'Inter-period Continuity'],
  },
  {
    id: 'anomaly-detection',
    label: 'Anomaly Detection',
    icon: AlertCircle,
    description: 'Statistical outlier detection across accounts, periods, and transaction patterns.',
    metrics: ['Account Balance Outliers', 'Transaction Volume Spikes', 'Unusual Entries', 'Round Number Bias'],
  },
]

export function FinancialDiagnosticsPage() {
  return (
    <PageLayout
      title="Financial Diagnostics"
      subtitle="Ratio analysis, trend detection, and anomaly identification across the adjusted trial balance"
      breadcrumb={
        <Breadcrumb items={[
          { label: 'Accounting Intelligence', href: '/intelligence/quarterly-review' },
          { label: 'Financial Diagnostics' },
        ]} />
      }
      actions={<WorkspaceCrossLinks current="intelligence" />}
    >
      <div className="space-y-4" data-testid="financial-diagnostics-page">

        <div className="grid grid-cols-2 gap-4">
          {DIAGNOSTIC_CATEGORIES.map(({ id, label, icon: Icon, description, metrics }) => (
            <div
              key={id}
              data-testid={`diagnostic-category-${id}`}
              className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-indigo-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {metrics.map((m) => (
                  <span key={m} className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{m}</span>
                ))}
              </div>
              <div className="border-t border-slate-100 pt-2">
                <span className="text-[10px] font-medium px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full uppercase tracking-wide">
                  Intelligence Engine — Coming Soon
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg" data-testid="diagnostics-notice">
          <Activity className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          <p className="text-xs text-indigo-700">
            Financial diagnostics will run automatically against the adjusted trial balance once the intelligence engine is activated. No additional configuration required.
          </p>
        </div>

      </div>
    </PageLayout>
  )
}
