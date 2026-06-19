import { useMemo, useState } from 'react'
import { Download, Layers, FolderOpen, X, ArrowUpDown } from 'lucide-react'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { documentsApi } from '@/api/documents'
import type { ReportLineDrilldown, ReportingTaxonomyLine } from '@/types'

interface Props {
  drilldown: ReportLineDrilldown | null
  onClose: () => void
  taxonomyLines?: ReportingTaxonomyLine[]
}

export function DrilldownPanel({ drilldown, onClose, taxonomyLines }: Props) {
  const fmtCurrency = useFormatCurrency()
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  if (!drilldown) return null

  // Build hierarchy path if taxonomyLines are provided
  const hierarchyPath = useMemo(() => {
    if (!taxonomyLines || !drilldown) return null
    const currentLine = taxonomyLines.find((l) => l.code === drilldown.fs_line_code)
    if (!currentLine) return null
    const path: string[] = [currentLine.name]
    let curr = currentLine
    let limit = 15 // Prevent infinite loop
    while (curr.parent_id && limit > 0) {
      limit--
      const parent = taxonomyLines.find((l) => l.id === curr.parent_id)
      if (!parent) break
      path.unshift(parent.name)
      curr = parent
    }
    return path.join(' > ')
  }, [taxonomyLines, drilldown])

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col transition-all duration-300 animate-slide-in">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-4 border-b bg-gray-50/70">
        <div className="space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            Account Drilldown
          </span>
          <h3 className="font-bold text-gray-800 text-base leading-tight mt-1">{drilldown.fs_line_name}</h3>
          <p className="text-xs text-gray-500 font-mono">{drilldown.fs_line_code}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Close panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Hierarchy path */}
        {hierarchyPath && (
          <div className="bg-gray-50/50 rounded-lg p-2.5 border border-gray-100 flex items-start gap-2">
            <Layers className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-[11px] text-gray-600">
              <span className="font-semibold text-gray-400 block mb-0.5 uppercase tracking-wide text-[9px]">Hierarchy Path</span>
              {hierarchyPath}
            </div>
          </div>
        )}

        {/* Total Summary */}
        <div className="flex items-center justify-between bg-blue-50/40 border border-blue-100 rounded-lg px-4 py-3">
          <span className="text-xs font-semibold text-blue-800">Total Mapped Balance</span>
          <span className="text-lg font-bold text-blue-900 tabular-nums">
            {fmtCurrency(parseFloat(drilldown.total_balance))}
          </span>
        </div>

        {/* Mapped Accounts */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Contributing Accounts</h4>

          {drilldown.accounts.length === 0 ? (
            <div className="text-center py-10 px-4 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50/30" data-testid="drilldown-empty-state">
              <Layers className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="font-medium text-gray-500">No accounts mapped to this reporting line.</p>
              <p className="text-xs text-gray-400 mt-1">Accounts must be classified and have balances to appear here.</p>
            </div>
          ) : (
            drilldown.accounts.map((acct) => {
              const signedBalance = parseFloat(acct.signed_balance)

              const amount = (je: typeof acct.journal_entries[number]) =>
                je.net_debit ? parseFloat(je.net_debit) : (parseFloat(je.debit || '0') - parseFloat(je.credit || '0'))

              // Sort ASC by entry_date then je_number
              const sortedAsc = [...acct.journal_entries].sort((a, b) => {
                const dateCmp = a.entry_date.localeCompare(b.entry_date)
                if (dateCmp !== 0) return dateCmp
                return a.je_number.localeCompare(b.je_number)
              })

              const totalAmount = sortedAsc.reduce((sum, je) => sum + amount(je), 0)
              const openingBalance = signedBalance - totalAmount

              // For DESC, display list is reversed but running balance logic differs
              const displayJEs = sortDir === 'asc' ? sortedAsc : [...sortedAsc].reverse()

              // Compute running balances for display order
              const runningBalances: number[] = []
              if (sortDir === 'asc') {
                let running = openingBalance
                for (const je of displayJEs) {
                  running += amount(je)
                  runningBalances.push(running)
                }
              } else {
                // DESC: last row in display = first row in ASC, so running balance for row i
                // in DESC display equals the cumulative balance after that entry in chronological order.
                // We pre-compute ASC running balances and then reverse them for display.
                const ascRunning: number[] = []
                let running = openingBalance
                for (const je of sortedAsc) {
                  running += amount(je)
                  ascRunning.push(running)
                }
                runningBalances.push(...[...ascRunning].reverse())
              }

              return (
                <div key={acct.account_id} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow transition-shadow">
                  {/* Account Header */}
                  <div className="px-3 py-2 bg-gray-50 border-b flex justify-between items-center">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-gray-800 truncate block">
                        {acct.account_number} — {acct.account_name}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-gray-900 tabular-nums shrink-0 ml-2">
                      {fmtCurrency(signedBalance)}
                    </span>
                  </div>

                  {/* Journal Entries */}
                  <table className="w-full text-xs text-gray-600">
                    <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-400 font-medium">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-normal w-20">JE #</th>
                        <th className="px-3 py-1.5 text-left font-normal w-28">
                          <button
                            type="button"
                            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                            className="flex items-center gap-1 hover:text-gray-600 transition-colors"
                            title={`Sorted ${sortDir.toUpperCase()} — click to toggle`}
                          >
                            Date / File
                            <ArrowUpDown className="w-3 h-3" />
                            <span className="text-[9px] font-bold uppercase">{sortDir}</span>
                          </button>
                        </th>
                        <th className="px-3 py-1.5 text-right font-normal">Amount</th>
                        <th className="px-3 py-1.5 text-right font-normal">Running Bal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {displayJEs.map((je, idx) => {
                        const amt = amount(je)
                        const runBal = runningBalances[idx]
                        return (
                          <tr key={je.je_id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-3 py-2 font-mono text-indigo-600 align-top">
                              {je.je_number}
                            </td>
                            <td className="px-3 py-2 align-top text-gray-500 space-y-1">
                              <span className="block">{je.entry_date}</span>
                              {je.source_import_filename && (
                                <div className="text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded flex items-center gap-1.5 w-fit" title="Source import file">
                                  <FolderOpen className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate max-w-[100px]">{je.source_import_filename}</span>
                                </div>
                              )}
                              {je.document_id && je.document_name && (
                                <button
                                  type="button"
                                  onClick={() => documentsApi.download(je.document_id!)}
                                  className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 underline font-medium hover:bg-blue-50/50 px-1 py-0.5 rounded w-fit text-left"
                                  title="Download linked document"
                                >
                                  <Download className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate max-w-[100px]">{je.document_name}</span>
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-mono align-top text-gray-800">
                              {fmtCurrency(amt)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-mono align-top text-gray-500">
                              {fmtCurrency(runBal)}
                            </td>
                          </tr>
                        )
                      })}
                      {acct.journal_entries.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-3 text-center text-gray-400 italic">
                            No transactions found in this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
