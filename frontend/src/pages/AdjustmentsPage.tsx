import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ChevronRight, CheckCircle, Clock, XCircle } from 'lucide-react'
import { journalEntriesApi } from '@/api/journalEntries'
import { reviewApi, type BridgeRow } from '@/api/review'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import type { JournalEntry } from '@/types'

type JETab = 'all' | 'draft' | 'pending_approval' | 'posted'

const TABS: { value: JETab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'posted', label: 'Posted' },
]

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800',
  pending_approval: 'bg-blue-100 text-blue-800',
  posted: 'bg-green-100 text-green-800',
  reversed: 'bg-gray-100 text-gray-600',
  voided: 'bg-red-100 text-red-700',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function BridgePanel({ entityId, asOfDate, scenarioIds }: { entityId: number; asOfDate: string; scenarioIds: number[] }) {
  const { data: rows, isLoading } = useQuery({
    queryKey: ['bridge', entityId, asOfDate, scenarioIds],
    queryFn: () => reviewApi.getBridge({ entity_id: entityId, as_of_date: asOfDate, scenario_ids: scenarioIds, statement: 'IS' }),
    staleTime: 15_000,
  })

  if (isLoading) return <LoadingState />
  if (!rows || rows.length === 0) return <p className="text-xs text-gray-400 italic">No bridge data available</p>

  const netIncomeLine = rows.find((r) => r.code?.toLowerCase().includes('net_income') || r.name?.toLowerCase().includes('net income'))
  const bridgeRows = netIncomeLine ? [netIncomeLine] : rows.slice(0, 5)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-gray-400">
            <th className="pb-1.5 text-left font-medium">Line</th>
            <th className="pb-1.5 text-right font-medium w-20">As Rep.</th>
            <th className="pb-1.5 text-right font-medium w-20">AJEs</th>
            <th className="pb-1.5 text-right font-medium w-20">Adjusted</th>
            <th className="pb-1.5 text-right font-medium w-20">Draft</th>
            <th className="pb-1.5 text-right font-medium w-20">Pro Forma</th>
          </tr>
        </thead>
        <tbody>
          {bridgeRows.map((row) => (
            <tr key={row.code} className="border-b border-gray-50">
              <td className="py-1.5">
                <span className="font-mono text-gray-400 text-[10px] mr-1">{row.code}</span>
                <span className="text-gray-700">{row.name}</span>
              </td>
              <td className="py-1.5 text-right tabular-nums text-gray-600">{row.as_reported.toFixed(0)}</td>
              <td className={`py-1.5 text-right tabular-nums ${row.posted_ajes !== 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                {row.posted_ajes !== 0 ? (row.posted_ajes > 0 ? '+' : '') + row.posted_ajes.toFixed(0) : '—'}
              </td>
              <td className="py-1.5 text-right tabular-nums font-semibold text-gray-800">{row.net_adjusted.toFixed(0)}</td>
              <td className={`py-1.5 text-right tabular-nums ${row.pro_forma_ajes !== 0 ? 'text-purple-600 font-medium' : 'text-gray-400'}`}>
                {row.pro_forma_ajes !== 0 ? (row.pro_forma_ajes > 0 ? '+' : '') + row.pro_forma_ajes.toFixed(0) : '—'}
              </td>
              <td className="py-1.5 text-right tabular-nums font-semibold text-gray-800">{row.pro_forma.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > bridgeRows.length && (
        <p className="text-xs text-gray-400 mt-2">{rows.length - bridgeRows.length} more lines…</p>
      )}
    </div>
  )
}

export function AdjustmentsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeEntity, activePeriod, activeScenarioIds } = useWorkspace()
  const [tab, setTab] = useState<JETab>('all')
  const [selectedJe, setSelectedJe] = useState<JournalEntry | null>(null)

  const enabled = !!activeEntity

  const { data: jes = [], isLoading, isError, error } = useQuery({
    queryKey: ['adjustments-jes', activeEntity?.id, tab],
    queryFn: () => journalEntriesApi.list({
      entity_id: activeEntity!.id,
      status: tab === 'all' ? undefined : tab,
      page_size: 200,
    }),
    enabled,
    staleTime: 15_000,
  })

  const submitMutation = useMutation({
    mutationFn: (id: number) => journalEntriesApi.submit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustments-jes'] })
      setSelectedJe(null)
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => journalEntriesApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustments-jes'] })
      queryClient.invalidateQueries({ queryKey: ['bridge'] })
      setSelectedJe(null)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => journalEntriesApi.reject(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustments-jes'] })
      setSelectedJe(null)
    },
  })

  if (!enabled) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">Select an entity in the context bar above</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-0">
      {/* Top: NI Bridge */}
      {activePeriod && (
        <div className="border-b border-gray-200 bg-white px-6 py-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">NI Walk</h2>
          <BridgePanel
            entityId={activeEntity.id}
            asOfDate={activePeriod.end_date}
            scenarioIds={activeScenarioIds}
          />
        </div>
      )}

      {/* Bottom: JE Register */}
      <div className="flex flex-1 min-h-0">
        {/* Left: register */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-gray-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h1 className="text-sm font-semibold text-gray-800">Adjustments</h1>
            <Link
              to="/workbench/journal-entries/new"
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" /> New AJE
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-4 pt-2 border-b border-gray-100">
            {TABS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  tab === value ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {isLoading && <LoadingState />}
            {isError && <ErrorState message={(error as Error).message} />}
            {!isLoading && jes.length === 0 && (
              <div className="flex h-32 items-center justify-center">
                <p className="text-xs text-gray-400 italic">No journal entries found</p>
              </div>
            )}
            {!isLoading && jes.length > 0 && (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white border-b border-gray-100">
                  <tr className="text-gray-500">
                    <th className="px-4 py-2 text-left font-medium">JE #</th>
                    <th className="px-2 py-2 text-left font-medium">Date</th>
                    <th className="px-2 py-2 text-left font-medium">Description</th>
                    <th className="px-2 py-2 text-left font-medium">Status</th>
                    <th className="px-2 py-2 text-right font-medium">Debit</th>
                    <th className="px-2 py-2 w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {jes.map((je) => {
                    const totalDebit = je.lines.reduce((s, l) => s + parseFloat(l.debit || '0'), 0)
                    const isSelected = selectedJe?.id === je.id
                    return (
                      <tr
                        key={je.id}
                        onClick={() => setSelectedJe(isSelected ? null : je)}
                        className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                      >
                        <td className="px-4 py-2 font-mono text-gray-700">{je.je_number}</td>
                        <td className="px-2 py-2 text-gray-500">{je.entry_date}</td>
                        <td className="px-2 py-2 text-gray-700 max-w-[200px] truncate">{je.description}</td>
                        <td className="px-2 py-2"><StatusBadge status={je.status} /></td>
                        <td className="px-2 py-2 text-right tabular-nums text-gray-700">{totalDebit.toFixed(2)}</td>
                        <td className="px-2 py-2">
                          <ChevronRight className="h-3 w-3 text-gray-300" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: detail / actions */}
        <div className="w-80 shrink-0 flex flex-col">
          {selectedJe ? (
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">{selectedJe.je_number}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{selectedJe.entry_date} · {selectedJe.description}</p>
                <div className="mt-2"><StatusBadge status={selectedJe.status} /></div>
              </div>

              {/* Lines summary */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Lines ({selectedJe.lines.length})</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {selectedJe.lines.map((l, i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-600">
                      <span className="font-mono text-gray-400">{l.account_id}</span>
                      {parseFloat(l.debit) > 0 && <span>Dr {parseFloat(l.debit).toFixed(2)}</span>}
                      {parseFloat(l.credit) > 0 && <span>Cr {parseFloat(l.credit).toFixed(2)}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <Link
                  to={`/workbench/journal-entries/${selectedJe.id}`}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  View Full Detail
                </Link>

                {selectedJe.status === 'draft' && (
                  <button
                    type="button"
                    onClick={() => submitMutation.mutate(selectedJe.id)}
                    disabled={submitMutation.isPending}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {submitMutation.isPending ? 'Submitting…' : 'Submit for Approval'}
                  </button>
                )}

                {selectedJe.status === 'pending_approval' && (
                  <>
                    <button
                      type="button"
                      onClick={() => approveMutation.mutate(selectedJe.id)}
                      disabled={approveMutation.isPending}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      {approveMutation.isPending ? 'Approving…' : 'Approve & Post'}
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectMutation.mutate({ id: selectedJe.id, note: 'Rejected' })}
                      disabled={rejectMutation.isPending}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <p className="text-xs text-gray-400 text-center">Select a journal entry to view details and actions</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
