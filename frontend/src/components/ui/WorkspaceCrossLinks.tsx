import { Link } from 'react-router-dom'

type WorkspaceId = 'adjustment' | 'analysis' | 'deliverables'

const WORKSPACES: { id: WorkspaceId; label: string; to: string }[] = [
  { id: 'adjustment', label: 'Adjustments', to: '/workbench/adjustment-workspace' },
  { id: 'analysis', label: 'Analysis', to: '/financial-impact/statements' },
  { id: 'deliverables', label: 'Deliverables', to: '/deliverables/workspace' },
]

export function WorkspaceCrossLinks({ current }: { current: WorkspaceId }) {
  return (
    <div className="flex items-center gap-1.5" data-testid="workspace-cross-links">
      <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mr-1">Workspaces</span>
      {WORKSPACES.map((ws) =>
        ws.id === current ? (
          <span
            key={ws.id}
            className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-white font-medium"
            data-testid={`cross-link-${ws.id}`}
          >
            {ws.label}
          </span>
        ) : (
          <Link
            key={ws.id}
            to={ws.to}
            className="text-xs px-2.5 py-1 rounded-full border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors"
            data-testid={`cross-link-${ws.id}`}
          >
            {ws.label}
          </Link>
        )
      )}
    </div>
  )
}
