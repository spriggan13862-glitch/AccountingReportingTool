import type { ReactNode } from 'react'

interface WorkspaceToolbarProps {
  left?: ReactNode
  right?: ReactNode
  children?: ReactNode
}

export function WorkspaceToolbar({ left, right, children }: WorkspaceToolbarProps) {
  return (
    <div
      data-testid="workspace-toolbar"
      className="flex items-center justify-between px-6 py-2.5 bg-white border-b border-slate-200"
    >
      <div className="flex items-center gap-2">
        {left}
        {children}
      </div>
      {right && (
        <div className="flex items-center gap-2">{right}</div>
      )}
    </div>
  )
}
