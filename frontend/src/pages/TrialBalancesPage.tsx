import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportingApi } from '@/api/reporting'
import { PageLayout } from '@/components/ui/PageLayout'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { ScenarioMultiSelect } from '@/components/ui/ScenarioMultiSelect'
import { Input } from '@/components/ui/Input'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { AccountingDataGrid } from '@/components/data-grid/AccountingDataGrid'
import type { TBRow } from '@/types'
import { cn } from '@/utils/cn'
import { ArrowUpRight, ArrowDownRight, Scale } from 'lucide-react'

function fmt(val: string) {
  const n = parseFloat(val)
  if (isNaN(n) || n === 0) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtSigned(val: string) {
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function TrialBalancesPage() {
  const [entityId, setEntityId] = useState<number | ''>('')
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10))
  const [scenarioIds, setScenarioIds] = useState<number[]>([])
  const [submitted, setSubmitted] = useState(false)

  const canRun = !!entityId && !!asOfDate

  const { data: rows, isFetching, error, refetch } = useQuery<TBRow[]>({
    queryKey: ['trial-balance', entityId, asOfDate, scenarioIds],
    queryFn: () => reportingApi.trialBalance(entityId as number, asOfDate, scenarioIds),
    enabled: submitted && canRun,
    retry: false,
  })

  function handleRun() {
    setSubmitted(true)
    if (submitted) refetch()
  }

  const totalDebit = rows?.reduce((s, r) => s + parseFloat(r.total_debit), 0) ?? 0
  const totalCredit = rows?.reduce((s, r) => s + parseFloat(r.total_credit), 0) ?? 0

  const columns = [
    {
      key: 'account_number',
      header: 'Number',
      sortable: true,
      filterable: true,
      sortValue: (row: TBRow) => row.account_number || '',
      render: (row: TBRow) => <span className="font-mono text-xs text-gray-500">{row.account_number}</span>,
    },
    {
      key: 'account_name',
      header: 'Account',
      sortable: true,
      filterable: true,
      sortValue: (row: TBRow) => row.account_name,
      render: (row: TBRow) => <span className="text-gray-800 font-medium">{row.account_name}</span>,
    },
    {
      key: 'account_type',
      header: 'Type',
      sortable: true,
      filterable: true,
      sortValue: (row: TBRow) => row.account_type,
      render: (row: TBRow) => (
        <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10 uppercase tracking-wider">
          {row.account_type}
        </span>
      ),
    },
    {
      key: 'total_debit',
      header: 'Debits',
      sortable: true,
      sortValue: (row: TBRow) => parseFloat(row.total_debit) || 0,
      render: (row: TBRow) => <span className="font-mono tabular-nums text-right block pr-2 text-gray-700">{fmt(row.total_debit)}</span>,
      className: 'text-right',
      headerClassName: 'justify-end',
    },
    {
      key: 'total_credit',
      header: 'Credits',
      sortable: true,
      sortValue: (row: TBRow) => parseFloat(row.total_credit) || 0,
      render: (row: TBRow) => <span className="font-mono tabular-nums text-right block pr-2 text-gray-700">{fmt(row.total_credit)}</span>,
      className: 'text-right',
      headerClassName: 'justify-end',
    },
    {
      key: 'signed_balance',
      header: 'Balance',
      sortable: true,
      sortValue: (row: TBRow) => parseFloat(row.signed_balance) || 0,
      render: (row: TBRow) => (
        <span className="font-mono tabular-nums font-semibold text-gray-900 block text-right pr-2">
          {fmtSigned(row.signed_balance)}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'justify-end',
    },
  ]

  return (
    <PageLayout title="Trial Balance">
      <div className="space-y-4 max-w-5xl">
        {/* Parameters */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Parameters</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <EntitySelect
              label="Entity"
              value={entityId}
              onChange={(id) => { setEntityId(id); setSubmitted(false) }}
              required
            />
            <Input
              label="As-of Date"
              type="date"
              value={asOfDate}
              onChange={(e) => { setAsOfDate(e.target.value); setSubmitted(false) }}
              required
            />
            <button
              type="button"
              onClick={handleRun}
              disabled={!canRun || isFetching}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 self-end transition-colors"
            >
              {isFetching ? 'Loading…' : 'Run'}
            </button>
          </div>
          <ScenarioMultiSelect
            label="Scenario overlays (optional)"
            value={scenarioIds}
            onChange={(ids) => { setScenarioIds(ids); setSubmitted(false) }}
          />
        </div>

        {/* Error */}
        {error && <ErrorBanner message={(error as Error).message} />}

        {/* Totals Cards */}
        {rows && rows.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-150 shadow-sm flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Total Debits</p>
                <p className="text-lg font-mono font-bold text-gray-900">
                  {totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-150 shadow-sm flex items-center gap-3">
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg">
                <ArrowDownRight className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Total Credits</p>
                <p className="text-lg font-mono font-bold text-gray-900">
                  {totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className={cn(
              "bg-white p-4 rounded-xl border shadow-sm flex items-center gap-3",
              Math.abs(totalDebit - totalCredit) < 0.01 ? "border-green-200 bg-green-50/20" : "border-red-200 bg-red-50/20"
            )}>
              <div className={cn(
                "p-2.5 rounded-lg",
                Math.abs(totalDebit - totalCredit) < 0.01 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
              )}>
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Net Variance</p>
                <p className={cn(
                  "text-lg font-semibold",
                  Math.abs(totalDebit - totalCredit) < 0.01 ? "text-green-700" : "text-red-700 font-mono font-bold"
                )}>
                  {Math.abs(totalDebit - totalCredit) < 0.01 ? 'Balanced' : (totalDebit - totalCredit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Results Grid */}
        {rows && (
          <AccountingDataGrid
            data-testid="trial-balance-table"
            columns={columns}
            data={rows}
            rowKey={(r) => r.account_id}
            selectionEnabled={false}
            pageSize={100}
            emptyMessage="No posted journal entries found for this entity and date."
          />
        )}
      </div>
    </PageLayout>
  )
}
