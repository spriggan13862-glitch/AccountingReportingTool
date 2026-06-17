import type { ReactNode } from 'react'
import { PageLayout } from './PageLayout'

interface PageShellProps {
  title: string
  subtitle?: string
  breadcrumb?: ReactNode
  actions?: ReactNode
  rightColumn?: ReactNode
  children: ReactNode
}

export function PageShell({ title, subtitle, breadcrumb, actions, rightColumn, children }: PageShellProps) {
  return (
    <PageLayout title={title} subtitle={subtitle} breadcrumb={breadcrumb} actions={actions}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8">{children}</div>
          {rightColumn && (
            <aside className="lg:col-span-4">{rightColumn}</aside>
          )}
        </div>
      </div>
    </PageLayout>
  )
}

export default PageShell
