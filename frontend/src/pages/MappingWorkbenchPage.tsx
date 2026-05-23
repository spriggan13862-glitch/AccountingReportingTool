import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Check, SkipForward, ArrowLeft, Lightbulb, Search,
  Filter, Download, ChevronDown, Plus, X,
} from 'lucide-react'
import { tbImportApi } from '@/api/tbImport'
import { accountsApi } from '@/api/accounts'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { useToast } from '@/providers/ToastProvider'
import { AccountingDataGrid } from '@/components/data-grid'
import type { GridColumn, BatchAction, RowAction } from '@/components/data-grid/types'
import type { ImportLine, ImportSuggestion, Account } from '@/types'

// ---------------------------------------------------------------------------
// Account search combobox
// ---------------------------------------------------------------------------

interface AccountSearchProps {
  entityId: number
  value: number | null
  onChange: (acct: Account | null) => void
  placeholder?: string
  inputRef?: React.RefObject<HTMLInputElement>
  onTab?: () => void
}

function AccountSearch({ entityId, value, onChange, placeholder, inputRef, onTab }: AccountSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const { data: results } = useQuery({
    queryKey: ['accounts-search', entityId, query],
    queryFn: () => accountsApi.list(entityId, query || undefined),
    enabled: open && query.length >= 1,
    placeholderData: (prev) => prev,
  })

  const accounts: Account[] = Array.isArray(results) ? results : (results as any)?.items ?? []

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Tab' && onTab) { onTab(); setOpen(false) }
          }}
          placeholder={placeholder ?? 'Search by account # or name…'}
          className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:border-indigo-400 focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(null); setQuery('') }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && accounts.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {accounts.map((acct) => (
            <button
              key={acct.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(acct); setQuery(`${acct.account_number} — ${acct.account_name}`); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2"
            >
              <span className="font-mono text-gray-600 shrink-0">{acct.account_number}</span>
              <span className="text-gray-800 truncate">{acct.account_name}</span>
              <span className="ml-auto text-xs text-gray-400 shrink-0">{acct.account_type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create account inline form
// ---------------------------------------------------------------------------

interface CreateFormProps {
  onSubmit: (data: { account_number: string; account_name: string; account_type: string; normal_balance: string }) => void
  onCancel: () => void
  isPending: boolean
  defaultNumber?: string
  defaultName?: string
}

function CreateAccountForm({ onSubmit, onCancel, isPending, defaultNumber = '', defaultName = '' }: CreateFormProps) {
  const [num, setNum] = useState(defaultNumber)
  const [name, setName] = useState(defaultName)
  const [type, setType] = useState('asset')
  const [normal, setNormal] = useState('debit')

  // auto-set normal balance from type
  useEffect(() => {
    setNormal(['asset', 'expense'].includes(type) ? 'debit' : 'credit')
  }, [type])

  return (
    <div className="bg-gray-50 border border-gray-200 rounded p-3 mt-2">
      <p className="text-xs font-semibold text-gray-700 mb-2">Create New Account</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          type="text"
          value={num}
          onChange={(e) => setNum(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          placeholder="Account number *"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          placeholder="Account name *"
        />
        <select value={type} onChange={(e) => setType(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm">
          {['asset', 'liability', 'equity', 'revenue', 'expense'].map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <select value={normal} onChange={(e) => setNormal(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm">
          <option value="debit">Debit normal</option>
          <option value="credit">Credit normal</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!num || !name || isPending}
          onClick={() => onSubmit({ account_number: num, account_name: name, account_type: type, normal_balance: normal })}
          className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
        >
          {isPending ? 'Creating…' : 'Create & Map'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function MappingWorkbenchPage() {
  const { id } = useParams<{ id: string }>()
  const batchId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [apiError, setApiError] = useState<string | null>(null)

  // Filters
  const [showMapped, setShowMapped] = useState(false)

  // Per-line state
  const [selectedAccounts, setSelectedAccounts] = useState<Record<number, Account | null>>({})
  const [createLineId, setCreateLineId] = useState<number | null>(null)

  // Row refs for keyboard nav
  const rowInputRefs = useRef<Record<number, React.RefObject<HTMLInputElement>>>({})

  const { data: batch } = useQuery({
    queryKey: ['import-batch', batchId],
    queryFn: () => tbImportApi.getBatch(batchId),
    enabled: !!batchId,
  })

  const { data: allLines, isLoading } = useQuery({
    queryKey: ['import-lines', batchId],
    queryFn: () => tbImportApi.getBatchLines(batchId),
    enabled: !!batchId,
  })

  const { data: suggestions } = useQuery({
    queryKey: ['import-suggestions', batchId],
    queryFn: () => tbImportApi.getSuggestions(batchId),
    enabled: !!batchId,
  })

  const suggestMap: Record<number, ImportSuggestion> = {}
  suggestions?.forEach((s: ImportSuggestion) => { suggestMap[s.line_id] = s })

  // Derived: filter lines
  const lines: ImportLine[] = allLines ?? []

  const unmappedCount = lines.filter((l) => l.mapping_status === 'unmapped').length
  const suggestCount = lines.filter(
    (l) => l.mapping_status === 'unmapped' && suggestMap[l.id]?.suggested_account_id != null
  ).length

  // Mutations
  const mapMutation = useMutation({
    mutationFn: ({ lineId, accountId }: { lineId: number; accountId: number }) =>
      tbImportApi.mapLine(batchId, lineId, accountId),
    onSuccess: (_, { lineId }) => {
      queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
      setSelectedAccounts((p) => { const n = { ...p }; delete n[lineId]; return n })
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const skipMutation = useMutation({
    mutationFn: (lineId: number) => tbImportApi.skipLine(batchId, lineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const createMutation = useMutation({
    mutationFn: ({ lineId, data }: { lineId: number; data: Parameters<typeof tbImportApi.createAccountFromLine>[2] }) =>
      tbImportApi.createAccountFromLine(batchId, lineId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-suggestions', batchId] })
      setCreateLineId(null)
      setApiError(null)
      toast('Account created and mapped', 'success')
    },
    onError: (err: Error) => setApiError(err.message),
  })

  function applyBulkSuggestions() {
    const mappings = lines
      .filter((l) => l.mapping_status === 'unmapped' && suggestMap[l.id]?.suggested_account_id != null)
      .map((l) => ({ line_id: l.id, account_id: suggestMap[l.id].suggested_account_id! }))
    if (!mappings.length) return
    tbImportApi
      .bulkMap(batchId, mappings)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
        queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
        queryClient.invalidateQueries({ queryKey: ['import-suggestions', batchId] })
        toast(`${mappings.length} suggestions applied`, 'success')
      })
      .catch((err: Error) => setApiError(err.message))
  }

  function handleExportMappings() {
    window.open(tbImportApi.exportMappingsUrl(batchId), '_blank')
  }

  function getOrCreateRef(lineId: number): React.RefObject<HTMLInputElement> {
    if (!rowInputRefs.current[lineId]) {
      rowInputRefs.current[lineId] = { current: null } as unknown as React.RefObject<HTMLInputElement>
    }
    return rowInputRefs.current[lineId]
  }

  function focusNextUnmapped(currentLineId: number) {
    const unmapped = lines.filter((l) => l.mapping_status === 'unmapped')
    const idx = unmapped.findIndex((l) => l.id === currentLineId)
    if (idx >= 0 && idx < unmapped.length - 1) {
      const nextId = unmapped[idx + 1].id
      rowInputRefs.current[nextId]?.current?.focus()
    }
  }

  const gridData = lines.filter((l) => {
    if (!showMapped && l.mapping_status !== 'unmapped') return false
    return true
  })

  const toolbarLeft = (
    <div className="flex items-center gap-4">
      <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
        <div
          onClick={() => setShowMapped((v) => !v)}
          className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${showMapped ? 'bg-indigo-600' : 'bg-gray-300'}`}
          data-testid="show-all-toggle"
        >
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showMapped ? 'translate-x-4' : ''}`} />
        </div>
        Show all (including mapped)
      </label>
      <div className="flex items-center gap-3 text-xs text-gray-500 border-l pl-4 border-gray-200 animate-in fade-in duration-300">
        <span className="bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-full font-medium">
          {unmappedCount} unmapped
        </span>
        <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
          {(batch?.row_count ?? 0) - unmappedCount} mapped
        </span>
      </div>
    </div>
  )

  const toolbarRight = suggestCount > 0 ? (
    <button
      type="button"
      onClick={applyBulkSuggestions}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs rounded hover:bg-amber-700 font-medium transition-colors shadow-sm"
      data-testid="accept-all-btn"
    >
      <Lightbulb className="w-3.5 h-3.5 text-white" />
      Accept all {suggestCount} suggestion{suggestCount !== 1 ? 's' : ''}
    </button>
  ) : undefined

  const gridColumns: GridColumn<ImportLine>[] = [
    {
      key: 'line_number',
      header: '#',
      sortable: true,
      sortValue: (line: ImportLine) => line.line_number,
      render: (line: ImportLine) => <span className="text-gray-400 text-xs font-semibold">{line.line_number}</span>,
      width: '60px',
    },
    {
      key: 'raw_account',
      header: 'Source Account',
      sortable: true,
      sortValue: (line: ImportLine) => line.raw_account_number || '',
      filterable: true,
      render: (line: ImportLine) => (
        <div>
          <span className="font-mono text-xs font-semibold text-gray-700">{line.raw_account_number || '—'}</span>
          {line.raw_account_name && (
            <span className="ml-2 text-gray-500 text-xs">{line.raw_account_name}</span>
          )}
        </div>
      ),
    },
    {
      key: 'raw_debit',
      header: 'DR',
      sortable: true,
      sortValue: (line: ImportLine) => line.raw_debit ? parseFloat(line.raw_debit) : 0,
      render: (line: ImportLine) => (
        <div className="text-right font-mono text-xs text-gray-600">
          {line.raw_debit != null && Number(line.raw_debit) !== 0
            ? Number(line.raw_debit).toLocaleString(undefined, { minimumFractionDigits: 2 })
            : '—'}
        </div>
      ),
    },
    {
      key: 'raw_credit',
      header: 'CR',
      sortable: true,
      sortValue: (line: ImportLine) => line.raw_credit ? parseFloat(line.raw_credit) : 0,
      render: (line: ImportLine) => (
        <div className="text-right font-mono text-xs text-gray-600">
          {line.raw_credit != null && Number(line.raw_credit) !== 0
            ? Number(line.raw_credit).toLocaleString(undefined, { minimumFractionDigits: 2 })
            : '—'}
        </div>
      ),
    },
    {
      key: 'raw_balance',
      header: 'Balance',
      sortable: true,
      sortValue: (line: ImportLine) => line.raw_balance ? parseFloat(line.raw_balance) : 0,
      render: (line: ImportLine) => (
        <div className="text-right font-mono text-xs text-gray-600">
          {line.raw_balance != null
            ? Number(line.raw_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })
            : '—'}
        </div>
      ),
    },
    {
      key: 'suggestion',
      header: 'Suggestion',
      sortable: true,
      sortValue: (line: ImportLine) => suggestMap[line.id]?.suggested_account_number || '',
      render: (line: ImportLine) => {
        const suggestion = suggestMap[line.id]
        if (!suggestion?.suggested_account_id || line.mapping_status !== 'unmapped') return <span className="text-gray-300">—</span>

        const isNumberMatch = !!(line.raw_account_number && suggestion.suggested_account_number?.startsWith(line.raw_account_number))
        const confidence = isNumberMatch ? 'High' : 'Medium'
        const evidence = isNumberMatch
          ? `Prefix match on account number "${line.raw_account_number}"`
          : `Substring match on account name "${line.raw_account_name}"`

        const confBadgeColor = isNumberMatch
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-yellow-50 text-yellow-700 border-yellow-200'

        return (
          <div className="flex flex-col gap-1 py-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                {suggestion.suggested_account_number}
              </span>
              <span className="text-xs text-gray-800 font-medium truncate max-w-[120px]" title={suggestion.suggested_account_name ?? ''}>
                {suggestion.suggested_account_name}
              </span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${confBadgeColor}`}>
                {confidence}
              </span>
            </div>
            <span className="text-[10px] text-gray-400 truncate max-w-[200px]" title={evidence}>
              {evidence}
            </span>
            <div className="mt-0.5">
              <button
                type="button"
                onClick={() => mapMutation.mutate({ lineId: line.id, accountId: suggestion.suggested_account_id! })}
                className="text-[10px] font-semibold px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded hover:bg-indigo-100 transition-colors"
                data-testid={`accept-suggestion-${line.id}`}
              >
                Accept
              </button>
            </div>
          </div>
        )
      }
    },
    {
      key: 'map_to_account',
      header: 'Map to Account',
      render: (line: ImportLine) => {
        const selectedAcct = selectedAccounts[line.id]
        const isMapped = line.mapping_status === 'mapped'
        const isSkipped = line.mapping_status === 'skipped'
        const isCreating = createLineId === line.id
        const entityId = batch?.entity_id ?? 0
        const inputRef = getOrCreateRef(line.id)

        if (isMapped) {
          return (
            <span className="text-xs font-medium text-green-700 flex items-center gap-1 bg-green-50 border border-green-200 px-2 py-0.5 rounded w-max">
              <Check className="w-3.5 h-3.5" /> Mapped
            </span>
          )
        }
        if (isSkipped) {
          return (
            <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded w-max">
              Skipped
            </span>
          )
        }
        if (isCreating) {
          return (
            <CreateAccountForm
              defaultNumber={line.raw_account_number ?? ''}
              defaultName={line.raw_account_name ?? ''}
              isPending={createMutation.isPending}
              onSubmit={(data) => createMutation.mutate({ lineId: line.id, data })}
              onCancel={() => setCreateLineId(null)}
            />
          )
        }

        return (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex-1 min-w-[160px]">
              <AccountSearch
                entityId={entityId}
                value={selectedAcct?.id ?? null}
                onChange={(acct) => setSelectedAccounts((p) => ({ ...p, [line.id]: acct }))}
                inputRef={inputRef as React.RefObject<HTMLInputElement>}
                onTab={() => focusNextUnmapped(line.id)}
              />
            </div>
            {selectedAcct && (
              <button
                type="button"
                disabled={mapMutation.isPending}
                onClick={() => mapMutation.mutate({ lineId: line.id, accountId: selectedAcct.id })}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50 shrink-0 font-medium transition-colors"
                data-testid={`map-btn-${line.id}`}
              >
                <Check className="w-3.5 h-3.5" /> Map
              </button>
            )}
          </div>
        )
      }
    }
  ]

  const rowActions: RowAction<ImportLine>[] = [
    {
      key: 'create_account',
      label: 'Create Account',
      icon: Plus,
      hidden: (row) => row.mapping_status !== 'unmapped',
      onClick: (row) => setCreateLineId(row.id),
    },
    {
      key: 'skip_line',
      label: 'Skip Line',
      icon: SkipForward,
      hidden: (row) => row.mapping_status !== 'unmapped',
      onClick: (row) => skipMutation.mutate(row.id),
    },
  ]

  const batchActions: BatchAction<ImportLine>[] = [
    {
      key: 'batch_accept',
      label: 'Accept Suggestions',
      icon: Lightbulb,
      disabled: (rows) => !rows.some((r) => r.mapping_status === 'unmapped' && suggestMap[r.id]?.suggested_account_id != null),
      onClick: async (rows) => {
        const selectedSuggestions = rows
          .filter((r) => r.mapping_status === 'unmapped' && suggestMap[r.id]?.suggested_account_id != null)
          .map((r) => ({ line_id: r.id, account_id: suggestMap[r.id].suggested_account_id! }))

        if (selectedSuggestions.length > 0) {
          try {
            await tbImportApi.bulkMap(batchId, selectedSuggestions)
            queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
            queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
            queryClient.invalidateQueries({ queryKey: ['import-suggestions', batchId] })
            toast(`${selectedSuggestions.length} suggestions applied`, 'success')
          } catch (err: any) {
            setApiError(err.message)
          }
        }
      },
    },
    {
      key: 'batch_skip',
      label: 'Skip Lines',
      icon: SkipForward,
      variant: 'default',
      disabled: (rows) => !rows.some((r) => r.mapping_status === 'unmapped'),
      onClick: async (rows) => {
        const toSkip = rows.filter((r) => r.mapping_status === 'unmapped')
        if (toSkip.length > 0) {
          try {
            await Promise.all(toSkip.map((r) => tbImportApi.skipLine(batchId, r.id)))
            queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
            queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
            toast(`${toSkip.length} lines skipped`, 'success')
          } catch (err: any) {
            setApiError(err.message)
          }
        }
      },
    },
  ]

  return (
    <PageLayout
      title="Mapping Workbench"
      subtitle={batch ? `${batch.filename} · ${unmappedCount} of ${batch.row_count ?? 0} lines unmapped` : 'Loading…'}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportMappings}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 font-medium"
          >
            <Download className="w-3.5 h-3.5" /> Export Mappings
          </button>
          <button
            type="button"
            onClick={() => navigate(`/import/${batchId}`)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Review
          </button>
        </div>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Mapping explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-xs text-blue-800">
        <p className="font-semibold mb-1">How mapping works</p>
        <p className="mb-1.5">
          Each imported source account must be mapped to an account in your entity's Chart of Accounts.
          COA accounts then link to financial statement reporting lines.
        </p>
        <div className="flex items-center gap-2 font-mono text-blue-700">
          <span className="bg-blue-100 px-2 py-0.5 rounded">Source Account</span>
          <span>→</span>
          <span className="bg-blue-100 px-2 py-0.5 rounded">Entity COA Account</span>
          <span>→</span>
          <span className="bg-blue-100 px-2 py-0.5 rounded">Reporting Line</span>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading lines…</p>
      ) : (
        <AccountingDataGrid
          columns={gridColumns}
          data={gridData}
          rowKey={(l) => l.id}
          rowActions={rowActions}
          batchActions={batchActions}
          selectionEnabled={true}
          toolbarLeft={toolbarLeft}
          toolbarRight={toolbarRight}
          searchPlaceholder="Filter by account # or name…"
          exportFilename={`mapping_workbench_${batchId}`}
          pageSize={50}
          data-testid="mapping-workbench-grid"
        />
      )}

      {/* Footer navigation */}
      {unmappedCount === 0 && lines.length > 0 && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-500 shrink-0" />
          <p className="text-sm text-green-800 flex-1">All lines are mapped. Run validation to check the import.</p>
          <button
            type="button"
            onClick={() => navigate(`/import/${batchId}`)}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 font-medium"
          >
            Go to Import Review
          </button>
        </div>
      )}
    </PageLayout>
  )
}
