import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Plus } from 'lucide-react'
import { journalEntriesApi } from '@/api/journalEntries'
import { PageLayout } from '@/components/ui/PageLayout'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import type { JournalEntry } from '@/types'

const columns: Column<JournalEntry>[] = [
  { key: 'je_number', header: 'JE #', render: (je) => <span className="font-mono text-blue-700">{je.je_number}</span> },
  { key: 'date', header: 'Date', render: (je) => je.entry_date },
  { key: 'description', header: 'Description', render: (je) => <span className="truncate max-w-xs inline-block">{je.description}</span> },
  { key: 'status', header: 'Status', render: (je) => <StatusBadge status={je.status} /> },
  { key: 'created_by', header: 'Created By', render: (je) => je.created_by ?? '—' },
  { key: 'lines', header: 'Lines', render: (je) => je.lines.length },
]

export function JournalEntriesPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: () => journalEntriesApi.list(),
  })

  return (
    <PageLayout
      title="Journal Entries"
      subtitle="All journal entries across entities"
      actions={
        <button
          type="button"
          onClick={() => navigate('/journal-entries/new')}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> New Entry
        </button>
      }
    >
      {isLoading && <LoadingState />}
      {isError && <ErrorState message={(error as Error).message} />}
      {data && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-600">No journal entries yet</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">
            Create a manual entry or post an import batch to generate journal entries.
          </p>
          <button
            type="button"
            onClick={() => navigate('/journal-entries/new')}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> Create Journal Entry
          </button>
        </div>
      )}
      {data && data.length > 0 && (
        <DataTable
          columns={columns}
          data={data}
          rowKey={(je) => je.id}
          onRowClick={(je) => navigate(`/journal-entries/${je.id}`)}
        />
      )}
    </PageLayout>
  )
}
