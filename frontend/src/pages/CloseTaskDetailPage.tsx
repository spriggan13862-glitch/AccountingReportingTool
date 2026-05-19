import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MessageSquare, Paperclip, Check, X, Send } from 'lucide-react'
import { closeApi } from '@/api/closeManagement'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import type { CloseTaskComment, CloseTaskAttachment } from '@/types'

const TRANSITIONS: Record<string, string[]> = {
  not_started:  ['in_progress'],
  in_progress:  ['blocked', 'prepared'],
  blocked:      ['in_progress'],
  prepared:     ['under_review'],
  under_review: ['completed', 'rejected'],
  rejected:     ['in_progress'],
}

function commentTypeBadge(type: string) {
  const map: Record<string, string> = {
    status_change: 'bg-blue-50 text-blue-600',
    rejection:     'bg-red-50 text-red-600',
    approval:      'bg-green-50 text-green-600',
    comment:       'bg-gray-50 text-gray-600',
    assignment:    'bg-purple-50 text-purple-600',
  }
  return map[type] ?? 'bg-gray-50 text-gray-600'
}

export function CloseTaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const taskId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [apiError, setApiError] = useState<string | null>(null)

  const [commentText, setCommentText] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [attachLabel, setAttachLabel] = useState('')
  const [attachFile, setAttachFile] = useState('')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['close-task', taskId] })
    queryClient.invalidateQueries({ queryKey: ['close-task-comments', taskId] })
  }

  const { data: task } = useQuery({
    queryKey: ['close-task', taskId],
    queryFn: () => closeApi.getTask(taskId),
    enabled: !!taskId,
  })

  const { data: comments } = useQuery({
    queryKey: ['close-task-comments', taskId],
    queryFn: () => closeApi.listComments(taskId),
    enabled: !!taskId,
  })

  const { data: attachments } = useQuery({
    queryKey: ['close-task-attachments', taskId],
    queryFn: () => closeApi.listAttachments(taskId),
    enabled: !!taskId,
  })

  const transitionMutation = useMutation({
    mutationFn: (status: string) => closeApi.transitionTask(taskId, status),
    onSuccess: () => { invalidate(); setApiError(null) },
    onError: (err: Error) => setApiError(err.message),
  })

  const approveMutation = useMutation({
    mutationFn: () => closeApi.approveTask(taskId, 'Approved.'),
    onSuccess: () => { invalidate(); setApiError(null) },
    onError: (err: Error) => setApiError(err.message),
  })

  const rejectMutation = useMutation({
    mutationFn: () => closeApi.rejectTask(taskId, rejectReason),
    onSuccess: () => { setShowRejectForm(false); setRejectReason(''); invalidate(); setApiError(null) },
    onError: (err: Error) => setApiError(err.message),
  })

  const commentMutation = useMutation({
    mutationFn: () => closeApi.addComment(taskId, commentText),
    onSuccess: () => {
      setCommentText('')
      queryClient.invalidateQueries({ queryKey: ['close-task-comments', taskId] })
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const attachMutation = useMutation({
    mutationFn: () => closeApi.addAttachment(taskId, {
      attachment_label: attachLabel || attachFile,
      original_filename: attachFile,
    }),
    onSuccess: () => {
      setAttachLabel('')
      setAttachFile('')
      queryClient.invalidateQueries({ queryKey: ['close-task-attachments', taskId] })
    },
    onError: (err: Error) => setApiError(err.message),
  })

  if (!task) {
    return <PageLayout title="Task Detail"><p className="text-sm text-gray-400">Loading…</p></PageLayout>
  }

  const transitions = TRANSITIONS[task.status] ?? []
  const canApprove = task.status === 'under_review'
  const canReject = task.status === 'under_review'

  return (
    <PageLayout
      title={task.title}
      subtitle={`Task #${task.id} · ${task.status.replace(/_/g, ' ')} · ${task.task_type}`}
      actions={
        <button
          type="button"
          onClick={() => navigate(`/close/${task.checklist_id}`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Checklist
        </button>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      <div className="grid grid-cols-3 gap-4">
        {/* Main content */}
        <div className="col-span-2 space-y-4">
          {/* Task info */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Status:</span> <span className="font-medium capitalize">{task.status.replace(/_/g, ' ')}</span></div>
              <div><span className="text-gray-500">Priority:</span> <span className="font-medium capitalize">{task.priority}</span></div>
              <div><span className="text-gray-500">Due date:</span> <span className="font-medium">{task.due_date ?? '—'}</span></div>
              <div><span className="text-gray-500">Required:</span> <span className="font-medium">{task.is_required ? 'Yes' : 'Optional'}</span></div>
              {task.assigned_to_user_id && (
                <div><span className="text-gray-500">Assigned to:</span> <span className="font-medium">User {task.assigned_to_user_id}</span></div>
              )}
              {task.reviewer_user_id && (
                <div><span className="text-gray-500">Reviewer:</span> <span className="font-medium">User {task.reviewer_user_id}</span></div>
              )}
              {task.prepared_by_user_id && (
                <div><span className="text-gray-500">Prepared by:</span> <span className="font-medium">User {task.prepared_by_user_id}</span></div>
              )}
              {task.reviewed_by_user_id && (
                <div><span className="text-gray-500">Reviewed by:</span> <span className="font-medium">User {task.reviewed_by_user_id}</span></div>
              )}
            </div>
            {task.description && (
              <p className="mt-3 text-sm text-gray-600 border-t border-gray-100 pt-3">{task.description}</p>
            )}
            {task.rejection_reason && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                <strong>Rejection reason:</strong> {task.rejection_reason}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {transitions.map((newStatus) => (
                <button
                  key={newStatus}
                  type="button"
                  disabled={transitionMutation.isPending}
                  onClick={() => transitionMutation.mutate(newStatus)}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50 capitalize"
                >
                  → {newStatus.replace(/_/g, ' ')}
                </button>
              ))}
              {canApprove && (
                <button
                  type="button"
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                >
                  <Check className="w-3.5 h-3.5" /> Approve
                </button>
              )}
              {canReject && !showRejectForm && (
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
              <div className="mt-3">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Reason for rejection…"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    disabled={!rejectReason || rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate()}
                    className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
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

          {/* Comment input */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" /> Add Comment
            </h3>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              rows={2}
              placeholder="Add a comment or note…"
            />
            <div className="flex justify-end mt-2">
              <button
                type="button"
                disabled={!commentText || commentMutation.isPending}
                onClick={() => commentMutation.mutate()}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" /> Post
              </button>
            </div>
          </div>

          {/* Activity timeline */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" /> Activity Timeline
            </h3>
            {!comments?.length ? (
              <p className="text-sm text-gray-400">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {comments.map((c: CloseTaskComment) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-1.5 mt-1.5 shrink-0">
                      <div className={`w-1.5 h-1.5 rounded-full ${commentTypeBadge(c.comment_type).includes('blue') ? 'bg-blue-400' : c.comment_type === 'rejection' ? 'bg-red-400' : c.comment_type === 'approval' ? 'bg-green-400' : 'bg-gray-300'}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${commentTypeBadge(c.comment_type)}`}>
                          {c.comment_type.replace(/_/g, ' ')}
                        </span>
                        {c.prior_status && c.new_status && (
                          <span className="text-xs text-gray-400">
                            {c.prior_status} → {c.new_status}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 ml-auto">
                          {new Date(c.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{c.comment_text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Attachments */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1">
              <Paperclip className="w-3.5 h-3.5" /> Support Documents
            </h3>
            {attachments?.length ? (
              <div className="space-y-2 mb-3">
                {attachments.map((a: CloseTaskAttachment) => (
                  <div key={a.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-xs">
                    <Paperclip className="w-3 h-3 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-700 truncate">{a.attachment_label}</p>
                      <p className="text-gray-400 truncate">{a.original_filename} · v{a.version_number}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-3">No attachments yet.</p>
            )}
            {/* Quick attach form */}
            <div className="space-y-1.5">
              <input
                type="text"
                value={attachLabel}
                onChange={(e) => setAttachLabel(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
                placeholder="Label (e.g. Bank Statement)"
              />
              <input
                type="text"
                value={attachFile}
                onChange={(e) => setAttachFile(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
                placeholder="Filename (e.g. bank_jan.pdf)"
              />
              <button
                type="button"
                disabled={!attachFile || attachMutation.isPending}
                onClick={() => attachMutation.mutate()}
                className="w-full px-2 py-1.5 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 disabled:opacity-50"
              >
                {attachMutation.isPending ? 'Attaching…' : 'Link Document'}
              </button>
            </div>
          </div>

          {/* Linked objects */}
          {(task.linked_reconciliation_id || task.linked_import_batch_id || task.linked_workpaper_id) && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Linked Objects</h3>
              <div className="space-y-1.5 text-xs">
                {task.linked_reconciliation_id && (
                  <p className="text-indigo-600">Reconciliation #{task.linked_reconciliation_id}</p>
                )}
                {task.linked_import_batch_id && (
                  <p className="text-indigo-600">Import Batch #{task.linked_import_batch_id}</p>
                )}
                {task.linked_workpaper_id && (
                  <p className="text-indigo-600 cursor-pointer hover:underline"
                     onClick={() => navigate(`/close/workpapers/${task.linked_workpaper_id}`)}>
                    Workpaper #{task.linked_workpaper_id}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  )
}
