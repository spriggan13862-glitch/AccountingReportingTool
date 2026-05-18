import { CheckCircle, XCircle, AlertCircle, HelpCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { TieOutStatus } from '@/types'

const ICONS = {
  untested: HelpCircle,
  in_tolerance: AlertCircle,
  out_of_tolerance: XCircle,
  tied: CheckCircle,
}

const COLORS = {
  untested: 'text-gray-400',
  in_tolerance: 'text-yellow-500',
  out_of_tolerance: 'text-red-500',
  tied: 'text-green-500',
}

interface TieOutIndicatorProps {
  status: TieOutStatus
  className?: string
}

export function TieOutIndicator({ status, className }: TieOutIndicatorProps) {
  const Icon = ICONS[status] ?? HelpCircle
  const color = COLORS[status] ?? 'text-gray-400'
  return (
    <Icon
      className={cn('h-4 w-4', color, className)}
      data-testid="tie-out-indicator"
      aria-label={`Tie-out: ${status}`}
    />
  )
}
