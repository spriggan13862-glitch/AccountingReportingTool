import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { adjustmentBridgeApi } from '@/api/adjustmentBridge'
import type { CPABridgeResult } from '@/api/adjustmentBridge'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { PeriodSelect } from '@/components/ui/PeriodSelect'
import { LoadingState } from '@/components/ui/LoadingState'
import { periodsApi } from '@/api/periods'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { cn } from '@/utils/cn'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Fmt = (v: number | null | undefined) => string

function CellValue({ value, highlight = false, fmt }: { value: number; highlight?: boolean; fmt: Fmt }) {
  if (value === 0 && !highlight) return <span className="text-slate-200">—</span>
  const neg = value < 0
  return (
    <span className={cn(
      'font-mono',
      highlight && 'font-bold',
      neg ? 'text-rose-600' : highlight ? 'text-slate-900' : 'text-slate-700',
    )}>
      {neg ? `(${fmt(Math.abs(value))})` : fmt(value)}
    </span>
  )
}

function AjeCell({ value, fmt }: { value: number; fmt: Fmt }) {
  if (value === 0) return <span className="text-slate-200">—</span>
  const neg = value < 0
  return (
    <span className={cn('font-mono font-semibold', neg ? 'text-rose-600' : 'text-emerald-700')}>
      {neg ? `(${fmt(Math.abs(value))})` : `+${fmt(value)}`}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdjustmentBridgePage() {
  const fmt = useFormatCurrency()
  const [entityId, setEntityId] = useState<number | ''>('')
  const [periodId, setPeriodId] = useState<number | ''>('')
  const [periodEnd, setPeriodEnd] = useState('')

  const { data: periods = [] } = useQuery({
    queryKey: ['periods-list', entityId],
    queryFn: () => periodsApi.list(entityId as number),
    enabled: !!entityId,
  })

  useEffect(() => {
    if (periods.length > 0 && periodId === '') {
      const sorted = [...periods].sort((a, b) => b.start_date.localeCompare(a.start_date))
      setPeriodId(sorted[0].id)
      setPeriodEnd(sorted[0].end_date)
    }
  }, [periods, periodId])

  const ready = !!entityId && !!periodEnd

  const { data: bridge, isLoading } = useQuery<CPABridgeResult>({
    queryKey: ['cpa-bridge', entityId, periodEnd],
    queryFn: () => adjustmentBridgeApi.cpaBridge({ entity_id: entityId as number, period_end: periodEnd }),
    enabled: ready,
  })

  const colCount = bridge ? bridge.columns.length : 0

  return (
    <PageLayout
      title="Adjustment Bridge"
      subtitle="CPA workbook — one column per adjustment, accounts sorted by number"
      breadcrumb={<Breadcrumb items={[{ label: 'Workbench', href: '/workbench' }, { label: 'Adjustment Bridge' }]} />}
    >
      <div className="space-y-4">

        {/* Selectors */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Entity</label>
            <EntitySelect value={entityId} onChange={(v) => { setEntityId(v); setPeriodId(''); setPeriodEnd('') }} />
          </div>
          <div>
            <PeriodSelect
              entityId={entityId}
              value={periodId}
              onChange={(id) => {
                setPeriodId(id)
                const p = periods.find((x) => x.id === id)
                if (p) setPeriodEnd(p.end_date)
              }}
              label="Period"
            />
          </div>
        </div>

        {/* Placeholder when no selection */}
        {!ready && (
          <div className="bg-white border border-slate-200 rounded-lg p-16 text-center">
            <BarChart3 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500 font-medium">Select entity and period to load the bridge</p>
            <p className="text-xs text-slate-400 mt-1">Each posted adjustment will appear as its own column.</p>
          </div>
        )}

        {ready && isLoading && <LoadingState message="Building bridge…" />}

        {/* CPA bridge table */}
        {ready && bridge && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" data-testid="cpa-bridge-table">

            {colCount === 0 && (
              <div className="p-12 text-center text-slate-400 text-sm">
                No posted adjustments for this entity / period.
                <br />
                <span className="text-xs text-slate-300">Post a journal entry in the Adjustment Workbench to see it here.</span>
              </div>
            )}

            {colCount > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b-2 border-slate-200">
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50 z-10 min-w-[80px]">
                        Acct #
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide sticky left-[80px] bg-slate-50 z-10 min-w-[200px]">
                        Account Name
                      </th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide min-w-[110px]">
                        As Reported
                      </th>
                      {bridge.columns.map((col, idx) => (
                        <th
                          key={col.je_id}
                          className="px-3 py-2.5 text-right text-[10px] font-semibold text-indigo-600 uppercase tracking-wide min-w-[100px] cursor-default"
                          title={`${col.description}\n${col.entry_date}`}
                          data-testid={`aje-col-${col.je_id}`}
                        >
                          <div className="font-mono">{idx + 1} {col.je_number}</div>
                          <div className="text-[9px] text-indigo-400 font-normal normal-case truncate max-w-[90px]" title={col.description}>
                            {col.description.length > 14 ? col.description.slice(0, 14) + '…' : col.description}
                          </div>
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide min-w-[110px] border-l border-slate-200">
                        Total AJEs
                      </th>
                      <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-slate-800 uppercase tracking-wide min-w-[110px] bg-indigo-50 border-l border-indigo-200">
                        Adjusted
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bridge.rows.map((row) => (
                      <tr key={row.account_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-1.5 font-mono text-slate-500 sticky left-0 bg-white z-10">
                          {row.account_number}
                        </td>
                        <td className="px-3 py-1.5 text-slate-800 sticky left-[80px] bg-white z-10">
                          {row.account_name}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <CellValue value={row.as_reported} fmt={fmt} />
                        </td>
                        {bridge.columns.map((col) => (
                          <td key={col.je_id} className="px-3 py-1.5 text-right">
                            <AjeCell value={row.ajes[String(col.je_id)] ?? 0} fmt={fmt} />
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right border-l border-slate-100">
                          <CellValue value={row.total_ajes} fmt={fmt} />
                        </td>
                        <td className="px-3 py-1.5 text-right bg-indigo-50/40 border-l border-indigo-100">
                          <CellValue value={row.adjusted} highlight fmt={fmt} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-300 font-bold">
                      <td className="px-3 py-2.5 text-[10px] font-bold text-slate-600 uppercase tracking-wide sticky left-0 bg-slate-50 z-10" colSpan={2}>
                        Grand Total
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                        {fmt(bridge.totals.as_reported)}
                      </td>
                      {bridge.columns.map((col) => (
                        <td key={col.je_id} className="px-3 py-2.5 text-right font-mono font-bold">
                          {(() => {
                            const v = bridge.totals.ajes[String(col.je_id)] ?? 0
                            return v === 0
                              ? <span className="text-slate-300 font-normal">—</span>
                              : <span className={v < 0 ? 'text-rose-600' : 'text-emerald-700'}>
                                  {v < 0 ? `(${fmt(Math.abs(v))})` : `+${fmt(v)}`}
                                </span>
                          })()}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 border-l border-slate-200">
                        {fmt(bridge.totals.total_ajes)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-indigo-900 bg-indigo-100 border-l border-indigo-200">
                        {fmt(bridge.totals.adjusted)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {ready && bridge && colCount > 0 && (
          <p className="text-[10px] text-slate-400 text-center">
            {bridge.rows.length} accounts · {colCount} posted adjustment{colCount !== 1 ? 's' : ''} · period ending {bridge.period_end}
          </p>
        )}
      </div>
    </PageLayout>
  )
}
