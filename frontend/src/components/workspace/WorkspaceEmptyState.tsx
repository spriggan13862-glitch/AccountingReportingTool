import { InboxIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface WorkspaceEmptyStateProps {
  title?: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}

export function WorkspaceEmptyState({
  title = 'Nothing here yet',
  description = 'No items to display.',
  action,
  icon,
  className,
}: WorkspaceEmptyStateProps) {
  return (
    <div
      data-testid="workspace-empty-state"
      className={cn('flex flex-col items-center justify-center py-16 text-slate-400', className)}
    >
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4 text-slate-300">
        {icon ?? <InboxIcon className="w-6 h-6" />}
      </div>
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      <p className="text-xs text-slate-400 mt-1 text-center max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
