import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, SkipForward, ArrowLeft, Lightbulb } from 'lucide-react'
import { tbImportApi } from '@/api/tbImport'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import type { ImportLine, ImportSuggestion } from '@/types'

export function MappingWorkbenchPage() {
  const { id } = useParams<{ id: string }>()
  const batchId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [apiError, setApiError] = useState<string | null>(null)
  const [lineAccountIds, setLineAccountIds] = useState<Record<number, string>>({})
  const [createLineId, setCreateLineId] = useState<number | null>(null)
  const [newAcct, setNewAcct] = useState({ number: '', name: '', type: 'asset', normal: 'debit' })

  const { data: batch } = useQuery({
    queryKey: ['import-batch', batchId],
    queryFn: () => tbImportApi.getBatch(batchId),
    enabled: !!batchId,
  })

  const { data: unmappedLines, isLoading } = useQuery({
    queryKey: ['import-unmapped', batchId],
    queryFn: () => tbImportApi.getUnmappedLines(batchId),
    enabled: !!batchId,
  })

  const { data: suggestions } = useQuery({
    queryKey: ['import-suggestions', batchId],
    queryFn: () => tbImportApi.getSuggestions(batchId),
    enabled: !!batchId,
  })

  const suggestMap: Record<number, ImportSuggestion> = {}
  suggestions?.forEach((s) => { suggestMap[s.line_id] = s })

  const mapMutation = useMutation({
    mutationFn: ({ lineId, accountId }: { lineId: number; accountId: number }) =>
      tbImportApi.mapLine(batchId, lineId, accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-unmapped', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-suggestions', batchId] })
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const skipMutation = useMutation({
    mutationFn: (lineId: number) => tbImportApi.skipLine(batchId, lineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-unmapped', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const createMutation = useMutation({
    mutationFn: ({ lineId }: { lineId: number }) =>
      tbImportApi.createAccountFromLine(batchId, lineId, {
        account_number: newAcct.number,
        account_name: newAcct.name,
        account_type: newAcct.type,
        normal_balance: newAcct.normal,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-unmapped', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
      setCreateLineId(null)
      setNewAcct({ number: '', name: '', type: 'asset', normal: 'debit' })
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  function applyBulkSuggestions() {
    const mappings = unmappedLines
      ?.filter((l: ImportLine) => suggestMap[l.id]?.suggested_account_id != null)
      .map((l: ImportLine) => ({ line_id: l.id, account_id: suggestMap[l.id].suggested_account_id! }))
    if (!mappings?.length) return
    tbImportApi
      .bulkMap(batchId, mappings)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['import-unmapped', batchId] })
        queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
        queryClient.invalidateQueries({ queryKey: ['import-suggestions', batchId] })
      })
      .catch((err: Error) => setApiError(err.message))
  }

  const suggestCount = unmappedLines?.filter((l: ImportLine) => suggestMap[l.id]?.suggested_account_id != null).length ?? 0

  return (
    <PageLayout
      title="Mapping Workbench"
      subtitle={batch ? `${batch.filename} — ${batch.unmapped_row_count ?? 0} lines need mapping` : 'Loading…'}
      actions={
        <button
          type="button"
          onClick={() => navigate(`/import/${batchId}`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Review
        </button>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Bulk suggestion toolbar */}
      {suggestCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
          <Lightbulb className="w-4 h-4 text-blue-500 shrink-0" />
          <p className="text-sm text-blue-800 flex-1">
            {suggestCount} line{suggestCount !== 1 ? 's have' : ' has'} suggested mappings based on account number prefix and name matching.
          </p>
          <button
            type="button"
            onClick={applyBulkSuggestions}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
          >
            Apply All Suggestions
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading unmapped lines…</p>
      ) : !unmappedLines?.length ? (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-10 text-center">
          <Check className="w-10 h-10 mx-auto mb-2 text-green-400" />
          <p className="text-sm font-medium text-gray-700">All lines are mapped!</p>
          <p className="text-xs text-gray-400 mt-1">Return to Import Review to run validation and post.</p>
          <button
            type="button"
            onClick={() => navigate(`/import/${batchId}`)}
            className="mt-3 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
          >
            Go to Import Review
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {unmappedLines.map((line: ImportLine) => {
            const suggestion = suggestMap[line.id]
            const accountInput = lineAccountIds[line.id] ?? ''
            const isCreating = createLineId === line.id

            return (
              <div key={line.id} className="bg-white border border-gray-200 rounded-lg p-4">
                {/* Source row info */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Line {line.line_number}</p>
                    <p className="text-sm font-medium text-gray-800">
                      <span className="font-mono">{line.raw_account_number || '—'}</span>
                      {line.raw_account_name && (
                        <span className="ml-2 text-gray-500">{line.raw_account_name}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    {Number(line.raw_debit ?? 0) > 0 && <p>DR {Number(line.raw_debit).toLocaleString()}</p>}
                    {Number(line.raw_credit ?? 0) > 0 && <p>CR {Number(line.raw_credit).toLocaleString()}</p>}
                    {line.raw_balance != null && <p>Bal {Number(line.raw_balance).toLocaleString()}</p>}
                  </div>
                </div>

                {/* Suggestion banner */}
                {suggestion?.suggested_account_id && (
                  <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3 flex items-center gap-2">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-800 flex-1">
                      Suggested: <span className="font-mono font-medium">{suggestion.suggested_account_number}</span>
                      {' '}{suggestion.suggested_account_name}
                    </p>
                    <button
                      type="button"
                      onClick={() => mapMutation.mutate({ lineId: line.id, accountId: suggestion.suggested_account_id! })}
                      className="text-xs px-2 py-1 bg-amber-600 text-white rounded hover:bg-amber-700"
                    >
                      Accept
                    </button>
                  </div>
                )}

                {/* Manual mapping input */}
                {!isCreating && (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={accountInput}
                      onChange={(e) => setLineAccountIds((prev) => ({ ...prev, [line.id]: e.target.value }))}
                      className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm"
                      placeholder="Enter Account ID to map"
                    />
                    <button
                      type="button"
                      disabled={!accountInput || mapMutation.isPending}
                      onClick={() => mapMutation.mutate({ lineId: line.id, accountId: Number(accountInput) })}
                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> Map
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateLineId(line.id)}
                      className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50"
                    >
                      Create Account
                    </button>
                    <button
                      type="button"
                      disabled={skipMutation.isPending}
                      onClick={() => skipMutation.mutate(line.id)}
                      className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-500 text-sm rounded hover:bg-gray-50"
                    >
                      <SkipForward className="w-3.5 h-3.5" /> Skip
                    </button>
                  </div>
                )}

                {/* Create new account form */}
                {isCreating && (
                  <div className="bg-gray-50 border border-gray-200 rounded p-3 mt-2">
                    <p className="text-xs font-medium text-gray-700 mb-2">Create New Account</p>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input
                        type="text"
                        value={newAcct.number}
                        onChange={(e) => setNewAcct((p) => ({ ...p, number: e.target.value }))}
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                        placeholder="Account number (e.g. 9999)"
                      />
                      <input
                        type="text"
                        value={newAcct.name}
                        onChange={(e) => setNewAcct((p) => ({ ...p, name: e.target.value }))}
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                        placeholder="Account name"
                      />
                      <select
                        value={newAcct.type}
                        onChange={(e) => setNewAcct((p) => ({ ...p, type: e.target.value }))}
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                      >
                        {['asset','liability','equity','revenue','expense'].map((t) => (
                          <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                        ))}
                      </select>
                      <select
                        value={newAcct.normal}
                        onChange={(e) => setNewAcct((p) => ({ ...p, normal: e.target.value }))}
                        className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                      >
                        <option value="debit">Debit normal</option>
                        <option value="credit">Credit normal</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!newAcct.number || !newAcct.name || createMutation.isPending}
                        onClick={() => createMutation.mutate({ lineId: line.id })}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        {createMutation.isPending ? 'Creating…' : 'Create & Map'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreateLineId(null)}
                        className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </PageLayout>
  )
}
