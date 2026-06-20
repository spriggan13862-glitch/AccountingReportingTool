import { useQuery } from '@tanstack/react-query'
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import { importReadinessApi } from '@/api/importReadiness'
import type { ImportReadinessStatus } from '@/types'

interface Props {
  entityId: number
  periodId?: number
}

const SOURCE_ROWS = [
  {
    key: 'coa' as const,
    label: 'Chart of Accounts',
    provides: 'Creates accounts & hierarchy, no balances',
    testId: 'readiness-coa-status',
  },
  {
    key: 'tb' as const,
    label: 'Trial Balance',
    provides: 'Creates accounts & period balances, suggests FSLI',
    testId: 'readiness-tb-status',
  },
  {
    key: 'gl' as const,
    label: 'General Ledger',
    provides: 'Imports transactions, derives period activity',
    testId: 'readiness-gl-status',
  },
  {
    key: 'fs' as const,
    label: 'Financial Statement',
    provides: 'Maps presentation lines to taxonomy, no account detail',
    testId: 'readiness-fs-status',
  },
]

function sourceAvailable(data: ImportReadinessStatus, key: 'coa' | 'tb' | 'gl' | 'fs'): boolean {
  switch (key) {
    case 'coa': return data.coa_available
    case 'tb': return data.tb_available
    case 'gl': return data.gl_available
    case 'fs': return data.fs_available
  }
}

function StatusIcon({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (ok) return <CheckCircle className="h-4 w-4 text-emerald-500" />
  if (warn) return <AlertCircle className="h-4 w-4 text-amber-400" />
  return <XCircle className="h-4 w-4 text-gray-300" />
}

function ReadinessBadge({ label, ok, testId }: { label: string; ok: boolean; testId: string }) {
  return (
    <div
      data-testid={testId}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
        ok
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-gray-200 bg-gray-50 text-gray-400'
      }`}
    >
      {ok ? (
        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-gray-300 shrink-0" />
      )}
      {label}
    </div>
  )
}

export function ImportReadinessMatrix({ entityId, periodId }: Props) {
  const { data, isLoading, isError } = useQuery<ImportReadinessStatus>({
    queryKey: ['import-readiness-status', entityId, periodId],
    queryFn: () => importReadinessApi.get(entityId, periodId),
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking import status…
      </div>
    )
  }

  if (isError || !data) {
    return null
  }

  const taxPct = data.taxonomy_mapped_pct
  const allMissing = [
    ...data.missing_for_accounting_view,
    ...data.missing_for_fs_presentation.filter(
      m => !data.missing_for_accounting_view.includes(m)
    ),
  ]

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
      data-testid="import-readiness-matrix"
    >
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-sm font-bold text-gray-900">Import Readiness Matrix</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Data sources available for this entity and their workflow impact
        </p>
      </div>

      <div className="p-5 space-y-4">
        {/* Source type rows */}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              <th className="text-left pb-2 pr-4">Source Type</th>
              <th className="pb-2 pr-4 w-16 text-center">Status</th>
              <th className="text-left pb-2">What it provides</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {SOURCE_ROWS.map(({ key, label, provides, testId }) => {
              const ok = sourceAvailable(data, key)
              return (
                <tr key={key} data-testid={testId}>
                  <td className="py-2.5 pr-4 font-semibold text-gray-800">{label}</td>
                  <td className="py-2.5 pr-4 text-center">
                    <StatusIcon ok={ok} />
                  </td>
                  <td className="py-2.5 text-xs text-gray-500">{provides}</td>
                </tr>
              )
            })}
            <tr>
              <td className="py-2.5 pr-4 font-semibold text-gray-800">Taxonomy Mapping</td>
              <td className="py-2.5 pr-4 text-center">
                <StatusIcon ok={taxPct >= 80} warn={taxPct > 0 && taxPct < 80} />
              </td>
              <td className="py-2.5 text-xs text-gray-500">
                {taxPct.toFixed(0)}% complete
                {data.unmapped_account_count > 0 && (
                  <span className="ml-1 text-amber-600">
                    ({data.unmapped_account_count} account{data.unmapped_account_count !== 1 ? 's' : ''} unmapped)
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Readiness badges */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">
            Ready For
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <ReadinessBadge
              label="Accounting View"
              ok={data.ready_for_accounting_view}
              testId="readiness-accounting-view"
            />
            <ReadinessBadge
              label="FS Presentation"
              ok={data.ready_for_fs_presentation}
              testId="readiness-fs-presentation"
            />
            <ReadinessBadge
              label="Bridge"
              ok={data.ready_for_bridge}
              testId="readiness-bridge"
            />
            <ReadinessBadge
              label="Drilldown"
              ok={data.ready_for_drilldown}
              testId="readiness-drilldown"
            />
          </div>
        </div>

        {/* Missing items */}
        {allMissing.length > 0 && (
          <div
            className="border-t border-gray-100 pt-4 space-y-1.5"
            data-testid="readiness-missing-list"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
              What's Missing
            </p>
            {allMissing.map((msg, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                {msg}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
