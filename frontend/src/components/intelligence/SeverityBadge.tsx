import type { IssueSeverity } from '@/api/accountingIntelligence'

interface Props {
  severity: IssueSeverity
  size?: 'sm' | 'xs'
}

const CONFIG: Record<IssueSeverity, { label: string; className: string }> = {
  informational: { label: 'Info',     className: 'bg-slate-100 text-slate-600' },
  low:           { label: 'Low',      className: 'bg-blue-50 text-blue-600' },
  moderate:      { label: 'Moderate', className: 'bg-amber-50 text-amber-700' },
  high:          { label: 'High',     className: 'bg-orange-50 text-orange-700' },
  critical:      { label: 'Critical', className: 'bg-red-50 text-red-700 font-semibold' },
}

export function SeverityBadge({ severity, size = 'sm' }: Props) {
  const { label, className } = CONFIG[severity] ?? CONFIG.informational
  const sizeClass = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${className}`}>
      {label}
    </span>
  )
}
