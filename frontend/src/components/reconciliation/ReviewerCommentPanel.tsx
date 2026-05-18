import { MessageSquare } from 'lucide-react'
import type { Reconciliation } from '@/types'

interface ReviewerCommentPanelProps {
  reconciliation: Reconciliation
}

export function ReviewerCommentPanel({ reconciliation }: ReviewerCommentPanelProps) {
  if (!reconciliation.reviewer_comment) return null

  return (
    <div
      className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3"
      data-testid="reviewer-comment-panel"
    >
      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
      <div>
        <p className="text-xs font-semibold text-blue-700">Reviewer Comment</p>
        <p className="mt-0.5 text-xs text-blue-600">{reconciliation.reviewer_comment}</p>
        {reconciliation.reviewed_at && (
          <p className="mt-1 text-xs text-blue-400">
            {new Date(reconciliation.reviewed_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  )
}
