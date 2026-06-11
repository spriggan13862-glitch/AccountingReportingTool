import type { ReactNode } from 'react'

interface WorkspaceFilterBarProps {
  children: ReactNode
  className?: string
}

export function WorkspaceFilterBar({ children, className }: WorkspaceFilterBarProps) {
  return (
    <div
      data-testid="workspace-filter-bar"
      className={`flex items-center gap-3 px-6 py-2.5 bg-white border-b border-slate-200 flex-wrap ${className ?? ''}`}
    >
      {children}
    </div>
  )
}
