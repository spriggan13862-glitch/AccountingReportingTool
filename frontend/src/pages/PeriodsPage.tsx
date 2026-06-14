import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  Lock,
  LockOpen,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { periodsApi } from '@/api/periods'
import type { AccountingPeriod, PeriodCreate, ClosePeriodRequest } from '@/types'
import { PageLayout } from '@/components/ui/PageLayout'
import { AccountingDataGrid } from '@/components/data-grid'
import type { GridColumn, RowAction, BatchAction } from '@/components/data-grid'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { Input } from '@/components/ui/Input'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { useWorkspace } from '@/providers/WorkspaceProvider'

const PERIOD_TYPES = ['monthly', 'quarterly', 'annual']

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function PeriodStatusBadge({ period }: { period: AccountingPeriod }) {
  if (period.is_closed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
        <Lock className="w-3 h-3" /> Closed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
      <CheckCircle className="w-3 h-3" /> Open
    </span>
  )
}

// ---------------------------------------------------------------------------
// Period actions
// ---------------------------------------------------------------------------

function PeriodActions({
  period,
  onClose,
  onReopen,
  isPending,
}: {
  period: AccountingPeriod
  onClose: (id: number) => void
  onReopen: (id: number) => void
  isPending: boolean
}) {
  if (period.is_closed) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onReopen(period.id) }}
        disabled={isPending}
        className="flex items-center gap-1 px-2 py-1 text-xs border border-amber-300 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50"
        title="Reopen period"
        data-testid={`reopen-period-${period.id}`}
      >
        <LockOpen className="w-3 h-3" />
        Reopen
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClose(period.id) }}
      disabled={isPending}
      className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-50"
      title="Close period"
      data-testid={`close-period-${period.id}`}
    >
      <Lock className="w-3 h-3" />
      Close
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PeriodsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeEntity } = useWorkspace()

  const [entityId, setEntityId] = useState<number | ''>(activeEntity?.id ?? '')
  const [showForm, setShowForm] = useState(false)
  const [fyFilter, setFyFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [apiError, setApiError] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<PeriodCreate>>({ period_type: 'monthly' })

  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ['periods', entityId, fyFilter, typeFilter],
    queryFn: () =>
      periodsApi.list(Number(entityId), {
        fiscal_year: fyFilter ? Number(fyFilter) : undefined,
        period_type: typeFilter || undefined,
      }),
    enabled: !!entityId,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      periodsApi.create({ ...form as PeriodCreate, entity_id: Number(entityId) }),
    onSuccess: () => {
      setShowForm(false)
      setApiError(null)
      queryClient.invalidateQueries({ queryKey: ['periods', entityId] })
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const closeMutation = useMutation({
    mutationFn: (id: number) => periodsApi.close(id, { closed_by: 'user' } as ClosePeriodRequest),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['periods', entityId] }),
    onError: (err: Error) => setApiError(err.message),
  })

  const reopenMutation = useMutation({
    mutationFn: (id: number) => periodsApi.reopen(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['periods', entityId] }),
    onError: (err: Error) => setApiError(err.message),
  })

  const isPending =
    closeMutation.isPending || reopenMutation.isPending || createMutation.isPending

  // Computed stats
  const openCount = data.filter((p) => !p.is_closed).length
  const closedCount = data.filter((p) => p.is_closed).length
  const fiscalYears = [...new Set(data.map((p) => p.fiscal_year))].sort((a, b) => b - a)

  const columns: GridColumn<AccountingPeriod>[] = [
    {
      key: 'period_name',
      header: 'Period',
      sortable: true,
      sortValue: (p) => p.period_name,
      render: (p) => (
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="font-medium text-gray-800">{p.period_name}</span>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Start → End',
      sortable: true,
      sortValue: (p) => p.start_date,
      render: (p) => (
        <span className="text-xs font-mono text-gray-600">
          {p.start_date} <ChevronRight className="w-3 h-3 inline text-gray-300" /> {p.end_date}
        </span>
      ),
    },
    {
      key: 'fy',
      header: 'FY / Period',
      sortable: true,
      sortValue: (p) => p.fiscal_year * 100 + p.fiscal_period,
      render: (p) => (
        <span className="text-xs text-gray-600">
          FY{p.fiscal_year} · P{p.fiscal_period}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      sortValue: (p) => p.period_type,
      render: (p) => (
        <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 font-medium capitalize">
          {p.period_type}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortValue: (p) => (p.is_closed ? 1 : 0),
      render: (p) => <PeriodStatusBadge period={p} />,
    },
    {
      key: 'closed_at',
      header: 'Closed At',
      sortable: true,
      sortValue: (p) => p.closed_at ?? '',
      render: (p) => (
        <span className="text-xs text-gray-400">
          {p.closed_at ? p.closed_at.slice(0, 10) : '—'}
        </span>
      ),
    },
  ]

  const rowActions: RowAction<AccountingPeriod>[] = [
    {
      key: 'view',
      label: 'View Detail',
      onClick: (p) => navigate(`/periods/${p.id}`),
    },
    {
      key: 'close',
      label: 'Close Period',
      icon: Lock,
      hidden: (p) => p.is_closed,
      onClick: (p) => closeMutation.mutate(p.id),
    },
    {
      key: 'reopen',
      label: 'Reopen Period',
      icon: LockOpen,
      hidden: (p) => !p.is_closed,
      onClick: (p) => reopenMutation.mutate(p.id),
    },
  ]

  const batchActions: BatchAction<AccountingPeriod>[] = [
    {
      key: 'batch-close',
      label: 'Close Selected',
      icon: Lock,
      onClick: async (rows) => {
        for (const p of rows.filter((r) => !r.is_closed)) {
          await closeMutation.mutateAsync(p.id)
        }
      },
    },
    {
      key: 'batch-reopen',
      label: 'Reopen Selected',
      icon: LockOpen,
      onClick: async (rows) => {
        for (const p of rows.filter((r) => r.is_closed)) {
          await reopenMutation.mutateAsync(p.id)
        }
      },
    },
  ]

  return (
    <PageLayout
      title="Accounting Periods"
      subtitle="Fiscal period governance — open, close, and manage periods per entity"
      actions={
        entityId ? (
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Plus className="w-3.5 h-3.5" />
            {showForm ? 'Cancel' : 'New Period'}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {apiError && <ErrorBanner message={apiError} />}

        {/* Entity selector */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex flex-wrap items-end gap-4">
            <EntitySelect
              label="Entity"
              value={entityId}
              onChange={(id) => { setEntityId(id); setFyFilter(''); setTypeFilter('') }}
              className="min-w-[220px]"
            />
            {entityId && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">Fiscal Year</label>
                  <select
                    value={fyFilter}
                    onChange={(e) => setFyFilter(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm min-w-[100px]"
                  >
                    <option value="">All years</option>
                    {fiscalYears.map((fy) => (
                      <option key={fy} value={fy}>{fy}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">Period Type</label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm min-w-[110px]"
                  >
                    <option value="">All types</option>
                    {PERIOD_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Stats row */}
          {entityId && data.length > 0 && (
            <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                <span className="font-semibold">{openCount}</span> open
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <Lock className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-semibold">{closedCount}</span> closed
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span className="font-semibold">{data.length}</span> total
              </div>
            </div>
          )}
        </div>

        {/* New period form */}
        {showForm && entityId && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">New Period</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input
                label="Period Name"
                value={form.period_name ?? ''}
                onChange={(e) => setForm({ ...form, period_name: e.target.value })}
                placeholder="March 2025"
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
                placeholder="2025"
              />
              <Input
                label="Fiscal Period #"
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

        {/* Content */}
        {!entityId && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">Select an entity above to view its accounting periods.</p>
            <p className="text-xs text-gray-400 mt-1">
              Each entity has its own set of fiscal periods and close calendar.
            </p>
          </div>
        )}
        {entityId && (
          <AccountingDataGrid
            columns={columns}
            data={data}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/periods/${p.id}`)}
            rowActions={rowActions}
            batchActions={batchActions}
            selectionEnabled
            exportFilename={`periods_entity${entityId}`}
            pageSize={25}
            loading={isLoading}
            error={isError ? (error as Error).message : null}
            emptyMessage="No periods found. Create the first accounting period using the button above."
            data-testid="periods-grid"
          />
        )}
      </div>
    </PageLayout>
  )
}
