import { useFormatCurrencyCompact } from '@/hooks/useFormatCurrency'
import { cn } from '@/utils/cn'
import type { Reconciliation } from '@/types'
import { ReconciliationStatusBadge } from './ReconciliationStatusBadge'
import { TieOutIndicator } from './TieOutIndicator'
import { VarianceBadge } from './VarianceBadge'

function useFmt() {
  const fmt = useFormatCurrencyCompact()
  return (val: string | null) => {
    if (val === null || val === undefined) return '—'
    const n = parseFloat(val)
    if (isNaN(n)) return '—'
    return fmt(n)
  }
}

interface ReconciliationTableProps {
  reconciliations: Reconciliation[]
  onSelect?: (recon: Reconciliation) => void
  className?: string
}

export function ReconciliationTable({ reconciliations, onSelect, className }: ReconciliationTableProps) {
  // Ensure useFmt is invoked at the top-level of the component
  const fmt = useFmt()
  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white', className)} data-testid="reconciliation-table">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-gray-500 bg-gray-50">
              <th className="py-2 pl-4 text-left">ID</th>
              <th className="py-2 text-left">Account</th>
              <th className="py-2 text-left">Type</th>
              <th className="py-2 text-left">Status</th>
              <th className="py-2 text-right pr-3">Official</th>
              <th className="py-2 text-right pr-3">Supporting</th>
              <th className="py-2 text-right pr-3">Variance</th>
              <th className="py-2 text-center pr-3">Tie-Out</th>
            </tr>
          </thead>
          <tbody>
            {reconciliations.map((recon) => (
              <tr
                key={recon.id}
                className={cn(
                  'border-b border-gray-50 hover:bg-gray-50',
                  onSelect && 'cursor-pointer',
                )}
                onClick={() => onSelect?.(recon)}
                data-testid={`recon-row-${recon.id}`}
              >
                <td className="py-2 pl-4 text-xs font-mono text-gray-500">{recon.id}</td>
                <td className="py-2 text-xs text-gray-700">
                  Account #{recon.account_id}
                </td>
                <td className="py-2 text-xs capitalize text-gray-500">
                  {recon.reconciliation_type.replace(/_/g, ' ')}
                </td>
                <td className="py-2">
                  <ReconciliationStatusBadge status={recon.status} />
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-xs text-gray-700">
                  {fmt(recon.official_balance)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-xs text-gray-700">
                  {fmt(recon.supporting_balance)}
                </td>
                <td className="py-2 pr-3 text-right">
                  <VarianceBadge
                    variance={recon.variance_amount}
                    tieOutStatus={recon.tie_out_status}
                  />
                </td>
                <td className="py-2 pr-3 text-center">
                  <TieOutIndicator status={recon.tie_out_status} />
                </td>
              </tr>
            ))}
            {reconciliations.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sm text-gray-400">
                  No reconciliations found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
