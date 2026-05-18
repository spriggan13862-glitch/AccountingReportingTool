import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { periodsApi } from '@/api/periods'
import type { PeriodCreate } from '@/types'
import { PageLayout } from '@/components/ui/PageLayout'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import type { AccountingPeriod } from '@/types'

const PERIOD_TYPES = ['monthly', 'quarterly', 'annual']

const columns: Column<AccountingPeriod>[] = [
  { key: 'name', header: 'Period', render: (p) => <span className="font-medium">{p.period_name}</span> },
  { key: 'dates', header: 'Dates', render: (p) => `${p.start_date} → ${p.end_date}` },
  { key: 'fy', header: 'FY / Period', render: (p) => `${p.fiscal_year} / ${p.fiscal_period}` },
  { key: 'type', header: 'Type', render: (p) => <Badge>{p.period_type}</Badge> },
  {
    key: 'status',
    header: 'Status',
    render: (p) => <StatusBadge status={p.is_closed ? 'completed' : 'open'} />,
  },
  { key: 'closed_at', header: 'Closed At', render: (p) => p.closed_at?.slice(0, 10) ?? '—' },
]

export function PeriodsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [entityId, setEntityId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<PeriodCreate>>({
    period_type: 'monthly',
  })

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['periods', entityId],
    queryFn: () => periodsApi.list(Number(entityId)),
    enabled: !!entityId && !isNaN(Number(entityId)),
  })

  const createMutation = useMutation({
    mutationFn: () => periodsApi.create(form as PeriodCreate),
    onSuccess: () => {
      setShowForm(false)
      setApiError(null)
      queryClient.invalidateQueries({ queryKey: ['periods', entityId] })
    },
    onError: (err: Error) => setApiError(err.message),
  })

  return (
    <PageLayout
      title="Accounting Periods"
      subtitle="Manage fiscal periods per entity"
      actions={
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : '+ New Period'}
        </button>
      }
    >
      <div className="space-y-4 max-w-3xl">
        {apiError && <ErrorBanner message={apiError} />}

        <div className="flex items-end gap-3">
          <Input
            label="Entity ID"
            type="number"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="Enter entity ID to load periods"
            className="max-w-xs"
          />
        </div>

        {showForm && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">New Period</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input
                label="Entity ID"
                type="number"
                value={form.entity_id ?? ''}
                onChange={(e) => setForm({ ...form, entity_id: Number(e.target.value) })}
                placeholder="1"
              />
              <Input
                label="Period Name"
                value={form.period_name ?? ''}
                onChange={(e) => setForm({ ...form, period_name: e.target.value })}
                placeholder="March 2024"
              />
              <Input
                label="Start Date"
                type="date"
                value={form.start_date ?? ''}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
              <Input
                label="End Date"
                type="date"
                value={form.end_date ?? ''}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
              <Input
                label="Fiscal Year"
                type="number"
                value={form.fiscal_year ?? ''}
                onChange={(e) => setForm({ ...form, fiscal_year: Number(e.target.value) })}
                placeholder="2024"
              />
              <Input
                label="Fiscal Period"
                type="number"
                value={form.fiscal_period ?? ''}
                onChange={(e) => setForm({ ...form, fiscal_period: Number(e.target.value) })}
                placeholder="3"
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Period Type</label>
                <select
                  value={form.period_type ?? 'monthly'}
                  onChange={(e) => setForm({ ...form, period_type: e.target.value })}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  {PERIOD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create Period'}
            </button>
          </div>
        )}

        {!entityId && <p className="text-sm text-gray-500">Enter an entity ID above to load periods.</p>}
        {entityId && isLoading && <LoadingState />}
        {entityId && isError && <ErrorState message={(error as Error).message} />}
        {data && data.length === 0 && <EmptyState title="No periods" description="Create the first period for this entity." />}
        {data && data.length > 0 && (
          <DataTable
            columns={columns}
            data={data}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/periods/${p.id}`)}
          />
        )}
      </div>
    </PageLayout>
  )
}
