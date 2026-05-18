import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { reportsApi } from '@/api/reports'
import { useOrg } from '@/providers/OrgProvider'
import { PageLayout } from '@/components/ui/PageLayout'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge, Badge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ReportRun } from '@/types'

const columns: Column<ReportRun>[] = [
  { key: 'id', header: 'ID', render: (r) => <span className="font-mono text-gray-400">#{r.id}</span> },
  {
    key: 'type',
    header: 'Report Type',
    render: (r) => <span className="font-medium">{r.report_type.replace(/_/g, ' ')}</span>,
  },
  { key: 'format', header: 'Format', render: (r) => <Badge>{r.output_format.toUpperCase()}</Badge> },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'created_at', header: 'Created', render: (r) => r.created_at.slice(0, 19) },
  { key: 'completed_at', header: 'Completed', render: (r) => r.completed_at?.slice(0, 19) ?? '—' },
]

export function ReportsPage() {
  const { org } = useOrg()
  const navigate = useNavigate()
  const orgId = org?.id ?? 0

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reports', orgId],
    queryFn: () => reportsApi.list(orgId),
    enabled: orgId > 0,
  })

  return (
    <PageLayout title="Reports" subtitle="Report runs and generated exports">
      {!org && <p className="text-sm text-gray-500">Select an organization to view reports.</p>}
      {isLoading && <LoadingState />}
      {isError && <ErrorState message={(error as Error).message} />}
      {data && data.length === 0 && (
        <EmptyState title="No report runs" description="Generate a report via the API." />
      )}
      {data && data.length > 0 && (
        <DataTable
          columns={columns}
          data={data}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/reports/${r.id}`)}
        />
      )}
    </PageLayout>
  )
}
