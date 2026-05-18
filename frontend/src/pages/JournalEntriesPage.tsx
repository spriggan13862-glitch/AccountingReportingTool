import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { journalEntriesApi } from '@/api/journalEntries'
import { PageLayout } from '@/components/ui/PageLayout'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
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
    <PageLayout title="Journal Entries" subtitle="All journal entries across entities">
      {isLoading && <LoadingState />}
      {isError && <ErrorState message={(error as Error).message} />}
      {data && data.length === 0 && (
        <EmptyState title="No journal entries" description="Post a journal entry via the API." />
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
