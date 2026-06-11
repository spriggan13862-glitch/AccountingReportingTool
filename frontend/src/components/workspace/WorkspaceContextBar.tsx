import { Building2, Calendar, BarChart2, GitBranch } from 'lucide-react'
import { useWorkspace } from '@/providers/WorkspaceProvider'

interface WorkspaceContextBarProps {
  period?: string
  scenario?: string
  reportingView?: string
}

export function WorkspaceContextBar({ period, scenario, reportingView }: WorkspaceContextBarProps) {
  const { activeEntity } = useWorkspace()

  const hasAny = activeEntity || period || scenario || reportingView
  if (!hasAny) return null

  return (
    <div
      data-testid="workspace-context-bar"
      className="flex items-center gap-3 px-6 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 flex-wrap"
    >
      {activeEntity && (
        <ContextPill
          icon={<Building2 className="w-3 h-3" />}
          label="Entity"
          value={activeEntity.name}
          testid="ctx-entity"
        />
      )}
      {period && (
        <ContextPill
          icon={<Calendar className="w-3 h-3" />}
          label="Period"
          value={period}
          testid="ctx-period"
        />
      )}
      {scenario && (
        <ContextPill
          icon={<GitBranch className="w-3 h-3" />}
          label="Scenario"
          value={scenario}
          testid="ctx-scenario"
        />
      )}
      {reportingView && (
        <ContextPill
          icon={<BarChart2 className="w-3 h-3" />}
          label="View"
          value={reportingView}
          testid="ctx-reporting-view"
        />
      )}
    </div>
  )
}

function ContextPill({
  icon,
  label,
  value,
  testid,
}: {
  icon: React.ReactNode
  label: string
  value: string
  testid: string
}) {
  return (
    <div data-testid={testid} className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-md shadow-sm">
      <span className="text-slate-400">{icon}</span>
      <span className="text-slate-400 font-medium">{label}:</span>
      <span className="text-slate-700 font-semibold">{value}</span>
    </div>
  )
}
