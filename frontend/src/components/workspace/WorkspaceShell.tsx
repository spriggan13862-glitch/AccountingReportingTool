import type { ReactNode } from 'react'

interface WorkspaceShellProps {
  children: ReactNode
}

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  return (
    <div data-testid="workspace-shell" className="flex flex-col gap-0 h-full">
      {children}
    </div>
  )
}
