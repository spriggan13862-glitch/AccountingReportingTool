import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportingApi } from '@/api/reporting'
import { PageLayout } from '@/components/ui/PageLayout'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { ScenarioMultiSelect } from '@/components/ui/ScenarioMultiSelect'
import { Input } from '@/components/ui/Input'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import type { TBRow } from '@/types'

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

const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense']

function groupByType(rows: TBRow[]) {
  const map = new Map<string, TBRow[]>()
  for (const row of rows) {
    const t = row.account_type.toLowerCase()
    if (!map.has(t)) map.set(t, [])
    map.get(t)!.push(row)
  }
  return TYPE_ORDER.filter((t) => map.has(t)).map((t) => ({ type: t, rows: map.get(t)! }))
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

  const groups = rows ? groupByType(rows) : []
  const totalDebit = rows?.reduce((s, r) => s + parseFloat(r.total_debit), 0) ?? 0
  const totalCredit = rows?.reduce((s, r) => s + parseFloat(r.total_credit), 0) ?? 0

  return (
    <PageLayout title="Trial Balance">
      <div className="space-y-4 max-w-5xl">
        {/* Parameters */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
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
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 self-end"
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

        {/* Results */}
        {rows && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            No posted journal entries found for this entity and date.
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="trial-balance-table">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 w-24">Number</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Account</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 w-32">Debits</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 w-32">Credits</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 w-32">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(({ type, rows: typeRows }) => (
                    <>
                      <tr key={`hdr-${type}`} className="bg-gray-50">
                        <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {type}
                        </td>
                      </tr>
                      {typeRows.map((row) => (
                        <tr key={row.account_id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono text-xs text-gray-500">{row.account_number}</td>
                          <td className="px-4 py-2 text-gray-800">{row.account_name}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-700">{fmt(row.total_debit)}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-700">{fmt(row.total_credit)}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums font-medium text-gray-900">{fmtSigned(row.signed_balance)}</td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-gray-700 uppercase">Totals</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                      {totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                      {totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-bold ${Math.abs(totalDebit - totalCredit) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs(totalDebit - totalCredit) < 0.01 ? 'Balanced' : (totalDebit - totalCredit).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
