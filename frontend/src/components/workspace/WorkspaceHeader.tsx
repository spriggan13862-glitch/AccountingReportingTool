import type { ReactNode } from 'react'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import type { BreadcrumbItem } from '@/components/ui/Breadcrumb'

interface WorkspaceHeaderProps {
  title: string
  description?: string
  breadcrumbs?: BreadcrumbItem[]
  status?: ReactNode
  actions?: ReactNode
}

export function WorkspaceHeader({ title, description, breadcrumbs, status, actions }: WorkspaceHeaderProps) {
  return (
    <div data-testid="workspace-header" className="px-6 pt-5 pb-4 border-b border-slate-200 bg-white">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-[11px] text-slate-400 mb-2" aria-label="Breadcrumb">
          <Breadcrumb items={breadcrumbs} />
        </nav>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 leading-tight">{title}</h1>
            {description && (
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            )}
          </div>
          {status && <div className="shrink-0">{status}</div>}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </div>
  )
}
