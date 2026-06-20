import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { taxonomyLibraryApi, type MappingSuggestion } from '@/api/taxonomyLibrary'
import { useToast } from '@/providers/ToastProvider'

interface Props {
  accountIds: number[]
  taxonomyIds: number[]
  onApplied?: (count: number) => void
  defaultApplyThreshold?: number
}

interface FlatSuggestion {
  key: string
  account_id: number
  suggestion: MappingSuggestion
}

function confidenceClass(score: number): string {
  if (score >= 0.85) return 'bg-emerald-100 text-emerald-700'
  if (score >= 0.55) return 'bg-amber-100 text-amber-700'
  return 'bg-rose-100 text-rose-700'
}

function confidenceLabel(score: number): string {
  return `${Math.round(score * 100)}%`
}

export function TaxonomySuggestionPanel({
  accountIds,
  taxonomyIds,
  onApplied,
  defaultApplyThreshold = 0.7,
}: Props) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [threshold, setThreshold] = useState<number>(defaultApplyThreshold)
  const [lastSummary, setLastSummary] = useState<{ applied: number; skipped: number } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['taxonomy-bulk-suggest', accountIds.slice().sort().join(','), taxonomyIds.slice().sort().join(',')],
    queryFn: () => taxonomyLibraryApi.bulkSuggest({ account_ids: accountIds, taxonomy_ids: taxonomyIds }),
    enabled: accountIds.length > 0 && taxonomyIds.length > 0,
  })

  const flatSuggestions: FlatSuggestion[] = useMemo(() => {
    if (!data?.suggestions) return []
    const out: FlatSuggestion[] = []
    for (const [aidStr, sugs] of Object.entries(data.suggestions)) {
      const aid = Number(aidStr)
      sugs.forEach((s) => {
        out.push({
          key: `${aid}::${s.taxonomy_id}::${s.taxonomy_node_id}`,
          account_id: aid,
          suggestion: s,
        })
      })
    }
    return out
  }, [data])

  const applyMutation = useMutation({
    mutationFn: (toApply: FlatSuggestion[]) =>
      taxonomyLibraryApi.applySuggestions({
        suggestions: toApply.map((f) => ({
          account_id: f.account_id,
          taxonomy_id: f.suggestion.taxonomy_id,
          taxonomy_node_id: f.suggestion.taxonomy_node_id,
          confidence_score: f.suggestion.confidence_score,
        })),
        overwrite_existing: false,
      }),
    onSuccess: (result) => {
      setLastSummary(result)
      toast(`Applied ${result.applied}, skipped ${result.skipped} (existing mapping preserved)`, 'success')
      // Invalidate every query that may render mapping state so the UI updates
      // immediately (issue 9 + issue 15: silent auto-map → visible mapping refresh).
      queryClient.invalidateQueries({ queryKey: ['account-mappings'] })
      queryClient.invalidateQueries({ queryKey: ['taxonomy-account-mappings'] })
      queryClient.invalidateQueries({ queryKey: ['import-lines'] })
      queryClient.invalidateQueries({ queryKey: ['import-suggestions'] })
      queryClient.invalidateQueries({ queryKey: ['fsli-inheritance'] })
      queryClient.invalidateQueries({ queryKey: ['import-readiness'] })
      queryClient.invalidateQueries({ queryKey: ['accounts-all'] })
      onApplied?.(result.applied)
    },
    onError: (err: Error) => {
      toast(`Failed to apply suggestions: ${err.message}`, 'error')
    },
  })

  function toggle(key: string) {
    setChecked((p) => ({ ...p, [key]: !p[key] }))
  }

  function applySelected() {
    const toApply = flatSuggestions.filter((f) => checked[f.key])
    if (toApply.length === 0) {
      toast('Select at least one suggestion to apply', 'info')
      return
    }
    applyMutation.mutate(toApply)
  }

  function applyAll() {
    const toApply = flatSuggestions.filter((f) => f.suggestion.confidence_score >= threshold)
    if (toApply.length === 0) {
      toast(`No suggestions meet the ${Math.round(threshold * 100)}% threshold`, 'info')
      return
    }
    applyMutation.mutate(toApply)
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-gray-500" data-testid="taxonomy-suggestion-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> Computing suggestions…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-rose-600" data-testid="taxonomy-suggestion-error">
        <AlertCircle className="w-4 h-4" /> Failed to load suggestions: {(error as Error).message}
      </div>
    )
  }

  if (flatSuggestions.length === 0) {
    return (
      <div className="p-6 text-sm text-gray-500 text-center" data-testid="taxonomy-suggestion-empty">
        No suggestions found for the selected accounts and taxonomies.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-testid="taxonomy-suggestion-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          {flatSuggestions.length} suggestion{flatSuggestions.length !== 1 ? 's' : ''} ready
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <label className="flex items-center gap-1">
            Confidence threshold:
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Math.max(0, Math.min(1, Number(e.target.value))))}
              className="w-16 border border-gray-300 rounded px-1.5 py-0.5 text-xs"
              data-testid="confidence-threshold-input"
            />
          </label>
          <button
            type="button"
            onClick={applySelected}
            disabled={applyMutation.isPending}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50 font-medium"
            data-testid="apply-selected-btn"
          >
            Apply Selected
          </button>
          <button
            type="button"
            onClick={applyAll}
            disabled={applyMutation.isPending}
            className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700 disabled:opacity-50 font-medium"
            data-testid="apply-all-btn"
          >
            Apply All ≥ {Math.round(threshold * 100)}%
          </button>
        </div>
      </div>

      {lastSummary && (
        <div
          className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-3 py-1.5"
          data-testid="apply-summary"
        >
          Applied {lastSummary.applied}, skipped {lastSummary.skipped} (existing mapping preserved)
        </div>
      )}

      <div className="overflow-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left w-8"></th>
              <th className="px-3 py-2 text-left">Account</th>
              <th className="px-3 py-2 text-left">Taxonomy</th>
              <th className="px-3 py-2 text-left">Suggested Node</th>
              <th className="px-3 py-2 text-left">Confidence</th>
              <th className="px-3 py-2 text-left">Reason</th>
            </tr>
          </thead>
          <tbody>
            {flatSuggestions.map((f) => (
              <tr
                key={f.key}
                className="border-t border-gray-100 hover:bg-gray-50"
                data-testid={`suggestion-row-${f.key}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={!!checked[f.key]}
                    onChange={() => toggle(f.key)}
                    data-testid={`suggestion-checkbox-${f.key}`}
                  />
                </td>
                <td className="px-3 py-2 font-mono text-gray-700">#{f.account_id}</td>
                <td className="px-3 py-2 text-gray-700">{f.suggestion.taxonomy_code}</td>
                <td className="px-3 py-2 text-gray-800">
                  <div className="flex flex-col">
                    <span className="font-mono text-[11px] text-gray-500">{f.suggestion.node_code}</span>
                    <span>{f.suggestion.node_name}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${confidenceClass(f.suggestion.confidence_score)}`}
                    data-testid={`confidence-chip-${f.key}`}
                  >
                    {confidenceLabel(f.suggestion.confidence_score)}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500 italic">{f.suggestion.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
