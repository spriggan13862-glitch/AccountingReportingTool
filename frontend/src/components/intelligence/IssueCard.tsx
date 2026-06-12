import { ChevronRight } from 'lucide-react'
import type { DetectedIssue } from '@/api/accountingIntelligence'
import { SeverityBadge } from './SeverityBadge'

interface Props {
  issue: DetectedIssue
  onClick?: () => void
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

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  open:         { label: 'Open',         className: 'bg-red-50 text-red-600' },
  acknowledged: { label: 'Acknowledged', className: 'bg-amber-50 text-amber-700' },
  resolved:     { label: 'Resolved',     className: 'bg-green-50 text-green-700' },
  dismissed:    { label: 'Dismissed',    className: 'bg-slate-100 text-slate-500' },
}

export function IssueCard({ issue, onClick }: Props) {
  const statusCfg = STATUS_CONFIG[issue.status] ?? STATUS_CONFIG.open
  const categoryLabel = CATEGORY_LABELS[issue.category] ?? issue.category

  return (
    <button
      onClick={onClick}
      data-testid={`issue-card-${issue.issue_code}`}
      className="w-full text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <SeverityBadge severity={issue.severity} size="xs" />
            <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
              {categoryLabel}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusCfg.className}`}>
              {statusCfg.label}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-800 leading-tight">{issue.title}</p>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{issue.description}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1 group-hover:text-indigo-400 transition-colors" />
      </div>
    </button>
  )
}
