import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
  {
    variants: {
      variant: {
        default: 'bg-gray-100 text-gray-700 ring-gray-200',
        success: 'bg-green-50 text-green-700 ring-green-200',
        warning: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
        error: 'bg-red-50 text-red-700 ring-red-200',
        info: 'bg-blue-50 text-blue-700 ring-blue-200',
        critical: 'bg-purple-50 text-purple-700 ring-purple-200',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: React.ReactNode
  className?: string
}

export function Badge({ variant, children, className }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>
}

// Semantic helpers used across the app

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, VariantProps<typeof badgeVariants>['variant']> = {
    pending: 'warning',
    running: 'info',
    open: 'warning',
    in_progress: 'info',
    blocked: 'error',
    review: 'info',
    completed: 'success',
    rejected: 'error',
    failed: 'error',
    posted: 'success',
    draft: 'default',
    reversed: 'default',
    approved: 'success',
    resolved: 'success',
    dismissed: 'default',
    investigating: 'info',
  }
  return <Badge variant={map[status] ?? 'default'}>{status.replace('_', ' ')}</Badge>
}

export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, VariantProps<typeof badgeVariants>['variant']> = {
    info: 'info',
    warning: 'warning',
    error: 'error',
    critical: 'critical',
  }
  return <Badge variant={map[severity] ?? 'default'}>{severity}</Badge>
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, VariantProps<typeof badgeVariants>['variant']> = {
    low: 'default',
    medium: 'info',
    high: 'warning',
    critical: 'critical',
  }
  return <Badge variant={map[priority] ?? 'default'}>{priority}</Badge>
}
