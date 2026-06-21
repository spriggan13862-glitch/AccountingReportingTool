import { useState, useRef, useEffect, useMemo } from 'react'
import { useFormatCurrencyCompact } from '@/hooks/useFormatCurrency'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Upload, ChevronRight, ChevronLeft, CheckCircle, AlertCircle,
  FileText, Download, Sparkles, RefreshCw, Layers, Loader2,
} from 'lucide-react'
import api from '@/api/client'
import { tbImportApi } from '@/api/tbImport'
import { taxonomyLibraryApi } from '@/api/taxonomyLibrary'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { ScenarioSelect } from '@/components/ui/ScenarioSelect'
import { useOrg } from '@/providers/OrgProvider'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { useToast } from '@/providers/ToastProvider'
import { StepIndicator } from '@/components/import-wizard'
import { AccountingDataGrid } from '@/components/data-grid'
import type { WizardStep } from '@/components/import-wizard/types'
import type { SheetInfo } from '@/types'

// ---------------------------------------------------------------------------
// Simplified TB wizard — Suggest Financial Statement Lines step
// ---------------------------------------------------------------------------

interface SuggestFsliResponse {
  suggestions: Array<{
    line_id: number
    suggested_fsli_taxonomy_node_id: number | null
    confidence: number | null
    reason: string | null
    node_code: string | null
    node_name: string | null
  }>
  matched: number
  unmatched: number
  taxonomy_id: number
  taxonomy_name: string
}

interface ApplyFsliResponse {
  applied: number
  skipped: number
  skipped_existing: number
  skipped_no_suggestion: number
  skipped_reason: string | null
  next_action: string | null
}

type StepFilter = 'all' | 'auto-mapped' | 'needs-review' | 'no-suggestion'

function SuggestFsliStep({
  batchId,
  onBack,
  onContinue,
}: {
  batchId: number
  onBack: () => void
  onContinue: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [selectedTaxonomyId, setSelectedTaxonomyId] = useState<number | null>(null)
  const [applyMode, setApplyMode] = useState<'blank_only' | 'replace' | 'preserve'>('blank_only')
  const [suggestResult, setSuggestResult] = useState<SuggestFsliResponse | null>(null)
  const [applyResult, setApplyResult] = useState<ApplyFsliResponse | null>(null)
  const [checkedLines, setCheckedLines] = useState<Set<number>>(new Set())

  // Phase B: per-row override state (in-memory map of line_id → chosen node_id)
  const [overrides, setOverrides] = useState<Record<number, number | null>>({})
  // Phase B: filter + search + threshold
  const [filter, setFilter] = useState<StepFilter>('all')
  const [search, setSearch] = useState('')
  const [acceptThreshold, setAcceptThreshold] = useState<number>(80)

  const { data: taxonomies = [], isLoading: taxonomiesLoading } = useQuery({
    queryKey: ['taxonomies-list'],
    queryFn: () => taxonomyLibraryApi.list(),
  })
  const systemTaxonomies = useMemo(
    () => taxonomies.filter((t) => t.is_system),
    [taxonomies],
  )

  // Default to US GAAP once taxonomies load
  useEffect(() => {
    if (!selectedTaxonomyId && systemTaxonomies.length > 0) {
      const usgaap = systemTaxonomies.find((t) => t.code === 'us_gaap')
      setSelectedTaxonomyId((usgaap ?? systemTaxonomies[0]).id)
    }
  }, [systemTaxonomies, selectedTaxonomyId])

  const runSuggestions = useMutation({
    mutationFn: async () => {
      if (!selectedTaxonomyId) throw new Error('Pick a financial statement structure first')
      const res = await api.post<SuggestFsliResponse>(
        `/tb-imports/batches/${batchId}/suggest-fsli`,
        { taxonomy_id: selectedTaxonomyId },
      )
      return res.data
    },
    onSuccess: (data) => {
      setSuggestResult(data)
      // Default-check every matched line so Apply Selected starts with a useful set.
      const matchedLineIds = data.suggestions
        .filter((s) => s.suggested_fsli_taxonomy_node_id !== null)
        .map((s) => s.line_id)
      setCheckedLines(new Set(matchedLineIds))
      setApplyResult(null)
      toast(`${data.matched} of ${data.suggestions.length} accounts matched`, 'success')
    },
    onError: (e: Error) => toast(`Failed to suggest: ${e.message}`, 'error'),
  })

  const apply = useMutation({
    mutationFn: async (mode: typeof applyMode) => {
      const lineIds = mode === 'replace' || checkedLines.size === 0
        ? 'all'
        : Array.from(checkedLines)
      const res = await api.post<ApplyFsliResponse>(
        `/tb-imports/batches/${batchId}/apply-fsli-suggestions`,
        { line_ids: lineIds, mode },
      )
      return res.data
    },
    onSuccess: (data) => {
      setApplyResult(data)
      if (data.applied > 0) {
        toast(`Applied ${data.applied} financial statement line${data.applied === 1 ? '' : 's'}.`, 'success')
      } else if (data.skipped_reason) {
        toast(data.skipped_reason, 'info')
      }
      queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
    },
    onError: (e: Error) => toast(`Failed to apply: ${e.message}`, 'error'),
  })

  // Phase B: persist per-row overrides whenever the dropdown changes.
  const saveOverride = useMutation({
    mutationFn: async (sel: { line_id: number; taxonomy_node_id: number | null }) => {
      await api.post(
        `/tb-imports/batches/${batchId}/save-fsli-selections`,
        { selections: [sel] },
      )
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] }),
    onError: (e: Error) => toast(`Failed to save selection: ${e.message}`, 'error'),
  })

  // Phase B: accept all suggestions whose confidence meets the threshold.
  const acceptAboveThreshold = useMutation({
    mutationFn: async () => {
      if (!suggestResult) return { saved: 0 }
      const minConf = acceptThreshold / 100
      const selections = suggestResult.suggestions
        .filter((s) => s.suggested_fsli_taxonomy_node_id !== null
          && (s.confidence ?? 0) >= minConf)
        .map((s) => ({
          line_id: s.line_id,
          taxonomy_node_id: s.suggested_fsli_taxonomy_node_id,
        }))
      if (selections.length === 0) return { saved: 0 }
      const res = await api.post<{ saved: number }>(
        `/tb-imports/batches/${batchId}/save-fsli-selections`,
        { selections },
      )
      return res.data
    },
    onSuccess: (data) => {
      toast(`Accepted ${data.saved} suggestion${data.saved === 1 ? '' : 's'} ≥ ${acceptThreshold}% confidence.`, 'success')
      queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
    },
    onError: (e: Error) => toast(`Failed to accept: ${e.message}`, 'error'),
  })

  // Fetch the taxonomy nodes so the per-row override dropdown has options.
  const { data: taxonomyTree = [] } = useQuery({
    queryKey: ['taxonomy-tree', selectedTaxonomyId],
    queryFn: () => selectedTaxonomyId ? taxonomyLibraryApi.tree(selectedTaxonomyId) : Promise.resolve([]),
    enabled: !!selectedTaxonomyId,
  })

  // Flatten the tree to a sorted list of leaf nodes grouped by section.
  const taxonomyNodeOptions = useMemo(() => {
    type Node = { id: number; name: string; code: string; section: string }
    const out: Node[] = []
    function walk(node: any, parentSection: string) {
      const section = node.financial_statement_section ?? parentSection ?? ''
      const children = node.children ?? []
      if (children.length === 0) {
        out.push({ id: node.id, name: node.name, code: node.code, section })
      } else {
        for (const c of children) walk(c, section)
      }
    }
    for (const root of (taxonomyTree as any[])) walk(root, root?.financial_statement_section ?? '')
    out.sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name))
    return out
  }, [taxonomyTree])

  // Pull live import lines so the dropdown reflects the currently-saved selection.
  const { data: lines = [] } = useQuery({
    queryKey: ['import-lines', batchId],
    queryFn: () => tbImportApi.getBatchLines(batchId),
    staleTime: 5_000,
  })

  function effectiveSelection(lineId: number): number | null {
    if (lineId in overrides) return overrides[lineId]
    const line = lines.find((l) => l.id === lineId)
    return line?.selected_fsli_taxonomy_node_id ?? null
  }

  function selectAll() {
    if (!suggestResult) return
    setCheckedLines(new Set(
      suggestResult.suggestions
        .filter((s) => s.suggested_fsli_taxonomy_node_id !== null)
        .map((s) => s.line_id),
    ))
  }
  function deselectAll() {
    setCheckedLines(new Set())
  }
  function toggleLine(lineId: number) {
    setCheckedLines((p) => {
      const next = new Set(p)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })
  }

  const matched = suggestResult?.matched ?? 0
  const unmatched = suggestResult?.unmatched ?? 0
  const total = matched + unmatched
  const visibleSuggestions = suggestResult?.suggestions ?? []
  const matchedVisible = visibleSuggestions.filter((s) => s.suggested_fsli_taxonomy_node_id !== null)

  // Phase B: filter + search applied to the suggestion list.
  const filteredSuggestions = useMemo(() => {
    const term = search.trim().toLowerCase()
    return visibleSuggestions.filter((s) => {
      const sel = effectiveSelection(s.line_id)
      const hasSuggestion = s.suggested_fsli_taxonomy_node_id !== null
      if (filter === 'auto-mapped' && sel == null) return false
      if (filter === 'needs-review' && sel != null) return false
      if (filter === 'no-suggestion' && hasSuggestion) return false
      if (term) {
        const line = lines.find((l) => l.id === s.line_id)
        const num = (line?.raw_account_number ?? '').toLowerCase()
        const name = (line?.raw_account_name ?? '').toLowerCase()
        if (!num.includes(term) && !name.includes(term)) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSuggestions, filter, search, lines, overrides])

  return (
    <div className="space-y-6" data-testid="suggest-fsli-step">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Suggest Financial Statement Lines</h3>
        <p className="text-xs text-gray-500 mt-1">
          Pick a financial statement structure (US GAAP by default) and we'll suggest the right
          line for each imported account based on its name, number, and amount.
        </p>
      </div>

      {/* Taxonomy basis selector */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 max-w-xl">
        <label className="block text-xs font-semibold text-gray-700 mb-2">Financial statement structure</label>
        {taxonomiesLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : systemTaxonomies.length === 0 ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
            No system taxonomies seeded. Run <code className="bg-amber-100 px-1 rounded">python scripts/seed_taxonomies.py</code> first.
          </div>
        ) : (
          <select
            value={selectedTaxonomyId ?? ''}
            onChange={(e) => setSelectedTaxonomyId(Number(e.target.value))}
            className="w-full text-sm border border-gray-300 rounded h-9 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            data-testid="suggest-fsli-taxonomy-select"
          >
            {systemTaxonomies.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.code === 'us_gaap' ? ' (default)' : ''}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => runSuggestions.mutate()}
          disabled={!selectedTaxonomyId || runSuggestions.isPending}
          className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
          data-testid="run-suggestions-btn"
        >
          {runSuggestions.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {runSuggestions.isPending ? 'Suggesting…' : 'Run Suggestions'}
        </button>
      </div>

      {/* Results table */}
      {suggestResult && (
        <div className="space-y-3" data-testid="suggest-fsli-results">
          {/* Phase B: counters + filter chips + search + threshold */}
          <div className="flex items-center gap-3 text-xs text-gray-700 flex-wrap">
            <span className="font-semibold">{matched} of {total} auto-mapped</span>
            <span className="text-gray-400">·</span>
            <span>{unmatched} need review</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap" data-testid="suggest-fsli-filter-bar">
            {(['all', 'auto-mapped', 'needs-review', 'no-suggestion'] as StepFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`text-[11px] px-2.5 py-1 rounded-full border ${filter === f
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}
                data-testid={`filter-chip-${f}`}
              >
                {f === 'all' ? 'All' : f === 'auto-mapped' ? 'Auto-mapped' : f === 'needs-review' ? 'Needs review' : 'No suggestion'}
              </button>
            ))}
            <input
              type="text"
              placeholder="Search account # or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ml-2 text-xs border border-gray-300 rounded h-7 px-2 w-56"
              data-testid="suggest-fsli-search"
            />
            <div className="flex items-center gap-1 ml-auto text-xs">
              <label className="text-gray-600">Accept all ≥</label>
              <input
                type="number"
                min={0}
                max={100}
                value={acceptThreshold}
                onChange={(e) => setAcceptThreshold(Math.max(0, Math.min(100, Number(e.target.value))))}
                className="w-14 border border-gray-300 rounded h-7 px-1.5"
                data-testid="accept-threshold-input"
              />
              <span>%</span>
              <button
                type="button"
                onClick={() => acceptAboveThreshold.mutate()}
                disabled={acceptAboveThreshold.isPending}
                className="ml-2 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded disabled:opacity-50"
                data-testid="accept-above-threshold-btn"
              >
                Accept matching
              </button>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-auto max-h-[400px]">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={matchedVisible.length > 0 && checkedLines.size === matchedVisible.length}
                      onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
                      data-testid="suggest-fsli-select-all"
                    />
                  </th>
                  <th className="px-3 py-2 font-semibold">Account #</th>
                  <th className="px-3 py-2 font-semibold">Account Name</th>
                  <th className="px-3 py-2 font-semibold">Suggested FS Line</th>
                  <th className="px-3 py-2 font-semibold w-24">Confidence</th>
                  <th className="px-3 py-2 font-semibold w-56">Selected FS Line</th>
                  <th className="px-3 py-2 font-semibold w-1/4">Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuggestions.length === 0 ? (
                  <tr><td colSpan={7} className="text-center px-3 py-6 text-gray-400">
                    {visibleSuggestions.length === 0 ? 'No accounts in this batch yet.' : 'No rows match the current filter.'}
                  </td></tr>
                ) : filteredSuggestions.map((s) => {
                  const isMatch = s.suggested_fsli_taxonomy_node_id !== null
                  const confPct = s.confidence != null ? Math.round(s.confidence * 100) : 0
                  const confColor = confPct >= 85 ? 'bg-emerald-100 text-emerald-700'
                    : confPct >= 55 ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
                  const sel = effectiveSelection(s.line_id)
                  return (
                    <tr key={s.line_id} className="border-t border-gray-100" data-testid={`suggest-fsli-row-${s.line_id}`}>
                      <td className="px-3 py-2">
                        {isMatch ? (
                          <input
                            type="checkbox"
                            checked={checkedLines.has(s.line_id)}
                            onChange={() => toggleLine(s.line_id)}
                            data-testid={`suggest-fsli-checkbox-${s.line_id}`}
                          />
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-700"><AccountLookup batchId={batchId} lineId={s.line_id} field="number" /></td>
                      <td className="px-3 py-2 text-gray-800"><AccountLookup batchId={batchId} lineId={s.line_id} field="name" /></td>
                      <td className="px-3 py-2">
                        {isMatch ? (
                          <span className="font-medium text-indigo-700">{s.node_name}</span>
                        ) : (
                          <span className="text-gray-400 italic">No match</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isMatch && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${confColor}`}>
                            {confPct}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={sel ?? ''}
                          onChange={(e) => {
                            const v = e.target.value ? Number(e.target.value) : null
                            setOverrides((p) => ({ ...p, [s.line_id]: v }))
                            saveOverride.mutate({ line_id: s.line_id, taxonomy_node_id: v })
                          }}
                          className="text-xs border border-gray-300 rounded px-1.5 py-0.5 w-full"
                          data-testid={`fsli-override-${s.line_id}`}
                        >
                          <option value="">— None —</option>
                          {taxonomyNodeOptions.map((n) => (
                            <option key={n.id} value={n.id}>{n.section ? `${n.section} · ${n.name}` : n.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{s.reason ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Apply controls */}
          <div className="flex items-center gap-3 flex-wrap border-t border-gray-100 pt-4">
            <label className="text-xs font-semibold text-gray-700">When an account already has an FS line:</label>
            <select
              value={applyMode}
              onChange={(e) => setApplyMode(e.target.value as typeof applyMode)}
              className="text-xs border border-gray-300 rounded px-2 py-1"
              data-testid="apply-mode-select"
            >
              <option value="blank_only">Apply only to blank</option>
              <option value="replace">Replace existing</option>
              <option value="preserve">Preserve (same as blank only)</option>
            </select>
            <button
              type="button"
              onClick={() => apply.mutate(applyMode)}
              disabled={apply.isPending || checkedLines.size === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded disabled:opacity-50"
              data-testid="apply-selected-btn"
            >
              Apply Selected ({checkedLines.size})
            </button>
            <button
              type="button"
              onClick={() => apply.mutate(applyMode)}
              disabled={apply.isPending || matched === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded disabled:opacity-50"
              data-testid="apply-all-btn"
            >
              Apply All Matched ({matched})
            </button>
          </div>

          {/* Apply result */}
          {applyResult && (
            <div
              className={`rounded-lg p-4 border ${applyResult.applied > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}
              data-testid="apply-result-banner"
            >
              <p className="text-sm font-semibold text-gray-800">
                {applyResult.applied} suggestion{applyResult.applied === 1 ? '' : 's'} applied
                {applyResult.skipped > 0 && `, ${applyResult.skipped} skipped`}.
              </p>
              {applyResult.skipped_reason && (
                <p className="text-xs text-gray-600 mt-1">{applyResult.skipped_reason}</p>
              )}
              {applyResult.next_action && (
                <button
                  type="button"
                  onClick={onContinue}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded"
                  data-testid="continue-to-review-btn"
                >
                  {applyResult.next_action} <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer nav */}
      <div className="flex justify-between border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-semibold rounded hover:bg-gray-50"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Column Mapping
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="flex items-center gap-1 px-4 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded hover:bg-gray-50"
          data-testid="skip-to-review-btn"
        >
          Skip to Review Exceptions <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function ReviewExceptionsSummary({
  batchId,
  previewRows,
  validationIssues,
}: {
  batchId: number
  previewRows: any[]
  validationIssues: Array<{ severity: string; code: string }>
}) {
  const { data: lines = [] } = useQuery({
    queryKey: ['import-lines', batchId],
    queryFn: () => tbImportApi.getBatchLines(batchId),
    staleTime: 15_000,
  })
  const totalImported = lines.length
  const autoMapped = lines.filter((l) => l.selected_fsli_taxonomy_node_id != null).length
  const needsReview = lines.filter((l) =>
    l.mapping_status === 'unmapped' || l.selected_fsli_taxonomy_node_id == null
  ).length
  const excluded = lines.filter((l) => l.mapping_status === 'skipped').length
  const errors = validationIssues.filter((i) => i.severity === 'error').length
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs" data-testid="review-exceptions-summary">
      <SummaryStat label="Total imported" value={totalImported} color="gray" />
      <SummaryStat label="Auto-mapped" value={autoMapped} color="emerald" />
      <SummaryStat label="Need review" value={needsReview} color="amber" />
      <SummaryStat label="Excluded" value={excluded} color="slate" />
      <SummaryStat label="Errors" value={errors} color="rose" />
    </div>
  )
}

function SummaryStat({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    rose: 'bg-rose-50 border-rose-200 text-rose-800',
  }
  return (
    <div className={`rounded-lg border px-3 py-2 ${colorMap[color] ?? colorMap.gray}`}>
      <div className="text-[10px] uppercase tracking-wide font-semibold opacity-70">{label}</div>
      <div className="text-lg font-bold mt-0.5">{value.toLocaleString()}</div>
    </div>
  )
}

// Lightweight account-number / name lookup against /batches/{id}/lines.
function AccountLookup({ batchId, lineId, field }: { batchId: number; lineId: number; field: 'number' | 'name' }) {
  const { data: lines = [] } = useQuery({
    queryKey: ['import-lines', batchId],
    queryFn: () => tbImportApi.getBatchLines(batchId),
    staleTime: 30_000,
  })
  const line = lines.find((l) => l.id === lineId)
  if (!line) return <span className="text-gray-300">—</span>
  if (field === 'number') return <>{line.raw_account_number || '—'}</>
  return <span title={line.raw_account_name || ''}>{line.raw_account_name || '—'}</span>
}

const COLUMN_ALIASES: Record<string, string[]> = {
  account_number: [
    "account_number", "account #", "account no", "account no.", "account number",
    "acct #", "acct no", "acct", "num", "gl account", "gl #", "code",
    "account code", "account id", "ledger account", "chart of accounts",
  ],
  account_name: [
    "account_name", "account name", "account description", "gl account name",
    "name", "title", "account title", "ledger name",
  ],
  debit: [
    "debit", "debit amount", "dr", "dr amount", "debit balance",
    "debit (dr)", "ending debit", "total debit",
  ],
  credit: [
    "credit", "credit amount", "cr", "cr amount", "credit balance",
    "credit (cr)", "ending credit", "total credit",
  ],
  balance: [
    "balance", "net balance", "net amount", "net change",
    "ending balance", "amount", "total", "period net",
    "net activity", "net", "balance amount",
  ],
  description: [
    "description", "memo", "notes", "narration", "detail",
    "transaction description", "account description",
  ],
  entity: [
    "entity", "class", "location", "department", "subsidiary",
    "cost center", "business unit",
  ],
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/-/g, " ").replace(/_/g, " ")
}

function matchColumn(header: string): string | null {
  const normalized = normalizeHeader(header)
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some(alias => normalizeHeader(alias) === normalized)) {
      return field
    }
  }
  return null
}

// Agent 3.2 + Agent 1: data-driven type inference for columns whose header
// names don't match a known alias. Mirrors backend infer_column_type_from_data.
const AMOUNT_RE = /^[\(\-]?\$[\d,]+(\.\d+)?\)?$|^[\(\-]?[\d,]+\.\d+\)?$|^\([\d,]+\.?\d*\)$/
const COMBINED_RE = /^(\d{3,8}(?:-\d{1,6})*)\s*(?:[-–—·:]\s*|\s+).+$/

function inferColumnType(values: string[]): 'amount' | 'account_combined' | 'account_number' | 'text' | 'empty' {
  const samples = values.map((v) => (v ?? '').toString().trim()).filter((s) => s.length > 0)
  if (samples.length === 0) return 'empty'
  const total = samples.length
  const amountHits = samples.filter((s) => AMOUNT_RE.test(s)).length
  const combinedHits = samples.filter((s) => COMBINED_RE.test(s)).length
  if (amountHits / total >= 0.5) return 'amount'
  if (combinedHits / total >= 0.5) return 'account_combined'
  if (samples.every((s) => /^[A-Za-z0-9]{1,12}(?:-[A-Za-z0-9]{1,8})*$/.test(s))) return 'account_number'
  return 'text'
}

function detectTbMapping(headers: string[], rows?: string[][]): Record<string, string> {
  const mapping: Record<string, string> = {}
  const usedColumns = new Set<string>()

  // First pass: header alias match
  headers.forEach((h) => {
    const field = matchColumn(h)
    if (field && !mapping[field]) {
      mapping[field] = h
      usedColumns.add(h)
    }
  })

  // Second pass: data inference for un-matched columns (Agent 3.2)
  if (rows && rows.length > 0) {
    const sample = rows.slice(0, 50)
    headers.forEach((h, colIdx) => {
      if (usedColumns.has(h)) return
      const colValues = sample.map((row) => row[colIdx] ?? '')
      const inferred = inferColumnType(colValues)
      if (inferred === 'account_combined' && !mapping.account_combined && !mapping.account_number) {
        mapping.account_combined = h
        usedColumns.add(h)
      } else if (inferred === 'account_number' && !mapping.account_number && !mapping.account_combined) {
        mapping.account_number = h
        usedColumns.add(h)
      } else if (inferred === 'amount') {
        if (!mapping.debit) { mapping.debit = h; usedColumns.add(h) }
        else if (!mapping.credit) { mapping.credit = h; usedColumns.add(h) }
      }
    })
  }
  return mapping
}

const STEPS = [
  { label: 'Upload', desc: 'Select file and workspace context' },
  { label: 'Sheet', desc: 'Select workbook sheet' },
  { label: 'Column Mapping', desc: 'Verify ledger fields' },
  { label: 'Suggest FS Lines', desc: 'Match accounts to financial statement lines' },
  { label: 'Review Exceptions', desc: 'Resolve issues' },
  { label: 'Post to Ledger', desc: 'Commit journal entry' },
]

function colLetter(idx: number): string {
  let result = ''
  let n = idx + 1
  while (n > 0) {
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

export function TrialBalanceImportPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const { activeEntity } = useWorkspace()

  const [step, setStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [entityId, setEntityId] = useState<number | ''>(activeEntity?.id ?? '')
  const [asOfDate, setAsOfDate] = useState<string>('')
  const [scenarioId, setScenarioId] = useState<number | ''>(activeEntity ? '' : '')
  
  const [detected, setDetected] = useState<any>(null)
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null)
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0)
  const [colMapping, setColMapping] = useState<Record<string, string>>({})
  
  const [batchId, setBatchId] = useState<number | null>(null)
  const [validationIssues, setValidationIssues] = useState<any[]>([])
  const [validationPreviewRows, setValidationPreviewRows] = useState<any[]>([])
  
  const [jeNumber, setJeNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [apiError, setApiError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{ existingBatchId: number; existingStatus: string } | null>(null)

  const active = useMemo(() => {
    return detected?.sheets?.find((s: any) => s.name === selectedSheet)
  }, [detected, selectedSheet])

  const fmt = useFormatCurrencyCompact()

  const { headers, previewRows } = useMemo(() => {
    if (!detected) return { headers: [], previewRows: [] }
    if (!detected.sheets || detected.sheets.length === 0) {
      return {
        headers: detected.headers || [],
        previewRows: detected.preview_rows || [],
      }
    }
    if (!active) return { headers: [], previewRows: [] }

    const hIdx = headerRowIndex
    const hdrs = active.raw_rows[hIdx] || []
    const pRows: Record<string, string>[] = []
    
    for (let i = hIdx + 1; i < active.raw_rows.length; i++) {
      const cells = active.raw_rows[i]
      if (cells.some((c: string) => c.trim() !== '')) {
        const rowDict: Record<string, string> = {}
        cells.forEach((val: string, colIdx: number) => {
          const letter = colLetter(colIdx)
          rowDict[letter] = val
          const hdr = hdrs[colIdx]
          if (hdr) {
            rowDict[hdr] = val
          }
        })
        pRows.push(rowDict)
        if (pRows.length >= 5) break
      }
    }
    return { headers: hdrs, previewRows: pRows }
  }, [detected, active, headerRowIndex])

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName)
    if (detected?.sheets) {
      const activeSheet = detected.sheets.find((s: any) => s.name === sheetName)
      if (activeSheet) {
        setHeaderRowIndex(activeSheet.auto_header_row_idx)
        const headers = activeSheet.raw_rows[activeSheet.auto_header_row_idx] || []
        const dataRows = activeSheet.raw_rows.slice(activeSheet.auto_header_row_idx + 1, activeSheet.auto_header_row_idx + 51)
        const autoMapping = detectTbMapping(headers, dataRows)
        setColMapping(autoMapping)
      }
    }
  }

  const handleHeaderRowIndexChange = (newIdx: number) => {
    setHeaderRowIndex(newIdx)
    const activeSheet = detected?.sheets?.find((s: any) => s.name === selectedSheet)
    if (activeSheet) {
      const newHeaders = activeSheet.raw_rows[newIdx] || []
      const dataRows = activeSheet.raw_rows.slice(newIdx + 1, newIdx + 51)
      const autoMapping = detectTbMapping(newHeaders, dataRows)
      setColMapping(autoMapping)
    }
  }

  const WIZARD_STEPS: WizardStep[] = STEPS.map((s, i) => {
    let status: 'pending' | 'active' | 'complete' | 'error' = 'pending'
    if (i === step) status = 'active'
    else if (i < step) status = 'complete'
    return { key: String(i), label: s.label, status }
  })

  const detectMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('No file selected')
      return tbImportApi.detectFile(file)
    },
    onSuccess: (result) => {
      setDetected(result)
      setSelectedSheet(result.selected_sheet)
      setApiError(null)
      if (result.sheets && result.sheets.length > 0) {
        setStep(1)
        const activeSheet = result.sheets.find((s: any) => s.name === result.selected_sheet)
        if (activeSheet) {
          setHeaderRowIndex(activeSheet.auto_header_row_idx)
          const headers = activeSheet.raw_rows[activeSheet.auto_header_row_idx] || []
          const dataRows = activeSheet.raw_rows.slice(activeSheet.auto_header_row_idx + 1, activeSheet.auto_header_row_idx + 51)
          const autoMapping = detectTbMapping(headers, dataRows)
          setColMapping(autoMapping)
        }
      } else {
        setHeaderRowIndex(0)
        const autoMapping = detectTbMapping(result.headers || [], result.preview_rows || result.rows || [])
        setColMapping(autoMapping)
        setStep(2)
      }
    },
    onError: (err: Error) => { setApiError(err.message) },
  })

  const uploadMutation = useMutation({
    mutationFn: (force: boolean = false) => {
      if (!file || !entityId || !asOfDate) throw new Error('Entity and date are required')
      return tbImportApi.uploadBatch({
        entity_id: entityId as number,
        organization_id: orgId,
        as_of_date: asOfDate,
        scenario_id: scenarioId !== '' ? scenarioId : undefined,
        sheet_name: selectedSheet ?? undefined,
        header_row_index: headerRowIndex,
        column_mapping: Object.keys(colMapping).length > 0 ? colMapping : undefined,
        force,
        file,
      })
    },
    onSuccess: (batch) => {
      setBatchId(batch.id)
      setJeNumber(`JE-TB-${batch.id}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`)
      setApiError(null)
      setDuplicateWarning(null)
      // Trigger validation immediately
      validateMutation.mutate(batch.id)
    },
    onError: (err: unknown) => {
      const detail = (err as any)?.response?.data?.detail
      if (detail?.code === 'DUPLICATE_IMPORT') {
        setDuplicateWarning({ existingBatchId: detail.existing_batch_id, existingStatus: detail.existing_status })
        setApiError(null)
      } else {
        setApiError((err as Error).message ?? 'Upload failed')
      }
    },
  })

  const validateMutation = useMutation({
    mutationFn: (id: number) => tbImportApi.validateBatch(id),
    onSuccess: (res, id) => {
      setValidationIssues([...(res.errors || []), ...(res.warnings || [])])
      // Load raw preview rows
      tbImportApi.getRawPreview(id, 100).then(preview => {
        setValidationPreviewRows(preview.rows || [])
        setStep(3)
      })
    },
    onError: (err: Error) => { setApiError(err.message) },
  })

  const postMutation = useMutation({
    mutationFn: () => {
      if (!batchId || !jeNumber) throw new Error('Batch ID and JE number are required')
      return tbImportApi.postBatch(batchId, jeNumber, notes)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-batches', orgId] })
      toast('Trial balance successfully posted to general ledger', 'success')
      setStep(5)
    },
    onError: (err: Error) => { setApiError(err.message) },
  })

  function downloadTemplate() {
    const csv = [
      'Account Number,Account Name,Debit,Credit',
      '1010,Cash & Cash Equivalents,50000.00,',
      '1200,Accounts Receivable,12500.00,',
      '2000,Accounts Payable,,8500.00',
      '3000,Retained Earnings,,44000.00',
      '4000,Revenue,,25000.00',
      '5000,Expense,15000.00,',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'trial_balance_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageLayout
      title="Trial Balance Import"
      subtitle="Import period-end balances and map to taxonomy structure"
      actions={
        <button
          type="button"
          onClick={() => navigate('/import')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="w-4 h-4" /> Cancel
        </button>
      }
    >
      <StepIndicator steps={WIZARD_STEPS} currentStep={step} onStepClick={(idx) => {
        if (idx < step) setStep(idx)
      }} />

      {duplicateWarning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3 mb-4">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Duplicate file detected</p>
            <p className="text-xs text-amber-700 mt-1">
              This file was already imported (Batch #{duplicateWarning.existingBatchId}, status: {duplicateWarning.existingStatus}).
              Import again to create a separate version, or view the existing batch.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => navigate(`/import/${duplicateWarning.existingBatchId}`)}
                className="text-xs px-3 py-1.5 border border-amber-400 rounded text-amber-800 hover:bg-amber-100"
              >
                View Existing Batch
              </button>
              <button
                type="button"
                onClick={() => { setDuplicateWarning(null); uploadMutation.mutate(true) }}
                disabled={uploadMutation.isPending}
                className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
              >
                Import Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {apiError && <ErrorBanner message={apiError} />}

      <div className="mt-6 max-w-4xl mx-auto bg-white border border-gray-200 rounded-xl shadow-sm p-6" data-testid="tb-import-form">
        
        {/* Step 0: Upload */}
        {step === 0 && (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Workspace Parameters</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <EntitySelect
                value={entityId}
                onChange={(id) => setEntityId(id)}
                label="Entity"
                required
              />
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  As of Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <ScenarioSelect
              value={scenarioId}
              onChange={(id) => setScenarioId(id)}
              label="Data Category"
              organizationId={orgId || undefined}
            />

            <div className="border-t border-gray-100 pt-5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-semibold text-gray-700">Upload trial balance file (CSV/XLSX)</span>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="flex items-center gap-1 text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Download Template
                </button>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const dropped = e.dataTransfer.files[0]
                  if (dropped) setFile(dropped)
                }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all duration-200 ${
                  dragOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50/50'
                }`}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-gray-400" />
                {file ? (
                  <div>
                    <p className="text-sm font-semibold text-gray-750">{file.name}</p>
                    <p className="text-xs text-gray-450 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600">Drag &amp; drop file, or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1.5">Supports standard accounting trial balance CSV or XLSX</p>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={!file || !entityId || !asOfDate || detectMutation.isPending}
                onClick={() => detectMutation.mutate()}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors cursor-pointer"
              >
                {detectMutation.isPending ? 'Processing…' : 'Proceed to Sheet & Mapping'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Sheet Selection — tabbed preview */}
        {step === 1 && detected && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Select Worksheet</h3>
              <p className="text-xs text-gray-500 mt-0.5">Click a tab to preview its data, then confirm your selection.</p>
            </div>            {/* Tab bar */}
            <div className="flex gap-0 border-b border-gray-200 overflow-x-auto overflow-y-hidden no-scrollbar">
              {detected.sheets.map((sheet: SheetInfo) => (
                <button
                  key={sheet.name}
                  type="button"
                  onClick={() => handleSheetChange(sheet.name)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px shrink-0 transition-colors ${
                    selectedSheet === sheet.name
                      ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="max-w-32 truncate">{sheet.name}</span>
                  <span className="text-[10px] text-gray-400">{sheet.row_count} rows</span>
                  {sheet.likely_tb_score >= 5 && (
                    <span className="rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[9px] font-bold">TB</span>
                  )}
                </button>
              ))}
            </div>

            {/* Raw sheet preview and header selection */}
            {(() => {
              const activeSheet = detected.sheets.find((s: SheetInfo) => s.name === selectedSheet)
              if (!activeSheet || !activeSheet.raw_rows || activeSheet.raw_rows.length === 0) return (
                <p className="text-xs text-gray-450 italic py-6 text-center">No data preview available for this sheet.</p>
              )
              const rawRows = activeSheet.raw_rows
              const numCols = rawRows.reduce((max: number, r: string[]) => Math.max(max, r.length), 0)
              const colIndices = Array.from({ length: numCols }, (_, i) => i)
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <p className="font-semibold">Worksheet preview — click a row to set as header</p>
                    <p>Header: Row {(headerRowIndex ?? 0) + 1} · {headers.filter(Boolean).length} columns</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 overflow-auto max-h-72 text-xs">
                    <table className="border-collapse w-max">
                      <thead className="sticky top-0 z-10 bg-gray-100">
                        <tr>
                          <th className="px-2 py-1 border border-gray-300 text-gray-400 text-right min-w-[3rem] select-none">#</th>
                          {colIndices.map(ci => (
                            <th key={ci} className="px-2 py-1 border border-gray-300 text-gray-600 min-w-[8rem] text-center font-semibold">
                              {colLetter(ci)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rawRows.map((row: string[], rowIdx: number) => {
                          const isHeader = rowIdx === headerRowIndex
                          return (
                            <tr
                              key={rowIdx}
                              onClick={() => handleHeaderRowIndexChange(rowIdx)}
                              className={`cursor-pointer transition-colors ${
                                isHeader ? 'bg-indigo-100 font-semibold' : 'even:bg-gray-50 hover:bg-indigo-50/50'
                              }`}
                            >
                              <td className={`px-2 py-1 border border-gray-250 text-right select-none ${isHeader ? 'text-indigo-700 font-bold' : 'text-gray-400'}`}>
                                {rowIdx + 1}{isHeader ? ' ★' : ''}
                              </td>
                              {colIndices.map(colIdx => {
                                const val = row[colIdx] ?? ''
                                return (
                                  <td
                                    key={colIdx}
                                    className={`px-2 py-1 border border-gray-250 whitespace-nowrap max-w-[12rem] overflow-hidden text-ellipsis ${
                                      val ? (isHeader ? 'text-indigo-800' : 'text-gray-800') : 'text-gray-350'
                                    }`}
                                    title={val}
                                  >
                                    {val}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}

            <div className="flex justify-between border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-semibold rounded hover:bg-gray-50 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="button"
                disabled={!selectedSheet}
                onClick={() => {
                  const active = detected.sheets.find((s: SheetInfo) => s.name === selectedSheet)
                  if (active) {
                    setColMapping(detected.detected_mapping)
                  }
                  setStep(2)
                }}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors cursor-pointer"
              >
                Use This Sheet
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Column Mapping — spreadsheet-style column picker */}
        {step === 2 && detected && (() => {
          const FIELD_OPTIONS = [
            { value: '',                 label: '— Ignore —' },
            { value: 'account_combined', label: 'Account # + Name (combined)' },
            { value: 'account_number',   label: 'Account Number ✱' },
            { value: 'account_name',     label: 'Account Name' },
            { value: 'debit',            label: 'Debit' },
            { value: 'credit',           label: 'Credit' },
            { value: 'balance',          label: 'Net Balance' },
            { value: 'description',      label: 'Description' },
          ]
          const FIELD_COLORS: Record<string, string> = {
            account_combined: 'bg-violet-50 border-violet-300',
            account_number:   'bg-indigo-50 border-indigo-300',
            account_name:     'bg-blue-50 border-blue-300',
            debit:            'bg-emerald-50 border-emerald-300',
            credit:           'bg-rose-50 border-rose-300',
            balance:          'bg-amber-50 border-amber-300',
            description:      'bg-purple-50 border-purple-300',
          }
          // Invert mapping: column_header_or_letter → field_key
          const colToField: Record<string, string> = {}
          for (const [field, col] of Object.entries(colMapping)) {
            if (col) colToField[col] = field
          }
          function setColField(colKey: string, fieldKey: string) {
            setColMapping(prev => {
              const next = { ...prev }
              // Remove any existing mapping to this column
              for (const [f, c] of Object.entries(next)) {
                if (c === colKey) delete next[f]
              }
              if (fieldKey) next[fieldKey] = colKey
              return next
            })
          }
          return (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Map Columns</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Use the dropdowns under each column header to assign what field each column represents.
                  Columns auto-detected are pre-filled.
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 overflow-auto max-h-[480px]">
                <table className="text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-white shadow-sm">
                    {/* Row 1: Column letters */}
                    <tr className="bg-gray-100 border-b border-gray-200 font-mono text-[11px]">
                      {headers.map((h: string, ci: number) => {
                        const letter = colLetter(ci)
                        const field = colToField[letter] ?? colToField[h]
                        return (
                          <th key={letter} className={`px-3 py-1 text-center font-semibold border-r border-gray-200 last:border-r-0 ${
                            field ? FIELD_COLORS[field] ?? 'bg-gray-100' : 'text-gray-500'
                          }`}>
                            {letter}
                          </th>
                        )
                      })}
                    </tr>
                    {/* Row 2: original column header */}
                    <tr className="bg-gray-55 border-b border-gray-200">
                      {headers.map((h: string, ci: number) => {
                        const letter = colLetter(ci)
                        const field = colToField[letter] ?? colToField[h]
                        return (
                          <th key={letter} className={`px-3 py-2 text-left font-semibold border-r border-gray-200 whitespace-nowrap last:border-r-0 ${
                            field ? FIELD_COLORS[field] ?? 'bg-gray-50' : 'text-gray-550'
                          }`}>
                            {h || <span className="text-gray-300 italic">blank</span>}
                          </th>
                        )
                      })}
                    </tr>
                    {/* Row 3: field assignment dropdowns */}
                    <tr className="bg-white border-b-2 border-indigo-200">
                      {headers.map((h: string, ci: number) => {
                        const letter = colLetter(ci)
                        const field = colToField[letter] ?? colToField[h]
                        return (
                          <td key={letter} className="px-2 py-1.5 border-r border-gray-100 last:border-r-0">
                            <select
                              value={field ?? ''}
                              onChange={(e) => setColField(letter || h, e.target.value)}
                              className={`w-full rounded border px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
                                field
                                  ? `${FIELD_COLORS[field] ?? 'bg-white border-gray-300'} font-medium`
                                  : 'bg-white border-gray-200 text-gray-400'
                              }`}
                            >
                              {FIELD_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </td>
                        )
                      })}
                    </tr>
                  </thead>
                  {/* Preview data rows */}
                  <tbody>
                    {previewRows.length === 0 && (
                      <tr><td colSpan={headers.length} className="px-3 py-4 text-center text-gray-400 italic">No preview data</td></tr>
                    )}
                    {previewRows.map((row: Record<string, string>, ri: number) => (
                      <tr key={ri} className={`border-b border-gray-50 ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                        {headers.map((h: string, ci: number) => {
                          const letter = colLetter(ci)
                          const field = colToField[letter] ?? colToField[h]
                          return (
                            <td key={letter} className={`px-3 py-1.5 border-r border-gray-100 last:border-r-0 whitespace-nowrap tabular-nums ${
                              field ? 'text-gray-800' : 'text-gray-400'
                            }`}>
                              {row[letter] ?? row[h] ?? ''}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!(colMapping['account_number'] || colMapping['account_combined']) && (
                <p className="text-xs text-red-600">
                  ✱ Map either <span className="font-semibold">Account Number</span> or{' '}
                  <span className="font-semibold">Account # + Name (combined)</span> before proceeding.
                </p>
              )}

              <div className="flex justify-between border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setStep(detected.sheets.length > 0 ? 1 : 0)}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-semibold rounded hover:bg-gray-50 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  disabled={!(colMapping['account_number'] || colMapping['account_combined']) || uploadMutation.isPending}
                  onClick={() => uploadMutation.mutate(false)}
                  className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {uploadMutation.isPending ? 'Uploading…' : 'Process & Validate'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })()}

        {/* Step 3 (NEW): Suggest Financial Statement Lines — simplified TB wizard */}
        {step === 3 && (
          <SuggestFsliStep
            batchId={batchId!}
            onBack={() => setStep(2)}
            onContinue={() => setStep(4)}
          />
        )}

        {/* Step 4 (was 3): Review Exceptions */}
        {step === 4 && (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Review Exceptions</h3>
            <p className="text-xs text-gray-500">
              Resolve any issues that block posting. Only exception rows are shown by default;
              expand "Show all accounts" to see every imported line.
            </p>

            {/* Totals summary */}
            <ReviewExceptionsSummary batchId={batchId!} previewRows={validationPreviewRows} validationIssues={validationIssues} />
            
            {/* Unmapped accounts warning CTA banner */}
            {validationIssues.some(i => i.code === 'IMPORT_MISSING_MAPPING') && (
              <div className="bg-yellow-50 border border-yellow-250 rounded-lg p-4 flex items-center justify-between gap-4 mb-4" data-testid="unmapped-accounts-warning">
                <div className="flex items-center gap-3 text-yellow-800">
                  <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
                  <div>
                    <p className="text-xs font-bold">Unmapped accounts detected</p>
                    <p className="text-[10px] text-yellow-600 mt-0.5">Some imported accounts are not mapped to your Chart of Accounts. These must be resolved before posting.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/import/${batchId}/mapping`)}
                  className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-semibold rounded shrink-0 transition-colors"
                >
                  Resolve Mappings
                </button>
              </div>
            )}

            {/* Validation Alerts */}
            <div className="space-y-2.5">
              {validationIssues.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-emerald-800">All validations passed</p>
                    <p className="text-[10px] text-emerald-600 mt-0.5">Debit/credit amounts balance. No mapping errors or duplications detected.</p>
                  </div>
                </div>
              ) : (
                validationIssues.map((issue, idx) => {
                  const isErr = issue.severity === 'error'
                  return (
                    <div
                      key={idx}
                      className={`border rounded-lg p-3.5 flex items-start gap-3 ${
                        isErr ? 'bg-red-50/50 border-red-200 text-red-800' : 'bg-amber-50/50 border-amber-200 text-amber-800'
                      }`}
                    >
                      <AlertCircle className={`w-4.5 h-4.5 shrink-0 mt-0.5 ${isErr ? 'text-red-500' : 'text-amber-500'}`} />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-[9px] mb-0.5">
                          {issue.severity} — {issue.code}
                        </p>
                        <p className="text-xs leading-relaxed">{issue.message}</p>
                        {issue.suggested_resolution && (
                          <p className="text-[10px] opacity-75 mt-1 font-medium">Suggestion: {issue.suggested_resolution}</p>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* AccountingDataGrid Preview */}
            <div className="border border-gray-250 rounded-lg overflow-auto h-72">
              <AccountingDataGrid
                columns={[
                  { key: 'raw_account_number', header: 'Account Number', render: (r: any) => <span className="font-semibold text-gray-800">{r.raw_account_number ?? '—'}</span> },
                  { key: 'raw_account_name', header: 'Account Name', render: (r: any) => <span className="text-gray-600 font-medium">{r.raw_account_name ?? '—'}</span> },
                  { key: 'debit', header: 'Debit', render: (r: any) => (r.debit && parseFloat(r.debit) !== 0 ? fmt(parseFloat(r.debit)) : '—') },
                  { key: 'credit', header: 'Credit', render: (r: any) => (r.credit && parseFloat(r.credit) !== 0 ? fmt(parseFloat(r.credit)) : '—') },
                  { key: 'mapping_status', header: 'Status', render: (r: any) => <span className={r.mapping_status === 'mapped' ? 'text-emerald-600 text-[10px] font-semibold' : 'text-amber-600 text-[10px]'}>{r.mapping_status}</span> },
                ]}
                rowKey={(r: any) => String(r.line_number ?? Math.random())}
                data={validationPreviewRows}
                emptyMessage="No rows found in this preview."
              />
            </div>

            <div className="flex justify-between border-t border-gray-100 pt-5">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-655 text-xs font-semibold rounded hover:bg-gray-50 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back to FS Lines
              </button>

              <button
                type="button"
                onClick={() => setStep(5)}
                disabled={validationIssues.some(i => i.severity === 'error')}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors cursor-pointer animate-pulse-subtle"
              >
                Next: Post to Ledger
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 5 (was 4): Post & Finalize */}
        {step === 5 && (
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Commit & Post to Ledger</h3>
            <p className="text-xs text-gray-500">Upon posting, a balanced journal entry will be recorded in the general ledger for the selected accounting period.</p>
            
            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Journal Entry Number</label>
                <input
                  type="text"
                  value={jeNumber}
                  onChange={(e) => setJeNumber(e.target.value)}
                  className="w-full border border-gray-300 rounded h-9 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-semibold"
                  placeholder="JE-TB-001"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes / Description</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded p-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Establish starting balances for Period..."
                />
              </div>
            </div>

            <div className="flex justify-between border-t border-gray-100 pt-5">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-655 text-xs font-semibold rounded hover:bg-gray-50 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back to Review Exceptions
              </button>
              
              <button
                type="button"
                disabled={!jeNumber || postMutation.isPending}
                onClick={() => postMutation.mutate()}
                className="flex items-center gap-1 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors shadow shadow-indigo-200 cursor-pointer"
              >
                {postMutation.isPending ? 'Posting…' : 'Post to Ledger'}
              </button>
            </div>
          </div>
        )}

      </div>
    </PageLayout>
  )
}
