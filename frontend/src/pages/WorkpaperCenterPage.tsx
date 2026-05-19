import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, ChevronRight } from 'lucide-react'
import { closeApi } from '@/api/closeManagement'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { useOrg } from '@/providers/OrgProvider'
import type { Workpaper, WorkpaperStatus } from '@/types'

function statusBadge(status: WorkpaperStatus) {
  const map: Record<WorkpaperStatus, string> = {
    draft:     'bg-gray-100 text-gray-700',
    prepared:  'bg-blue-100 text-blue-700',
    reviewed:  'bg-green-100 text-green-700',
    finalized: 'bg-emerald-100 text-emerald-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

const WP_TYPES = ['lead_schedule', 'reconciliation', 'analysis', 'memo', 'flux', 'rollforward', 'other']

export function WorkpaperCenterPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [apiError, setApiError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const [wpTitle, setWpTitle] = useState('')
  const [wpType, setWpType] = useState('lead_schedule')
  const [wpDesc, setWpDesc] = useState('')

  const { data: workpapers, isLoading } = useQuery({
    queryKey: ['workpapers', orgId, filterStatus],
    queryFn: () => closeApi.listWorkpapers(orgId, filterStatus ? { status: filterStatus as WorkpaperStatus } : undefined),
    enabled: !!orgId,
  })

  const createMutation = useMutation({
    mutationFn: () => closeApi.createWorkpaper(orgId, {
      title: wpTitle,
      workpaper_type: wpType,
      description: wpDesc || null,
    }),
    onSuccess: (wp) => {
      queryClient.invalidateQueries({ queryKey: ['workpapers', orgId] })
      setShowCreate(false)
      setWpTitle('')
      setWpDesc('')
      setApiError(null)
      navigate(`/close/workpapers/${wp.id}`)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const statuses: WorkpaperStatus[] = ['draft', 'prepared', 'reviewed', 'finalized']

  return (
    <PageLayout
      title="Workpapers"
      subtitle="Manage audit workpapers and supporting schedules"
      actions={
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> New Workpaper
        </button>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      {showCreate && (
        <div className="bg-white border border-indigo-200 rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">New Workpaper</h2>
          <div className="space-y-3 mb-3">
            <input
              type="text"
              value={wpTitle}
              onChange={(e) => setWpTitle(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="Workpaper title *"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={wpType}
                onChange={(e) => setWpType(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm"
              >
                {WP_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <textarea
              value={wpDesc}
              onChange={(e) => setWpDesc(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              rows={2}
              placeholder="Description (optional)"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!wpTitle || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Status filter */}
      <div className="flex flex-wrap gap-1 mb-3">
        {(['', ...statuses] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(s)}
            className={`px-2 py-1 text-xs rounded ${filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : !workpapers?.length ? (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-10 text-center">
          <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No workpapers found. Create one to begin.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Title</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Preparer</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {workpapers.map((wp: Workpaper) => (
                <tr
                  key={wp.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/close/workpapers/${wp.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{wp.title}</td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{wp.workpaper_type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">{statusBadge(wp.status)}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {wp.preparer_user_id ? `User ${wp.preparer_user_id}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(wp.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    <ChevronRight className="w-4 h-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageLayout>
  )
}
