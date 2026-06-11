interface PageLayoutProps {
  title: string
  subtitle?: string
  breadcrumb?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}

export function PageLayout({ title, subtitle, breadcrumb, actions, children }: PageLayoutProps) {
  return (
    <div className="flex flex-col gap-6 p-6">
      {breadcrumb && (
        <nav className="flex items-center gap-1 text-[11px] text-slate-400" aria-label="Breadcrumb">
          {breadcrumb}
        </nav>
      )}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
