import { AlertTriangle, AlertCircle, Info, ShieldAlert } from 'lucide-react'
import type { DetectedIssue, IssueSeverity } from '@/api/accountingIntelligence'

interface Props {
  issues: DetectedIssue[]
}

const SEVERITY_ORDER: IssueSeverity[] = ['critical', 'high', 'moderate', 'low', 'informational']

const SEV_CONFIG: Record<IssueSeverity, {
  label: string
  icon: React.ElementType
  cardClass: string
  countClass: string
}> = {
  critical:      { label: 'Critical',  icon: ShieldAlert,    cardClass: 'bg-red-50 border-red-200',    countClass: 'text-red-700' },
  high:          { label: 'High',      icon: AlertTriangle,  cardClass: 'bg-orange-50 border-orange-200', countClass: 'text-orange-700' },
  moderate:      { label: 'Moderate',  icon: AlertCircle,    cardClass: 'bg-amber-50 border-amber-200', countClass: 'text-amber-700' },
  low:           { label: 'Low',       icon: AlertCircle,    cardClass: 'bg-blue-50 border-blue-100',  countClass: 'text-blue-700' },
  informational: { label: 'Info',      icon: Info,           cardClass: 'bg-slate-50 border-slate-200', countClass: 'text-slate-700' },
}

export function IssueSummaryWidget({ issues }: Props) {
  const counts = issues.reduce<Record<IssueSeverity, number>>(
    (acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1
      return acc
    },
    { critical: 0, high: 0, moderate: 0, low: 0, informational: 0 },
  )

  const openCount = issues.filter((i) => i.status === 'open').length

  return (
    <div className="space-y-3" data-testid="issue-summary-widget">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700">Detected Issues</p>
        <span className="text-xs text-slate-500">{openCount} open</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {SEVERITY_ORDER.map((sev) => {
          const { label, icon: Icon, cardClass, countClass } = SEV_CONFIG[sev]
          const count = counts[sev]
          return (
            <div
              key={sev}
              data-testid={`sev-count-${sev}`}
              className={`border rounded-lg p-2 text-center ${cardClass}`}
            >
              <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${countClass}`} />
              <p className={`text-base font-bold leading-none ${countClass}`}>{count}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
