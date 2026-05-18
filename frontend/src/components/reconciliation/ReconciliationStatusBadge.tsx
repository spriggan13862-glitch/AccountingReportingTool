import { cn } from '@/utils/cn'
import type { ReconciliationStatus } from '@/types'

const STATUS_STYLES: Record<ReconciliationStatus, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  prepared: 'bg-yellow-100 text-yellow-700',
  reviewed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  rolled_forward: 'bg-purple-100 text-purple-700',
}

const STATUS_LABELS: Record<ReconciliationStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  prepared: 'Prepared',
  reviewed: 'Reviewed',
  rejected: 'Rejected',
  rolled_forward: 'Rolled Forward',
}

interface ReconciliationStatusBadgeProps {
  status: ReconciliationStatus
  className?: string
}

export function ReconciliationStatusBadge({ status, className }: ReconciliationStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600',
        className,
      )}
      data-testid="recon-status-badge"
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
