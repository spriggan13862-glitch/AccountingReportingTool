import { useQuery } from '@tanstack/react-query'
import { entitiesApi } from '@/api/entities'
import { PageLayout } from '@/components/ui/PageLayout'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import type { Entity } from '@/types'

const columns: Column<Entity>[] = [
  { key: 'code', header: 'Code', render: (e) => <span className="font-mono">{e.code}</span> },
  { key: 'name', header: 'Name', render: (e) => e.name },
  { key: 'type', header: 'Type', render: (e) => <Badge>{e.entity_type}</Badge> },
  { key: 'currency', header: 'Currency', render: (e) => e.currency },
  {
    key: 'active',
    header: 'Status',
    render: (e) => (
      <Badge variant={e.active ? 'success' : 'default'}>{e.active ? 'active' : 'inactive'}</Badge>
    ),
  },
]

export function EntitiesPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['entities'],
    queryFn: () => entitiesApi.list(),
  })

  return (
    <PageLayout title="Entities" subtitle="All reporting entities in this organization">
      {isLoading && <LoadingState />}
      {isError && <ErrorState message={(error as Error).message} />}
      {data && data.length === 0 && <EmptyState title="No entities" description="Create an entity via the API." />}
      {data && data.length > 0 && (
        <DataTable columns={columns} data={data} rowKey={(e) => e.id} />
      )}
    </PageLayout>
  )
}
