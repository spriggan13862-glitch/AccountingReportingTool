import type { ReportLineDrilldown } from '@/types'

interface Props {
  drilldown: ReportLineDrilldown | null
  onClose: () => void
}

export function DrilldownPanel({ drilldown, onClose }: Props) {
  if (!drilldown) return null

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div>
          <h3 className="font-semibold text-sm">{drilldown.fs_line_name}</h3>
          <p className="text-xs text-gray-500">{drilldown.fs_line_code}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="text-sm font-medium text-gray-500">
          Total: <span className="text-gray-900">{parseFloat(drilldown.total_balance).toLocaleString('en-US', { minimumFractionDigits: 0 })}</span>
        </div>
        {drilldown.accounts.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg" data-testid="drilldown-empty-state">
            No accounts mapped to this reporting line.
          </div>
        ) : (
          drilldown.accounts.map((acct) => (
            <div key={acct.account_id} className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b flex justify-between items-center">
                <span className="text-xs font-medium">{acct.account_number} — {acct.account_name}</span>
                <span className="text-xs tabular-nums">{parseFloat(acct.signed_balance).toLocaleString('en-US', { minimumFractionDigits: 0 })}</span>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {acct.journal_entries.map((je) => (
                    <tr key={je.je_id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-3 py-1.5">{je.je_number}</td>
                      <td className="px-3 py-1.5 text-gray-500">{je.entry_date}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {parseFloat(je.net_debit).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
