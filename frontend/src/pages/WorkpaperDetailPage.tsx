import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, X, FileText, Link } from 'lucide-react'
import { closeApi } from '@/api/closeManagement'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import type { WorkpaperReference } from '@/types'

const REFERENCE_TYPES = ['journal_entry', 'reconciliation', 'import_batch', 'close_task', 'document', 'other']

export function WorkpaperDetailPage() {
  const { id } = useParams<{ id: string }>()
  const wpId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [apiError, setApiError] = useState<string | null>(null)

  const [reviewComment, setReviewComment] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectComment, setRejectComment] = useState('')
  const [refType, setRefType] = useState('journal_entry')
  const [refId, setRefId] = useState('')
  const [refNotes, setRefNotes] = useState('')

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['workpaper', wpId] })
    queryClient.invalidateQueries({ queryKey: ['workpaper-refs', wpId] })
  }

  const { data: wp } = useQuery({
    queryKey: ['workpaper', wpId],
    queryFn: () => closeApi.getWorkpaper(wpId),
    enabled: !!wpId,
  })

  const { data: refs } = useQuery({
    queryKey: ['workpaper-refs', wpId],
    queryFn: () => closeApi.listReferences(wpId),
    enabled: !!wpId,
  })

  const submitMutation = useMutation({
    mutationFn: () => closeApi.submitWorkpaper(wpId),
    onSuccess: () => { invalidateAll(); setApiError(null) },
    onError: (err: Error) => setApiError(err.message),
  })

  const approveMutation = useMutation({
    mutationFn: () => closeApi.reviewWorkpaper(wpId, true, reviewComment || undefined),
    onSuccess: () => { setReviewComment(''); invalidateAll(); setApiError(null) },
    onError: (err: Error) => setApiError(err.message),
  })

  const rejectMutation = useMutation({
    mutationFn: () => closeApi.reviewWorkpaper(wpId, false, rejectComment),
    onSuccess: () => { setShowRejectForm(false); setRejectComment(''); invalidateAll(); setApiError(null) },
    onError: (err: Error) => setApiError(err.message),
  })

  const finalizeMutation = useMutation({
    mutationFn: () => closeApi.finalizeWorkpaper(wpId),
    onSuccess: () => { invalidateAll(); setApiError(null) },
    onError: (err: Error) => setApiError(err.message),
  })

  const addRefMutation = useMutation({
    mutationFn: () => closeApi.addReference(wpId, refType, Number(refId), refNotes || undefined),
    onSuccess: () => {
      setRefId('')
      setRefNotes('')
      queryClient.invalidateQueries({ queryKey: ['workpaper-refs', wpId] })
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  if (!wp) {
    return <PageLayout title="Workpaper"><p className="text-sm text-gray-400">Loading…</p></PageLayout>
  }

  const canSubmit = wp.status === 'draft'
  const canReview = wp.status === 'prepared'
  const canFinalize = wp.status === 'reviewed'

  return (
    <PageLayout
      title={wp.title}
      subtitle={`Workpaper #${wp.id} · ${wp.status.replace(/_/g, ' ')} · ${wp.workpaper_type.replace(/_/g, ' ')}`}
      actions={
        <button
          type="button"
          onClick={() => navigate('/close/workpapers')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" /> All Workpapers
        </button>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      <div className="grid grid-cols-3 gap-4">
        {/* Main column */}
        <div className="col-span-2 space-y-4">
          {/* Info */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Status:</span> <span className="font-medium capitalize">{wp.status.replace(/_/g, ' ')}</span></div>
              <div><span className="text-gray-500">Type:</span> <span className="font-medium capitalize">{wp.workpaper_type.replace(/_/g, ' ')}</span></div>
              {wp.preparer_user_id && (
                <div><span className="text-gray-500">Preparer:</span> <span className="font-medium">User {wp.preparer_user_id}</span></div>
              )}
              {wp.reviewer_user_id && (
                <div><span className="text-gray-500">Reviewer:</span> <span className="font-medium">User {wp.reviewer_user_id}</span></div>
              )}
              {wp.reviewed_by_user_id && (
                <div><span className="text-gray-500">Reviewed by:</span> <span className="font-medium">User {wp.reviewed_by_user_id}</span></div>
              )}
              {wp.close_task_id && (
                <div>
                  <span className="text-gray-500">Close Task:</span>{' '}
                  <span
                    className="font-medium text-indigo-600 cursor-pointer hover:underline"
                    onClick={() => navigate(`/close/tasks/${wp.close_task_id}`)}
                  >
                    Task #{wp.close_task_id}
                  </span>
                </div>
              )}
            </div>
            {wp.description && (
              <p className="mt-3 text-sm text-gray-600 border-t border-gray-100 pt-3">{wp.description}</p>
            )}
            {wp.reviewer_comment && (
              <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                <strong>Reviewer comment:</strong> {wp.reviewer_comment}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Actions</h3>

            {canSubmit && (
              <button
                type="button"
                disabled={submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitMutation.isPending ? 'Submitting…' : 'Submit for Review'}
              </button>
            )}

            {canReview && (
              <div className="space-y-3">
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Review comment (optional for approval)"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={approveMutation.isPending}
                    onClick={() => approveMutation.mutate()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve
                  </button>
                  {!showRejectForm && (
                    <button
                      type="button"
                      onClick={() => setShowRejectForm(true)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  )}
                </div>
                {showRejectForm && (
                  <div>
                    <textarea
                      value={rejectComment}
                      onChange={(e) => setRejectComment(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Rejection reason *"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        disabled={!rejectComment || rejectMutation.isPending}
                        onClick={() => rejectMutation.mutate()}
                        className="px-3 py-1.5 bg-red-600 text-white text-sm rounded disabled:opacity-50"
                      >
                        Confirm Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRejectForm(false)}
                        className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {canFinalize && (
              <button
                type="button"
                disabled={finalizeMutation.isPending}
                onClick={() => finalizeMutation.mutate()}
                className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 disabled:opacity-50"
              >
                {finalizeMutation.isPending ? 'Finalizing…' : 'Finalize Workpaper'}
              </button>
            )}

            {(wp.status === 'finalized' || wp.status === 'prepared' || wp.status === 'reviewed') && !canReview && !canFinalize && (
              <p className="text-sm text-gray-500">Status: <span className="font-medium capitalize">{wp.status}</span></p>
            )}
            {wp.status === 'finalized' && (
              <p className="text-sm text-emerald-700 font-medium">This workpaper is finalized.</p>
            )}
          </div>

          {/* References */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1">
              <Link className="w-3.5 h-3.5" /> Supporting References
            </h3>
            {!refs?.length ? (
              <p className="text-sm text-gray-400 mb-3">No references added yet.</p>
            ) : (
              <div className="space-y-2 mb-3">
                {refs.map((ref: WorkpaperReference) => (
                  <div key={ref.id} className="flex items-start gap-3 p-2 bg-gray-50 rounded text-sm">
                    <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-700 capitalize">
                        {ref.reference_type.replace(/_/g, ' ')} #{ref.reference_id}
                      </p>
                      {ref.notes && <p className="text-xs text-gray-500">{ref.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {wp.status !== 'finalized' && (
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={refType}
                  onChange={(e) => setRefType(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-xs"
                >
                  {REFERENCE_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={refId}
                  onChange={(e) => setRefId(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-xs"
                  placeholder="ID"
                />
                <button
                  type="button"
                  disabled={!refId || addRefMutation.isPending}
                  onClick={() => addRefMutation.mutate()}
                  className="px-2 py-1.5 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  Add Reference
                </button>
                <input
                  type="text"
                  value={refNotes}
                  onChange={(e) => setRefNotes(e.target.value)}
                  className="col-span-3 border border-gray-300 rounded px-2 py-1.5 text-xs"
                  placeholder="Notes (optional)"
                />
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Timeline */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Timeline</h3>
            <div className="space-y-2 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Created</span>
                <span>{new Date(wp.created_at).toLocaleDateString()}</span>
              </div>
              {wp.prepared_at && (
                <div className="flex justify-between">
                  <span>Prepared</span>
                  <span>{new Date(wp.prepared_at).toLocaleDateString()}</span>
                </div>
              )}
              {wp.submitted_for_review_at && (
                <div className="flex justify-between">
                  <span>Submitted</span>
                  <span>{new Date(wp.submitted_for_review_at).toLocaleDateString()}</span>
                </div>
              )}
              {wp.reviewed_at && (
                <div className="flex justify-between">
                  <span>Reviewed</span>
                  <span>{new Date(wp.reviewed_at).toLocaleDateString()}</span>
                </div>
              )}
              {wp.finalized_at && (
                <div className="flex justify-between font-medium text-emerald-700">
                  <span>Finalized</span>
                  <span>{new Date(wp.finalized_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
