import { useQuery } from '@tanstack/react-query'
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import { tbImportApi } from '@/api/tbImport'
import type { ImportReadiness } from '@/types'

interface Props {
  entityId: number
}

function ReadinessRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-4 text-sm text-gray-700">{label}</td>
      <td className="py-2 pr-4">
        {ok ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-gray-300" />
        )}
      </td>
      {detail !== undefined && (
        <td className="py-2 text-sm text-gray-500">{detail}</td>
      )}
    </tr>
  )
}

function GateRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-4 text-sm font-medium text-gray-800">{label}</td>
      <td className="py-2 pr-4">
        {ok ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
            <CheckCircle className="h-3 w-3" /> Ready
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            <XCircle className="h-3 w-3" /> Not ready
          </span>
        )}
      </td>
      <td />
    </tr>
  )
}

export function ImportReadinessMatrix({ entityId }: Props) {
  const { data, isLoading, isError } = useQuery<ImportReadiness>({
    queryKey: ['import-readiness', entityId],
    queryFn: () => tbImportApi.getReadiness(entityId),
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

  const taxPct = data.taxonomy_completion_pct

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Import Readiness</h3>

      {data.warnings.length > 0 && (
        <div className="mb-3 space-y-1">
          {data.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      <table className="w-full">
        <tbody>
          <ReadinessRow
            label="COA"
            ok={data.coa_available}
            detail={data.coa_available ? `${data.coa_account_count} accounts` : 'No chart of accounts'}
          />
          <ReadinessRow
            label="Trial Balance"
            ok={data.balances_available}
            detail={data.balances_available ? 'Posted' : 'Not posted'}
          />
          <ReadinessRow
            label="GL Detail"
            ok={data.gl_detail_available}
            detail={data.gl_detail_available ? 'Available' : 'Not imported'}
          />
          <ReadinessRow
            label="Financial Statements"
            ok={data.fs_available}
            detail={data.fs_available ? 'Available' : 'No posted activity'}
          />
          <ReadinessRow
            label="Taxonomy Mapping"
            ok={taxPct >= 80}
            detail={`${taxPct.toFixed(0)}% complete`}
          />
          <tr className="border-t border-gray-200">
            <td colSpan={3} className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Ready For
            </td>
          </tr>
          <GateRow label="Financial Statements" ok={data.ready_for_statements} />
          <GateRow label="Bridge" ok={data.ready_for_bridge} />
          <GateRow label="GL Drilldown" ok={data.ready_for_drilldown} />
        </tbody>
      </table>
    </div>
  )
}
