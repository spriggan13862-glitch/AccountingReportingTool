import { formatCurrencyCompact } from '@/lib/format'
import { cn } from '@/utils/cn'
import type { TieOutStatus } from '@/types'

const TIE_OUT_STYLES: Record<TieOutStatus, string> = {
  untested: 'bg-gray-100 text-gray-500',
  in_tolerance: 'bg-yellow-100 text-yellow-700',
  out_of_tolerance: 'bg-red-100 text-red-700',
  tied: 'bg-green-100 text-green-700',
}

const TIE_OUT_LABELS: Record<TieOutStatus, string> = {
  untested: 'Untested',
  in_tolerance: 'In Tolerance',
  out_of_tolerance: 'Out of Tolerance',
  tied: 'Tied',
}

interface VarianceBadgeProps {
  variance: string | null
  tieOutStatus: TieOutStatus
  className?: string
}

function fmt(val: string | null) {
  if (val === null || val === undefined) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  const prefix = n > 0.005 ? '+' : ''
  return prefix + formatCurrencyCompact(n)
}

export function VarianceBadge({ variance, tieOutStatus, className }: VarianceBadgeProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)} data-testid="variance-badge">
      <span className="tabular-nums text-xs font-mono">{fmt(variance)}</span>
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
          TIE_OUT_STYLES[tieOutStatus],
        )}
        data-testid="tie-out-badge"
      >
        {TIE_OUT_LABELS[tieOutStatus]}
      </span>
    </div>
  )
}
