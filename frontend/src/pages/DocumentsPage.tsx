import { PageLayout } from '@/components/ui/PageLayout'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import type { Document } from '@/types'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface DocumentListProps {
  documents: Document[]
}

export function DocumentList({ documents }: DocumentListProps) {
  if (documents.length === 0) {
    return <EmptyState title="No documents" description="No attachments found." />
  }
  return (
    <ul className="divide-y divide-gray-100">
      {documents.map((doc) => (
        <li key={doc.id} className="flex items-center justify-between py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{doc.original_file_name}</p>
            <p className="text-xs text-gray-400">
              {formatBytes(doc.file_size_bytes)} · {doc.uploaded_at.slice(0, 10)}
            </p>
          </div>
          <div className="ml-4 flex items-center gap-2">
            <Badge>{doc.document_type}</Badge>
            {doc.is_deleted && <Badge variant="error">deleted</Badge>}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function DocumentsPage() {
  return (
    <PageLayout title="Documents" subtitle="Uploaded files and attachments">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <EmptyState
          title="Select an object to view documents"
          description="Documents are attached to journal entries, periods, and other objects."
        />
      </div>
    </PageLayout>
  )
}
