import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Loader2, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react'
import { taxonomyLibraryApi, type MappingSuggestion } from '@/api/taxonomyLibrary'
import { accountsApi } from '@/api/accounts'
import { useToast } from '@/providers/ToastProvider'
import type { Account } from '@/types'

interface Props {
  accountIds: number[]
  taxonomyIds: number[]
  entityId?: number
  onApplied?: (count: number) => void
  defaultApplyThreshold?: number
}

interface FlatSuggestion {
  key: string
  account_id: number
  suggestion: MappingSuggestion
}

type SortKey = 'account_number' | 'taxonomy' | 'confidence' | 'suggested_node'
type SortDir = 'asc' | 'desc'

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
  entityId,
  onApplied,
  defaultApplyThreshold = 0.7,
}: Props) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [threshold, setThreshold] = useState<number>(defaultApplyThreshold)
  const [lastSummary, setLastSummary] = useState<{ applied: number; skipped: number } | null>(null)

  const [accountFilter, setAccountFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [taxonomyFilter, setTaxonomyFilter] = useState<string>('')
  const [confidenceMinPct, setConfidenceMinPct] = useState<number>(0)
  const [sortKey, setSortKey] = useState<SortKey>('confidence')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const { data, isLoading, error } = useQuery({
    queryKey: ['taxonomy-bulk-suggest', accountIds.slice().sort().join(','), taxonomyIds.slice().sort().join(',')],
    queryFn: () => taxonomyLibraryApi.bulkSuggest({ account_ids: accountIds, taxonomy_ids: taxonomyIds }),
    enabled: accountIds.length > 0 && taxonomyIds.length > 0,
  })

  const { data: accountsData = [] } = useQuery({
    queryKey: ['accounts-all', entityId],
    queryFn: () => accountsApi.list(entityId),
    enabled: entityId !== undefined,
  })

  const accountMap = useMemo(() => {
    const map = new Map<number, Account>()
    for (const a of accountsData) map.set(a.id, a)
    return map
  }, [accountsData])

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

  const distinctTaxonomyCodes = useMemo(() => {
    const set = new Set<string>()
    for (const f of flatSuggestions) set.add(f.suggestion.taxonomy_code)
    return Array.from(set).sort()
  }, [flatSuggestions])

  const filteredSuggestions = useMemo(() => {
    const minScore = confidenceMinPct / 100
    const accFilter = accountFilter.trim().toLowerCase()
    const nameF = nameFilter.trim().toLowerCase()
    return flatSuggestions.filter((f) => {
      if (f.suggestion.confidence_score < minScore) return false
      if (taxonomyFilter && f.suggestion.taxonomy_code !== taxonomyFilter) return false
      // Agent 2: prefer values embedded in the suggestion (from the API)
      // over the accountMap fallback. Never fall back to the bare ID.
      const acct = accountMap.get(f.account_id)
      const acctNum = f.suggestion.account_number ?? acct?.account_number ?? ''
      const acctName = f.suggestion.account_name ?? acct?.account_name ?? ''
      if (accFilter && !acctNum.toLowerCase().includes(accFilter)) return false
      if (nameF && !acctName.toLowerCase().includes(nameF)) return false
      return true
    })
  }, [flatSuggestions, accountFilter, nameFilter, taxonomyFilter, confidenceMinPct, accountMap])

  const sortedSuggestions = useMemo(() => {
    const arr = filteredSuggestions.slice()
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      if (sortKey === 'confidence') {
        av = a.suggestion.confidence_score
        bv = b.suggestion.confidence_score
      } else if (sortKey === 'account_number') {
        av = a.suggestion.account_number ?? accountMap.get(a.account_id)?.account_number ?? ''
        bv = b.suggestion.account_number ?? accountMap.get(b.account_id)?.account_number ?? ''
      } else if (sortKey === 'taxonomy') {
        av = a.suggestion.taxonomy_code
        bv = b.suggestion.taxonomy_code
      } else if (sortKey === 'suggested_node') {
        av = a.suggestion.node_code
        bv = b.suggestion.node_code
      }
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
    return arr
  }, [filteredSuggestions, sortKey, sortDir, accountMap])

  const visibleKeys = useMemo(() => new Set(sortedSuggestions.map((s) => s.key)), [sortedSuggestions])
  const selectedCount = useMemo(
    () => sortedSuggestions.filter((s) => checked[s.key]).length,
    [sortedSuggestions, checked]
  )
  const allVisibleSelected = sortedSuggestions.length > 0 && selectedCount === sortedSuggestions.length

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

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setChecked((prev) => {
        const next = { ...prev }
        for (const k of visibleKeys) delete next[k]
        return next
      })
    } else {
      setChecked((prev) => {
        const next = { ...prev }
        for (const k of visibleKeys) next[k] = true
        return next
      })
    }
  }

  function setSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'confidence' ? 'desc' : 'asc')
    }
  }

  function applySelected() {
    const toApply = sortedSuggestions.filter((f) => checked[f.key])
    if (toApply.length === 0) {
      toast('Select at least one suggestion to apply', 'info')
      return
    }
    applyMutation.mutate(toApply)
  }

  function applyAll() {
    const toApply = sortedSuggestions.filter((f) => f.suggestion.confidence_score >= threshold)
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

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return null
    return sortDir === 'asc' ? <ArrowUp className="inline w-3 h-3 ml-0.5" /> : <ArrowDown className="inline w-3 h-3 ml-0.5" />
  }

  return (
    <div className="flex flex-col gap-3" data-testid="taxonomy-suggestion-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          {flatSuggestions.length} suggestion{flatSuggestions.length !== 1 ? 's' : ''} total · {sortedSuggestions.length} shown
        </div>
      </div>

      <div className="overflow-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  data-testid="suggestion-select-all"
                  aria-label="Select all visible suggestions"
                />
              </th>
              <th
                className="px-3 py-2 text-left cursor-pointer select-none"
                onClick={() => setSort('account_number')}
                data-testid="sort-account-number"
              >
                Account # {sortIcon('account_number')}
              </th>
              <th className="px-3 py-2 text-left">Account Name</th>
              <th
                className="px-3 py-2 text-left cursor-pointer select-none"
                onClick={() => setSort('taxonomy')}
                data-testid="sort-taxonomy"
              >
                Taxonomy {sortIcon('taxonomy')}
              </th>
              <th
                className="px-3 py-2 text-left cursor-pointer select-none"
                onClick={() => setSort('suggested_node')}
                data-testid="sort-suggested-node"
              >
                Suggested Node {sortIcon('suggested_node')}
              </th>
              <th
                className="px-3 py-2 text-left cursor-pointer select-none"
                onClick={() => setSort('confidence')}
                data-testid="sort-confidence"
              >
                Confidence {sortIcon('confidence')}
              </th>
              <th className="px-3 py-2 text-left">Reason</th>
            </tr>
            <tr className="bg-white border-t border-gray-100">
              <th className="px-3 py-1.5"></th>
              <th className="px-3 py-1.5">
                <input
                  type="text"
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  placeholder="Filter…"
                  className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs"
                  data-testid="filter-account-number"
                />
              </th>
              <th className="px-3 py-1.5">
                <input
                  type="text"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  placeholder="Filter…"
                  className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs"
                  data-testid="filter-account-name"
                />
              </th>
              <th className="px-3 py-1.5">
                <select
                  value={taxonomyFilter}
                  onChange={(e) => setTaxonomyFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs"
                  data-testid="filter-taxonomy"
                >
                  <option value="">All</option>
                  {distinctTaxonomyCodes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </th>
              <th className="px-3 py-1.5"></th>
              <th className="px-3 py-1.5">
                <label className="flex items-center gap-1 text-[10px] text-gray-500">
                  Min
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={confidenceMinPct}
                    onChange={(e) => setConfidenceMinPct(Number(e.target.value))}
                    className="flex-1"
                    data-testid="filter-confidence-range"
                  />
                  <span className="font-mono w-8 text-right">{confidenceMinPct}%</span>
                </label>
              </th>
              <th className="px-3 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {sortedSuggestions.map((f) => {
              // Agent 2: prefer the API-embedded source values; fall back to
              // the accountsApi.list() result only if the suggestion was
              // produced by an older backend that didn't populate them. The
              // bare "#<id>" placeholder is gone — if both sources are null
              // we render a plain dash, never the internal row ID.
              const acct = accountMap.get(f.account_id)
              const acctNumber = f.suggestion.account_number ?? acct?.account_number ?? '—'
              const acctName = f.suggestion.account_name ?? acct?.account_name ?? ''
              return (
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
                  <td className="px-3 py-2 font-mono text-gray-700" data-testid={`suggestion-account-number-${f.key}`}>
                    {acctNumber}
                  </td>
                  <td
                    className="px-3 py-2 text-gray-800 max-w-[16rem] truncate"
                    title={acctName}
                    data-testid={`suggestion-account-name-${f.key}`}
                  >
                    {acctName}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{f.suggestion.taxonomy_code}</td>
                  <td className="px-3 py-2 text-gray-800">
                    {/* Show only the name. The code (e.g. "CASH") used to
                        render alongside ("CASH Cash"), which was awkward
                        when name == titleized(code). */}
                    <span>{f.suggestion.node_name}</span>
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
              )
            })}
          </tbody>
        </table>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg"
        data-testid="suggestion-footer"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-700" data-testid="selected-count">
            {selectedCount} of {sortedSuggestions.length} selected
          </span>
          <button
            type="button"
            onClick={toggleAllVisible}
            className="text-xs text-indigo-600 hover:text-indigo-800 underline"
            data-testid="suggestion-select-all-btn"
          >
            {allVisibleSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600 flex-wrap">
          <button
            type="button"
            onClick={applySelected}
            disabled={selectedCount === 0 || applyMutation.isPending}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50 font-medium"
            data-testid="apply-selected-btn"
          >
            Apply Selected ({selectedCount})
          </button>
          <label className="flex items-center gap-1">
            Threshold
            <input
              type="number"
              min={0}
              max={100}
              step={5}
              value={Math.round(threshold * 100)}
              onChange={(e) => {
                const pct = Math.max(0, Math.min(100, Number(e.target.value)))
                setThreshold(pct / 100)
              }}
              className="w-14 border border-gray-300 rounded px-1.5 py-0.5 text-xs"
              data-testid="confidence-threshold-input"
            />
            %
          </label>
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
          className={`text-xs rounded p-3 border ${
            lastSummary.applied > 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
          data-testid="apply-summary"
        >
          <p className="font-semibold">
            {lastSummary.applied} applied
            {lastSummary.skipped > 0 && `, ${lastSummary.skipped} skipped`}.
          </p>
          {lastSummary.applied === 0 && lastSummary.skipped > 0 && (
            <p className="text-[11px] mt-1">
              All selected accounts already have a financial statement line. To overwrite,
              change the apply mode in the wizard's "Suggest Financial Statement Lines" step.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
