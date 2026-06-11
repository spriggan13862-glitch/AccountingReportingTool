import { cn } from '@/utils/cn'

type WorkspaceStatus =
  | 'draft'
  | 'ready'
  | 'out_of_balance'
  | 'mapped'
  | 'validated'
  | 'posted'
  | 'needs_review'
  | 'finalized'
  | 'failed'
  | 'pending'
  | 'applied'
  | 'mapping_required'

const STATUS_CONFIG: Record<WorkspaceStatus, { label: string; className: string }> = {
  draft:            { label: 'Draft',            className: 'bg-slate-100 text-slate-600 border-slate-200' },
  ready:            { label: 'Ready',            className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  out_of_balance:   { label: 'Out of Balance',   className: 'bg-rose-50 text-rose-700 border-rose-200' },
  mapped:           { label: 'Mapped',           className: 'bg-blue-50 text-blue-700 border-blue-200' },
  validated:        { label: 'Validated',        className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  posted:           { label: 'Posted',           className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  needs_review:     { label: 'Needs Review',     className: 'bg-amber-50 text-amber-700 border-amber-200' },
  finalized:        { label: 'Finalized',        className: 'bg-violet-50 text-violet-700 border-violet-200' },
  failed:           { label: 'Failed',           className: 'bg-rose-50 text-rose-700 border-rose-200' },
  pending:          { label: 'Pending',          className: 'bg-slate-100 text-slate-600 border-slate-200' },
  applied:          { label: 'Applied',          className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  mapping_required: { label: 'Mapping Required', className: 'bg-amber-50 text-amber-700 border-amber-200' },
}

interface WorkspaceStatusBadgeProps {
  status: WorkspaceStatus | string
  className?: string
}

export function WorkspaceStatusBadge({ status, className }: WorkspaceStatusBadgeProps) {
  const config = STATUS_CONFIG[status as WorkspaceStatus]
  const label = config?.label ?? status
  const styles = config?.className ?? 'bg-slate-100 text-slate-600 border-slate-200'

  return (
    <span
      data-testid={`ws-status-${status}`}
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border',
        styles,
        className,
      )}
    >
      {label}
    </span>
  )
}
