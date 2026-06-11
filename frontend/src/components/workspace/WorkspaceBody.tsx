import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface WorkspaceBodyProps {
  children: ReactNode
  className?: string
  noPadding?: boolean
}

export function WorkspaceBody({ children, className, noPadding }: WorkspaceBodyProps) {
  return (
    <div
      data-testid="workspace-body"
      className={cn(
        'flex flex-col flex-1 overflow-auto',
        !noPadding && 'p-6 gap-5',
        className,
      )}
    >
      {children}
    </div>
  )
}
