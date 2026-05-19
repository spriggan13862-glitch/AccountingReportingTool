import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, CheckCircle, AlertCircle, Clock, XCircle, ChevronRight } from 'lucide-react'
import { closeApi } from '@/api/closeManagement'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { useOrg } from '@/providers/OrgProvider'
import type { CloseChecklist, CloseChecklistStatus } from '@/types'

function statusBadge(status: CloseChecklistStatus) {
  const map: Record<CloseChecklistStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    open:        { label: 'Open',        cls: 'bg-gray-100 text-gray-700',    icon: <Clock className="w-3 h-3" /> },
    in_progress: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700',    icon: <Clock className="w-3 h-3" /> },
    review:      { label: 'Under Review',cls: 'bg-yellow-100 text-yellow-800',icon: <AlertCircle className="w-3 h-3" /> },
    approved:    { label: 'Approved',    cls: 'bg-green-100 text-green-700',  icon: <CheckCircle className="w-3 h-3" /> },
    closed:      { label: 'Closed',      cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> },
  }
  const { label, cls, icon } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600', icon: null }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {icon}{label}
    </span>
  )
}

export function CloseDashboardPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [closeType, setCloseType] = useState('monthly')
  const [entityId, setEntityId] = useState('')
  const [targetDate, setTargetDate] = useState('')

  const { data: checklists, isLoading } = useQuery({
    queryKey: ['close-checklists', orgId],
    queryFn: () => closeApi.listChecklists(orgId),
    enabled: !!orgId,
  })

  const createMutation = useMutation({
    mutationFn: () => closeApi.createChecklist({
      organization_id: orgId,
      name,
      close_type: closeType,
      entity_id: entityId ? Number(entityId) : null,
      target_close_date: targetDate || null,
    }),
    onSuccess: (cl) => {
      queryClient.invalidateQueries({ queryKey: ['close-checklists', orgId] })
      setShowCreate(false)
      setName('')
      setApiError(null)
      navigate(`/close/${cl.id}`)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const inProgress = checklists?.filter((c) => ['open', 'in_progress', 'review'].includes(c.status)) ?? []
  const completed = checklists?.filter((c) => ['approved', 'closed'].includes(c.status)) ?? []

  return (
    <PageLayout
      title="Close Dashboard"
      subtitle="Manage monthly, quarterly, and annual close workflows"
      actions={
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> New Checklist
        </button>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Create form */}
      {showCreate && (
        <div className="bg-white border border-indigo-200 rounded-lg p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">New Close Checklist</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder="e.g. January 2024 Monthly Close"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Close Type</label>
              <select
                value={closeType}
                onChange={(e) => setCloseType(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                {['monthly', 'quarterly', 'annual', 'entity', 'consolidated'].map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Target Close Date</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Entity ID (optional)</label>
              <input
                type="number"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder="Leave blank for consolidated"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!name || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create Checklist'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active closes */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Active Closes ({inProgress.length})</h2>
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : !inProgress.length ? (
          <p className="text-sm text-gray-400 py-4">No active closes. Create a checklist to begin.</p>
        ) : (
          <div className="space-y-2">
            {inProgress.map((cl: CloseChecklist) => (
              <ChecklistCard key={cl.id} cl={cl} onClick={() => navigate(`/close/${cl.id}`)} orgId={orgId} />
            ))}
          </div>
        )}
      </div>

      {/* Completed closes */}
      {completed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3">Completed Closes ({completed.length})</h2>
          <div className="space-y-2">
            {completed.map((cl: CloseChecklist) => (
              <ChecklistCard key={cl.id} cl={cl} onClick={() => navigate(`/close/${cl.id}`)} orgId={orgId} />
            ))}
          </div>
        </div>
      )}
    </PageLayout>
  )
}

function ChecklistCard({ cl, onClick, orgId }: { cl: CloseChecklist; onClick: () => void; orgId: number }) {
  const { data: readiness } = useQuery({
    queryKey: ['close-readiness', cl.id],
    queryFn: () => closeApi.getReadiness(cl.id),
  })

  const pct = readiness?.completion_pct ?? 0
  const isBlocked = readiness?.blocked_count && readiness.blocked_count > 0
  const isOverdue = cl.target_close_date && new Date(cl.target_close_date) < new Date() && cl.status !== 'closed'

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-indigo-300 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800">{cl.name}</h3>
          {statusBadge(cl.status)}
          {isBlocked && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              <XCircle className="w-3 h-3" /> Blocked
            </span>
          )}
          {isOverdue && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
              <AlertCircle className="w-3 h-3" /> Overdue
            </span>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
        <span className="capitalize">{cl.close_type}</span>
        {cl.target_close_date && <span>Target: {cl.target_close_date}</span>}
        {readiness && <span>{readiness.total_tasks} tasks</span>}
      </div>
      {readiness && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{readiness.overall_status}</span>
            <span>{pct.toFixed(0)}% complete</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : isBlocked ? 'bg-red-400' : 'bg-indigo-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
