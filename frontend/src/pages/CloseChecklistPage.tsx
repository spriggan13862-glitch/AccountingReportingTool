import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, ArrowLeft, CheckCircle, AlertCircle, XCircle, Clock,
  ChevronRight, Download,
} from 'lucide-react'
import { closeApi } from '@/api/closeManagement'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import type { CloseTask, CloseTaskStatus } from '@/types'

function taskStatusIcon(status: CloseTaskStatus) {
  const map: Record<CloseTaskStatus, React.ReactNode> = {
    not_started:  <Clock className="w-4 h-4 text-gray-400" />,
    in_progress:  <Clock className="w-4 h-4 text-blue-500" />,
    blocked:      <XCircle className="w-4 h-4 text-red-500" />,
    prepared:     <CheckCircle className="w-4 h-4 text-yellow-500" />,
    under_review: <AlertCircle className="w-4 h-4 text-orange-500" />,
    completed:    <CheckCircle className="w-4 h-4 text-green-500" />,
    rejected:     <XCircle className="w-4 h-4 text-red-600" />,
  }
  return map[status] ?? <Clock className="w-4 h-4 text-gray-400" />
}

function priorityBadge(priority: string) {
  const map: Record<string, string> = {
    low:      'bg-gray-100 text-gray-600',
    medium:   'bg-blue-50 text-blue-700',
    high:     'bg-orange-50 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${map[priority] ?? 'bg-gray-100 text-gray-600'}`}>
      {priority}
    </span>
  )
}

export function CloseChecklistPage() {
  const { id } = useParams<{ id: string }>()
  const checklistId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('')

  // New task form
  const [taskTitle, setTaskTitle] = useState('')
  const [taskType, setTaskType] = useState('manual')
  const [taskPriority, setTaskPriority] = useState('medium')
  const [taskDue, setTaskDue] = useState('')
  const [taskRequired, setTaskRequired] = useState(true)

  const { data: checklist } = useQuery({
    queryKey: ['close-checklist', checklistId],
    queryFn: () => closeApi.getChecklist(checklistId),
    enabled: !!checklistId,
  })

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['close-tasks', checklistId, filterStatus],
    queryFn: () => closeApi.listTasks(checklistId, filterStatus ? { status: filterStatus } : undefined),
    enabled: !!checklistId,
  })

  const { data: readiness } = useQuery({
    queryKey: ['close-readiness', checklistId],
    queryFn: () => closeApi.getReadiness(checklistId),
    enabled: !!checklistId,
  })

  const createMutation = useMutation({
    mutationFn: () => closeApi.createTask(checklistId, {
      title: taskTitle,
      task_type: taskType,
      priority: taskPriority,
      due_date: taskDue || null,
      is_required: taskRequired,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['close-tasks', checklistId] })
      queryClient.invalidateQueries({ queryKey: ['close-readiness', checklistId] })
      setShowCreate(false)
      setTaskTitle('')
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  if (!checklist) {
    return <PageLayout title="Close Checklist"><p className="text-sm text-gray-400">Loading…</p></PageLayout>
  }

  const pct = readiness?.completion_pct ?? 0
  const byStatus = readiness?.by_status ?? {}

  return (
    <PageLayout
      title={checklist.name}
      subtitle={`${checklist.close_type.charAt(0).toUpperCase() + checklist.close_type.slice(1)} close · ${checklist.status}`}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/close')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </button>
          <a
            href={`/api/v1/close/checklists/${checklistId}/export`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50"
          >
            <Download className="w-3.5 h-3.5" /> Export Binder
          </a>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> Add Task
          </button>
        </div>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Readiness bar */}
      {readiness && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-semibold text-gray-800">{readiness.overall_status}</span>
              {readiness.issues.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {readiness.issues.map((issue, i) => (
                    <li key={i} className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {issue}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">{pct.toFixed(0)}%</p>
              <p className="text-xs text-gray-400">complete</p>
            </div>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : readiness.blocked_count > 0 ? 'bg-red-400' : 'bg-indigo-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-600">
            {Object.entries(byStatus).map(([st, count]) => (
              <span key={st} className="flex items-center gap-1">
                <span className="font-medium">{count}</span> {st.replace(/_/g, ' ')}
              </span>
            ))}
            {readiness.overdue_count > 0 && (
              <span className="text-orange-600 font-medium">{readiness.overdue_count} overdue</span>
            )}
          </div>
        </div>
      )}

      {/* Create task form */}
      {showCreate && (
        <div className="bg-white border border-indigo-100 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Task</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                placeholder="Task title *"
              />
            </div>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            >
              {['manual', 'reconciliation', 'import_review', 'report', 'workpaper', 'approval'].map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <select
              value={taskPriority}
              onChange={(e) => setTaskPriority(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            >
              {['low', 'medium', 'high', 'critical'].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input
              type="date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={taskRequired}
                onChange={(e) => setTaskRequired(e.target.checked)}
                className="rounded"
              />
              Required for close
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!taskTitle || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Adding…' : 'Add Task'}
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

      {/* Filter */}
      <div className="flex gap-1 mb-3">
        {['', 'not_started', 'in_progress', 'blocked', 'prepared', 'under_review', 'completed', 'rejected'].map((s) => (
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

      {/* Task list */}
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading tasks…</p>
      ) : !tasks?.length ? (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center text-sm text-gray-400">
          No tasks{filterStatus ? ` with status "${filterStatus}"` : ''}. Add a task to begin.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left w-8" />
                <th className="px-4 py-2 text-left">Task</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Priority</th>
                <th className="px-4 py-2 text-left">Due</th>
                <th className="px-4 py-2 text-left">Assignee</th>
                <th className="px-4 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasks.map((task: CloseTask) => {
                const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'
                return (
                  <tr
                    key={task.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/close/tasks/${task.id}`)}
                  >
                    <td className="px-4 py-3">{taskStatusIcon(task.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                          {task.title}
                        </span>
                        {!task.is_required && (
                          <span className="text-xs text-gray-400">(optional)</span>
                        )}
                        {task.blocker_task_ids?.length ? (
                          <span className="text-xs text-red-500">has blockers</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{task.task_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">{priorityBadge(task.priority)}</td>
                    <td className={`px-4 py-3 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {task.due_date ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {task.assigned_to_user_id ? `User ${task.assigned_to_user_id}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      <ChevronRight className="w-4 h-4" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageLayout>
  )
}
