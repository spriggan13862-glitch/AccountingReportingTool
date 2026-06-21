import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Check, SkipForward, ArrowLeft, Lightbulb, Search,
  Filter, Download, ChevronDown, ChevronRight, Plus, X, AlertTriangle, GitBranch,
  Trash2, Pencil, RotateCcw,
} from 'lucide-react'
import { tbImportApi } from '@/api/tbImport'
import { accountsApi } from '@/api/accounts'
import { reportingTaxonomyApi } from '@/api/reportingTaxonomy'
import { reportingViewsApi } from '@/api/reportingViews'
import { fsliMappingsApi } from '@/api/fsliMappings'
import { taxonomyLibraryApi } from '@/api/taxonomyLibrary'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { useToast } from '@/providers/ToastProvider'
import { AccountingDataGrid, FilterBar } from '@/components/data-grid'
import type { FilterBarFilterDef } from '@/components/data-grid'
import { TaxonomySuggestionPanel } from '@/components/taxonomy/TaxonomySuggestionPanel'
import type { GridColumn, BatchAction, RowAction } from '@/components/data-grid/types'
import type { ImportLine, ImportSuggestion, Account, AccountMatchResult, ReportingTaxonomyLine, FsliEffectiveMapping } from '@/types'

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
  onSubmit: (data: {
    account_number: string
    account_name: string
    account_type: string
    normal_balance: string
    reporting_taxonomy_line_id?: number | null
  }) => void
  onCancel: () => void
  isPending: boolean
  defaultNumber?: string
  defaultName?: string
  taxonomyLines: Array<{ id: number; name: string; code: string }>
}

function CreateAccountForm({ onSubmit, onCancel, isPending, defaultNumber = '', defaultName = '', taxonomyLines = [] }: CreateFormProps) {
  const [num, setNum] = useState(defaultNumber)
  const [name, setName] = useState(defaultName)
  const [type, setType] = useState('asset')
  const [normal, setNormal] = useState('debit')
  const [taxLineId, setTaxLineId] = useState<number | ''>('')

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
        <select
          value={taxLineId}
          onChange={(e) => setTaxLineId(e.target.value ? Number(e.target.value) : '')}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm col-span-2"
        >
          <option value="">— Select Reporting Line (optional) —</option>
          {taxonomyLines.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.code})
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!num || !name || isPending}
          onClick={() => onSubmit({ account_number: num, account_name: name, account_type: type, normal_balance: normal, reporting_taxonomy_line_id: taxLineId || null })}
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
// Helpers
// ---------------------------------------------------------------------------

function looksLikeTotalRow(line: ImportLine): boolean {
  const hasNoAccount = !line.raw_account_number?.trim() && !line.raw_account_name?.trim()
  const debit = parseFloat(line.raw_debit ?? '0')
  const credit = parseFloat(line.raw_credit ?? '0')
  const balance = parseFloat(line.raw_balance ?? '0')
  const hasLargeAmount = Math.abs(debit) > 1000 || Math.abs(credit) > 1000 || Math.abs(balance) > 1000
  const nameIsTotal = /^(total|subtotal|check|sum|grand total)/i.test(line.raw_account_name ?? '')
  return (hasNoAccount && hasLargeAmount) || nameIsTotal
}

function getMappingStatusLabel(
  line: ImportLine,
  accountMap: Record<number, Account>,
  matchResult?: AccountMatchResult,
): React.ReactNode {
  if (line.mapping_status === 'skipped') {
    return <span className="text-xs text-gray-400 italic">Excluded</span>
  }

  // Show conflict chip regardless of mapping status
  if (matchResult?.match_status === 'conflict') {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded" data-testid="conflict-chip">
          <AlertTriangle className="w-3 h-3 shrink-0" /> Number conflict
        </span>
        {matchResult.conflict_reason && (
          <span className="text-[10px] text-red-600 leading-tight">{matchResult.conflict_reason}</span>
        )}
      </div>
    )
  }

  if (line.resolved_account_id && accountMap[line.resolved_account_id]) {
    const acct = accountMap[line.resolved_account_id]
    const isNameOnly = matchResult?.match_status === 'name_only'
    const isParent = matchResult?.match_status === 'parent'
    return (
      <div className="text-xs flex flex-col gap-0.5">
        <div>
          <span className="font-mono text-gray-700 font-semibold">{acct.account_number}</span>
          <span className="ml-1 text-gray-500 whitespace-nowrap" title={acct.account_name}>{acct.account_name}</span>
        </div>
        {isNameOnly && (
          <span className="inline-flex items-center gap-1 text-[10px] text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded w-max" data-testid="name-match-chip">
            Name match — verify
          </span>
        )}
        {isParent && (
          <span className="inline-flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded w-max" data-testid="parent-match-chip">
            Parent account match
          </span>
        )}
      </div>
    )
  }
  if (looksLikeTotalRow(line)) {
    return <span className="text-xs text-orange-500 italic">Total / header row — exclude</span>
  }
  if (!line.raw_account_number?.trim()) {
    return <span className="text-xs text-amber-600 italic">Awaiting parent assignment</span>
  }
  return <span className="text-xs text-indigo-500 italic">New COA account candidate</span>
}

function guessAccountTypeAndNormal(code: string): { account_type: string; normal_balance: string } {
  const c = code.toLowerCase()
  if (c.includes('asset') || c.startsWith('1')) return { account_type: 'asset', normal_balance: 'debit' }
  if (c.includes('liab') || c.startsWith('2')) return { account_type: 'liability', normal_balance: 'credit' }
  if (c.includes('equi') || c.startsWith('3')) return { account_type: 'equity', normal_balance: 'credit' }
  if (c.includes('rev') || c.includes('inc') || c.startsWith('4')) return { account_type: 'revenue', normal_balance: 'credit' }
  if (c.includes('exp') || c.startsWith('5') || c.startsWith('6') || c.startsWith('7') || c.startsWith('8')) return { account_type: 'expense', normal_balance: 'debit' }
  return { account_type: 'asset', normal_balance: 'debit' }
}

// Flatten taxonomy tree (leaf nodes only) into FSLI options.
function flattenTaxonomyLeaves(tree: any[]): Array<{ id: number; name: string; code: string; section: string }> {
  const out: Array<{ id: number; name: string; code: string; section: string }> = []
  function walk(node: any, inheritedSection: string) {
    if (!node) return
    const section = node.financial_statement_section ?? inheritedSection ?? ''
    const children = node.children ?? []
    if (children.length === 0) {
      out.push({ id: node.id, name: node.name, code: node.code, section })
    } else {
      children.forEach((c: any) => walk(c, section))
    }
  }
  tree.forEach((n) => walk(n, n.financial_statement_section ?? ''))
  return out
}

// Agent 3.6: canonical display order for FSLI sections, matching the
// statement reading order the user expects.
const FSLI_SECTION_ORDER: string[] = [
  'Assets',
  'Liabilities',
  'Equity',
  'Revenue',
  'Cost of Revenue',
  'Operating Expenses',
  'Other Income / Expense',
  'Other Income Expense',
  'Income Taxes',
  'Cash Flow Operating',
  'Cash Flow Investing',
  'Cash Flow Financing',
  'KPI',
  'Disclosure',
]

function normalizeSectionForOrder(raw: string | null | undefined): string {
  if (!raw) return ''
  // Legacy section codes use lowercase + underscores; Sprint O nodes use Title Case.
  const lower = raw.toLowerCase().replace(/[_\s]+/g, ' ').trim()
  const map: Record<string, string> = {
    'assets': 'Assets', 'liabilities': 'Liabilities', 'equity': 'Equity',
    'revenue': 'Revenue', 'cogs': 'Cost of Revenue', 'cost of revenue': 'Cost of Revenue',
    'expense': 'Operating Expenses', 'opex': 'Operating Expenses',
    'operating expenses': 'Operating Expenses',
    'other income': 'Other Income / Expense', 'other expense': 'Other Income / Expense',
    'other income / expense': 'Other Income / Expense',
    'income taxes': 'Income Taxes', 'tax': 'Income Taxes',
    'cash flow operating': 'Cash Flow Operating',
    'cash flow investing': 'Cash Flow Investing',
    'cash flow financing': 'Cash Flow Financing',
    'kpi': 'KPI', 'disclosure': 'Disclosure',
  }
  return map[lower] ?? raw
}

function groupFsliOptionsBySection(
  options: Array<{ id: number; name: string; code?: string; section?: string }>,
): Array<{ section: string; options: Array<{ id: number; name: string; code?: string }> }> {
  const buckets = new Map<string, Array<{ id: number; name: string; code?: string }>>()
  for (const opt of options) {
    const sec = normalizeSectionForOrder(opt.section ?? '') || '— Other —'
    if (!buckets.has(sec)) buckets.set(sec, [])
    buckets.get(sec)!.push({ id: opt.id, name: opt.name, code: opt.code })
  }
  // Sort each bucket's options alphabetically by name
  for (const arr of buckets.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name))
  }
  // Order sections per FSLI_SECTION_ORDER, with unknown sections last alphabetically
  const known = FSLI_SECTION_ORDER.filter((s) => buckets.has(s))
  const unknown = Array.from(buckets.keys())
    .filter((s) => !FSLI_SECTION_ORDER.includes(s))
    .sort()
  return [...known, ...unknown].map((section) => ({ section, options: buckets.get(section)! }))
}

// ---------------------------------------------------------------------------
// Inline COA swap editor — Issue 12
// ---------------------------------------------------------------------------

interface MatchedCoaEditorProps {
  entityId: number
  currentAcct: Account
  onSelect: (acct: Account) => void
  onCancel: () => void
  pending: boolean
}

function MatchedCoaEditor({ entityId, currentAcct, onSelect, onCancel, pending }: MatchedCoaEditorProps) {
  const [picked, setPicked] = useState<Account | null>(null)
  return (
    <div className="flex items-center gap-1" data-testid={`coa-override-editor-${currentAcct.id}`}>
      <div className="flex-1 min-w-[180px]">
        <AccountSearch
          entityId={entityId}
          value={picked?.id ?? null}
          onChange={setPicked}
          placeholder="Search COA…"
        />
      </div>
      <button
        type="button"
        disabled={!picked || pending}
        onClick={() => picked && onSelect(picked)}
        className="px-2 py-1 bg-indigo-600 text-white text-[11px] rounded hover:bg-indigo-700 disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-2 py-1 border border-gray-300 text-gray-600 text-[11px] rounded hover:bg-gray-50"
      >
        Cancel
      </button>
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
  const fmtAmount = useFormatCurrency()

  // Active reporting view for FSLI assignments
  const [activeViewId, setActiveViewId] = useState<number | null>(null)

  // Filters — Sprint G base + Issue 6 expanded
  const [showMapped, setShowMapped] = useState(false)
  const [colFilters, setColFilters] = useState({ sourceAccount: '', fsliText: '', status: 'all' })
  const [extFilters, setExtFilters] = useState({
    statusChips: [] as string[],
    accountType: 'all',
    coaMatchState: 'all',
    taxonomyAssignment: 'all',
    confidenceMin: 0,
    confidenceMax: 100,
    parentContains: '',
    inheritedFromContains: '',
  })
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)

  // Issue 4 — grouping
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat')
  const [viewModeAutoSet, setViewModeAutoSet] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  // Per-line state
  const [selectedAccounts, setSelectedAccounts] = useState<Record<number, Account | null>>({})
  const [createLineId, setCreateLineId] = useState<number | null>(null)
  const [editingLines, setEditingLines] = useState<Record<number, boolean>>({})

  // Issue 12 — matched COA override
  const [overrideEditing, setOverrideEditing] = useState<Record<number, boolean>>({})
  const [overriddenLines, setOverriddenLines] = useState<Record<number, boolean>>({})

  // Issue 5 — delete confirmation state
  const [deleteConfirmLineId, setDeleteConfirmLineId] = useState<number | null>(null)
  const [deleteBatchConfirmOpen, setDeleteBatchConfirmOpen] = useState(false)

  // Batch mapping state
  const [isBatchMapOpen, setIsBatchMapOpen] = useState(false)
  const [batchMapLines, setBatchMapLines] = useState<ImportLine[]>([])
  const [batchMapAccount, setBatchMapAccount] = useState<Account | null>(null)

  // Sprint O6 — Auto-map taxonomies state
  const [isAutoMapOpen, setIsAutoMapOpen] = useState(false)
  const [autoMapTaxonomyIds, setAutoMapTaxonomyIds] = useState<number[]>([])
  const [autoMapRunning, setAutoMapRunning] = useState(false)

  // Issue 7 — FSLI source taxonomy (override fallback)
  const [fsliSourceTaxonomyId, setFsliSourceTaxonomyId] = useState<number | null>(null)

  const { data: availableTaxonomies = [] } = useQuery({
    queryKey: ['taxonomies-list'],
    queryFn: () => taxonomyLibraryApi.list(),
  })

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

  const { data: matchResults } = useQuery({
    queryKey: ['import-match-results', batchId],
    queryFn: () => tbImportApi.parseAndMatch(batchId),
    enabled: !!batchId,
  })

  const { data: legacyTaxonomyLines = [] } = useQuery({
    queryKey: ['reporting-taxonomy'],
    queryFn: () => reportingTaxonomyApi.list(),
  })

  // Issue 7 — fallback taxonomy resolution
  const fallbackTaxonomy = useMemo(() => {
    if (!availableTaxonomies || availableTaxonomies.length === 0) return null
    const systemActive = availableTaxonomies.filter((t) => t.is_system && t.is_active)
    const gaap = systemActive.find((t) => t.code === 'us_gaap')
    return gaap ?? systemActive[0] ?? availableTaxonomies[0] ?? null
  }, [availableTaxonomies])

  const usingFallback = legacyTaxonomyLines.length === 0 && fallbackTaxonomy != null
  const resolvedSourceTaxonomyId = fsliSourceTaxonomyId ?? (usingFallback ? fallbackTaxonomy?.id ?? null : null)

  const { data: fallbackTree = [] } = useQuery({
    queryKey: ['taxonomy-tree-fallback', resolvedSourceTaxonomyId],
    queryFn: () => taxonomyLibraryApi.tree(resolvedSourceTaxonomyId!),
    enabled: !!resolvedSourceTaxonomyId && usingFallback,
  })

  const fallbackFsliOptions = useMemo(() => flattenTaxonomyLeaves(fallbackTree as any[]), [fallbackTree])

  // Unified FSLI option list: prefer legacy, fall back to taxonomy library leaves.
  // Agent 3.6: each option carries `section` so the dropdown can group them.
  const fsliOptions: Array<{ id: number; name: string; code?: string; section?: string }> = useMemo(() => {
    if (legacyTaxonomyLines.length > 0) {
      return legacyTaxonomyLines.map((t: ReportingTaxonomyLine) => ({
        id: t.id, name: t.name, code: t.code, section: t.section,
      }))
    }
    return fallbackFsliOptions
  }, [legacyTaxonomyLines, fallbackFsliOptions])

  const fsliOptionsGrouped = useMemo(() => groupFsliOptionsBySection(fsliOptions), [fsliOptions])

  const { data: reportingViews = [] } = useQuery({
    queryKey: ['reporting-views'],
    queryFn: () => reportingViewsApi.list(),
  })

  const entityId = batch?.entity_id ?? 0

  // Default activeViewId to the is_default view once views load
  const defaultView = reportingViews.find((v) => v.is_default) ?? reportingViews[0] ?? null
  const resolvedViewId = activeViewId ?? defaultView?.id ?? null

  const { data: entityAccounts = [] } = useQuery({
    queryKey: ['accounts-all', entityId],
    queryFn: () => accountsApi.list(entityId),
    enabled: !!entityId,
  })

  const { data: inheritanceData = [] } = useQuery({
    queryKey: ['fsli-inheritance', entityId, resolvedViewId],
    queryFn: () => fsliMappingsApi.listWithInheritance(entityId, resolvedViewId!),
    enabled: !!entityId && !!resolvedViewId,
  })

  const inheritanceMap = useMemo(() => {
    const map: Record<number, FsliEffectiveMapping> = {}
    inheritanceData.forEach((item) => { map[item.account_id] = item })
    return map
  }, [inheritanceData])

  const accountMap = useMemo(() => {
    const map: Record<number, Account> = {}
    if (Array.isArray(entityAccounts)) {
      entityAccounts.forEach((a) => {
        map[a.id] = a
      })
    }
    return map
  }, [entityAccounts])

  const suggestMap: Record<number, ImportSuggestion> = {}
  suggestions?.forEach((s: ImportSuggestion) => { suggestMap[s.line_id] = s })

  const matchMap: Record<number, AccountMatchResult> = {}
  matchResults?.forEach((m: AccountMatchResult) => { matchMap[m.line_id] = m })

  // Derived: filter lines
  const lines: ImportLine[] = allLines ?? []

  const unmappedCount = lines.filter((l) => l.mapping_status === 'unmapped').length
  const suggestCount = lines.filter(
    (l) => l.mapping_status === 'unmapped' && suggestMap[l.id]?.suggested_account_id != null
  ).length
  const conflictCount = lines.filter((l) => matchMap[l.id]?.match_status === 'conflict').length

  // Issue 4 — auto-default to grouped if ≥3 accounts share a parent
  useEffect(() => {
    if (viewModeAutoSet || lines.length === 0 || Object.keys(accountMap).length === 0) return
    const parentCounts: Record<string, number> = {}
    lines.forEach((l) => {
      const acct = l.resolved_account_id ? accountMap[l.resolved_account_id] : null
      const key = acct?.parent_account_id != null ? String(acct.parent_account_id) : '__none__'
      parentCounts[key] = (parentCounts[key] ?? 0) + 1
    })
    const hasBigGroup = Object.entries(parentCounts).some(([k, n]) => k !== '__none__' && n >= 3)
    if (hasBigGroup) setViewMode('grouped')
    setViewModeAutoSet(true)
  }, [lines, accountMap, viewModeAutoSet])

  // Mutations
  const mapMutation = useMutation({
    mutationFn: ({ lineId, accountId }: { lineId: number; accountId: number }) =>
      tbImportApi.mapLine(batchId, lineId, accountId),
    onSuccess: (_, { lineId }) => {
      queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-match-results', batchId] })
      setSelectedAccounts((p) => { const n = { ...p }; delete n[lineId]; return n })
      setEditingLines((p) => { const n = { ...p }; delete n[lineId]; return n })
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

  const updateFsliMutation = useMutation({
    mutationFn: ({ accountId, taxonomyLineId }: { accountId: number; taxonomyLineId: number | null }) => {
      if (!resolvedViewId) return Promise.reject(new Error('No reporting view selected'))
      return fsliMappingsApi.upsert(entityId, resolvedViewId, accountId, taxonomyLineId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts-all', entityId] })
      toast('FSLI mapping updated', 'success')
    },
    onError: (err: Error) => setApiError(err.message),
  })

  // Issue 5 — delete mutations
  const deleteLineMutation = useMutation({
    mutationFn: (lineId: number) => tbImportApi.deleteLine(batchId, lineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
      setDeleteConfirmLineId(null)
      toast('Line deleted', 'success')
    },
    onError: (err: any) => {
      const status = err?.response?.status ?? err?.status
      if (status === 409) {
        toast('Batch is posted — rollback instead', 'error')
      } else {
        setApiError(err?.message ?? 'Failed to delete line')
      }
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (lineIds: number[]) => tbImportApi.bulkDeleteLines(batchId, lineIds),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
      toast(`${res.deleted} line${res.deleted === 1 ? '' : 's'} deleted`, 'success')
    },
    onError: (err: any) => {
      const status = err?.response?.status ?? err?.status
      if (status === 409) {
        toast('Batch is posted — rollback instead', 'error')
      } else {
        setApiError(err?.message ?? 'Failed to delete lines')
      }
    },
  })

  const deleteBatchMutation = useMutation({
    mutationFn: () => tbImportApi.deleteBatch(batchId),
    onSuccess: () => {
      toast('Batch deleted', 'success')
      navigate('/import')
    },
    onError: (err: any) => {
      const status = err?.response?.status ?? err?.status
      if (status === 409) {
        toast('Batch is posted — rollback instead', 'error')
      } else {
        setApiError(err?.message ?? 'Failed to delete batch')
      }
    },
  })

  // Issue 12 — swap matched COA
  const swapCoaMutation = useMutation({
    mutationFn: ({ lineId, accountId }: { lineId: number; accountId: number }) =>
      tbImportApi.swapMatchedAccount(batchId, lineId, accountId),
    onSuccess: (_, { lineId }) => {
      queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
      queryClient.invalidateQueries({ queryKey: ['import-match-results', batchId] })
      setOverrideEditing((p) => { const n = { ...p }; delete n[lineId]; return n })
      setOverriddenLines((p) => ({ ...p, [lineId]: true }))
      toast('Matched COA updated', 'success')
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

  function handleExportMappingIssues() {
    const unmappedLines = lines.filter((l) => l.mapping_status === 'unmapped')
    if (unmappedLines.length === 0) {
      toast('No unmapped issues to export', 'info')
      return
    }
    const headers = ['Source Account #', 'Source Name', 'Suggested Account #', 'Suggested Account Name']
    const rows = unmappedLines.map((l) => {
      const sug = suggestMap[l.id]
      return [
        l.raw_account_number ?? '',
        l.raw_account_name ?? '',
        sug?.suggested_account_number ?? '',
        sug?.suggested_account_name ?? '',
      ]
    })
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mapping_issues_batch_${batchId}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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

  // Account type options for Issue 6 dropdown
  const accountTypeOptions = useMemo(() => {
    const set = new Set<string>()
    Object.values(accountMap).forEach((a) => { if (a.account_type) set.add(a.account_type) })
    return Array.from(set).sort()
  }, [accountMap])

  const gridData = useMemo(() => {
    return lines.filter((l) => {
      // Original status toggle
      if (!showMapped && l.mapping_status !== 'unmapped' && colFilters.status !== 'conflict') return false
      if (colFilters.status === 'conflict') {
        if (matchMap[l.id]?.match_status !== 'conflict') return false
      } else if (colFilters.status !== 'all' && l.mapping_status !== colFilters.status) {
        return false
      }
      if (colFilters.sourceAccount) {
        const q = colFilters.sourceAccount.toLowerCase()
        if (!(l.raw_account_number?.toLowerCase().includes(q) ?? false) &&
            !(l.raw_account_name?.toLowerCase().includes(q) ?? false)) return false
      }
      if (colFilters.fsliText) {
        const acct = l.resolved_account_id ? accountMap[l.resolved_account_id] : null
        const taxLine = acct?.reporting_taxonomy_line_id
          ? fsliOptions.find((t) => t.id === acct.reporting_taxonomy_line_id)
          : null
        if (!taxLine?.name.toLowerCase().includes(colFilters.fsliText.toLowerCase())) return false
      }

      // Issue 6 — extended filters
      const acct = l.resolved_account_id ? accountMap[l.resolved_account_id] : null
      const eff = acct ? inheritanceMap[acct.id] : undefined

      // Status chips
      if (extFilters.statusChips.length > 0) {
        const chips = new Set(extFilters.statusChips)
        let match = false
        if (chips.has('mapped') && l.mapping_status === 'mapped') match = true
        if (chips.has('unmapped') && l.mapping_status === 'unmapped') match = true
        if (chips.has('conflict') && matchMap[l.id]?.match_status === 'conflict') match = true
        if (chips.has('inherited') && eff && (eff.mapping_source === 'parent' || eff.mapping_source === 'grandparent')) match = true
        if (!match) return false
      }

      // Account type
      if (extFilters.accountType !== 'all') {
        if (!acct || acct.account_type !== extFilters.accountType) return false
      }

      // COA match state
      if (extFilters.coaMatchState !== 'all') {
        const m = matchMap[l.id]
        const matched = !!l.resolved_account_id
        if (extFilters.coaMatchState === 'matched' && !matched) return false
        if (extFilters.coaMatchState === 'unmatched' && (matched || (m && m.match_status !== 'not_found'))) return false
        if (extFilters.coaMatchState === 'will-create') {
          if (matched || looksLikeTotalRow(l) || !l.raw_account_number?.trim()) return false
        }
      }

      // Taxonomy assignment
      if (extFilters.taxonomyAssignment !== 'all') {
        const hasFsli = !!(eff?.taxonomy_line_id || acct?.reporting_taxonomy_line_id)
        if (extFilters.taxonomyAssignment === 'has-fsli' && !hasFsli) return false
        if (extFilters.taxonomyAssignment === 'no-fsli' && hasFsli) return false
      }

      // Confidence range — applies only when there's a suggestion
      const sug = suggestMap[l.id]
      if (sug?.suggested_account_id) {
        const isNumberMatch = !!(l.raw_account_number && sug.suggested_account_number?.startsWith(l.raw_account_number))
        const conf = isNumberMatch ? 95 : 60
        if (conf < extFilters.confidenceMin || conf > extFilters.confidenceMax) return false
      }

      // Parent account contains
      if (extFilters.parentContains && acct?.parent_account_id != null) {
        const parent = accountMap[acct.parent_account_id]
        const q = extFilters.parentContains.toLowerCase()
        const matches = !!parent && (
          parent.account_number.toLowerCase().includes(q) ||
          parent.account_name.toLowerCase().includes(q)
        )
        if (!matches) return false
      } else if (extFilters.parentContains) {
        return false
      }

      // Inherited from contains
      if (extFilters.inheritedFromContains) {
        const q = extFilters.inheritedFromContains.toLowerCase()
        const inheritedFrom = eff?.inherited_from_account_number ?? ''
        if (!inheritedFrom.toLowerCase().includes(q)) return false
      }

      return true
    })
  }, [lines, showMapped, colFilters, extFilters, accountMap, fsliOptions, inheritanceMap, matchMap, suggestMap])

  // Issue 4 — group data by parent
  const groupedData = useMemo(() => {
    if (viewMode !== 'grouped') return null
    const groups: Record<string, { parent: Account | null; key: string; lines: ImportLine[] }> = {}
    gridData.forEach((l) => {
      const acct = l.resolved_account_id ? accountMap[l.resolved_account_id] : null
      const parentId = acct?.parent_account_id
      const parent = parentId != null ? accountMap[parentId] ?? null : null
      const key = parent ? `p-${parent.id}` : '__ungrouped__'
      if (!groups[key]) groups[key] = { parent, key, lines: [] }
      groups[key].lines.push(l)
    })
    return Object.values(groups).sort((a, b) => {
      if (a.key === '__ungrouped__') return 1
      if (b.key === '__ungrouped__') return -1
      return (a.parent?.account_number ?? '').localeCompare(b.parent?.account_number ?? '')
    })
  }, [gridData, viewMode, accountMap])

  const parentChildSummary = useMemo(() => {
    if (!groupedData) return { parents: 0, children: 0 }
    const parents = groupedData.filter((g) => g.parent != null).length
    const children = groupedData.reduce((s, g) => s + g.lines.length, 0)
    return { parents, children }
  }, [groupedData])

  // For grouped flat view, ensure when a group is collapsed, its children are removed.
  const visibleGridData = useMemo(() => {
    if (viewMode !== 'grouped' || !groupedData) return gridData
    const out: ImportLine[] = []
    groupedData.forEach((g) => {
      const expanded = expandedGroups[g.key] ?? true
      if (expanded) out.push(...g.lines)
    })
    return out
  }, [viewMode, groupedData, expandedGroups, gridData])

  const expandAll = useCallback(() => {
    if (!groupedData) return
    const all: Record<string, boolean> = {}
    groupedData.forEach((g) => { all[g.key] = true })
    setExpandedGroups(all)
  }, [groupedData])

  const collapseAll = useCallback(() => {
    if (!groupedData) return
    const all: Record<string, boolean> = {}
    groupedData.forEach((g) => { all[g.key] = false })
    setExpandedGroups(all)
  }, [groupedData])

  const toolbarLeft = (
    <div className="flex items-center gap-4 flex-wrap">
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

      {/* Issue 4 — view mode toggle */}
      <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-0.5 bg-white">
        <button
          type="button"
          onClick={() => setViewMode('flat')}
          data-testid="view-mode-flat"
          className={`px-2 py-1 text-xs rounded ${viewMode === 'flat' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          Flat
        </button>
        <button
          type="button"
          onClick={() => setViewMode('grouped')}
          data-testid="view-mode-grouped"
          className={`px-2 py-1 text-xs rounded ${viewMode === 'grouped' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          Grouped
        </button>
      </div>

      {viewMode === 'grouped' && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={expandAll}
            data-testid="expand-all-btn"
            className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            data-testid="collapse-all-btn"
            className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
          >
            Collapse all
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-gray-500 border-l pl-4 border-gray-200 animate-in fade-in duration-300">
        <span className="bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-full font-medium">
          {unmappedCount} unmapped
        </span>
        <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
          {(batch?.row_count ?? 0) - unmappedCount} mapped
        </span>
        {conflictCount > 0 && (
          <button
            type="button"
            onClick={() => { setColFilters((p) => ({ ...p, status: 'conflict' })); setShowMapped(true) }}
            className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-medium flex items-center gap-1 hover:bg-red-200 transition-colors"
            data-testid="conflicts-filter-badge"
          >
            <AlertTriangle className="w-3 h-3" /> {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
          </button>
        )}
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
      render: (line: ImportLine) => {
        const num = line.raw_account_number || ''
        const isSub = num.includes('-') || num.includes('.') || num.includes(':')
        const name = line.raw_account_name ?? ''
        return (
          <div style={isSub ? { paddingLeft: '1.25rem' } : undefined} className="py-2">
            {isSub && <span className="text-gray-400 font-mono text-xs select-none mr-1">└─</span>}
            <span className="font-mono text-xs font-semibold text-gray-700 whitespace-nowrap">{num || '—'}</span>
            {name && (
              <span className="ml-2 text-gray-500 text-xs whitespace-nowrap" title={name}>{name}</span>
            )}
          </div>
        )
      },
    },
    {
      key: 'raw_debit',
      header: 'DR',
      sortable: true,
      filterable: true,
      filterType: 'numeric' as const,
      sortValue: (line: ImportLine) => line.raw_debit != null ? parseFloat(line.raw_debit) : 0,
      // Agent 3.3: dash means blank/null. Zero means a real zero balance.
      render: (line: ImportLine) => (
        <div className="text-right font-mono text-xs text-gray-600 py-2">
          {line.raw_debit != null ? fmtAmount(Number(line.raw_debit), { decimals: 2, symbol: '' }) : '—'}
        </div>
      ),
    },
    {
      key: 'raw_credit',
      header: 'CR',
      sortable: true,
      filterable: true,
      filterType: 'numeric' as const,
      sortValue: (line: ImportLine) => line.raw_credit != null ? parseFloat(line.raw_credit) : 0,
      render: (line: ImportLine) => (
        <div className="text-right font-mono text-xs text-gray-600 py-2">
          {line.raw_credit != null ? fmtAmount(Number(line.raw_credit), { decimals: 2, symbol: '' }) : '—'}
        </div>
      ),
    },
    {
      key: 'raw_balance',
      header: 'Balance',
      sortable: true,
      filterable: true,
      filterType: 'numeric' as const,
      // Agent 3.4: Balance = DR − CR. If source provides an explicit balance
      // column we honor that; otherwise we compute from DR/CR. Blank columns
      // are treated as 0 only when the other side has a value.
      sortValue: (line: ImportLine) => {
        const explicit = line.raw_balance != null ? parseFloat(line.raw_balance) : null
        if (explicit != null) return explicit
        const d = line.raw_debit != null ? parseFloat(line.raw_debit) : 0
        const c = line.raw_credit != null ? parseFloat(line.raw_credit) : 0
        return d - c
      },
      render: (line: ImportLine) => {
        const explicit = line.raw_balance != null ? Number(line.raw_balance) : null
        const dr = line.raw_debit != null ? Number(line.raw_debit) : null
        const cr = line.raw_credit != null ? Number(line.raw_credit) : null
        let value: number | null = explicit
        if (value === null) {
          if (dr === null && cr === null) {
            value = null
          } else {
            value = (dr ?? 0) - (cr ?? 0)
          }
        }
        return (
          <div className="text-right font-mono text-xs text-gray-600 py-2">
            {value != null ? fmtAmount(value, { decimals: 2, symbol: '' }) : '—'}
          </div>
        )
      },
    },
    {
      key: 'matched_coa',
      header: 'Matched COA / Status',
      filterable: true,
      sortable: true,
      sortValue: (line: ImportLine) => line.resolved_account_id ? (accountMap[line.resolved_account_id]?.account_number ?? '') : '',
      filterValue: (line: ImportLine) => {
        if (line.mapping_status === 'skipped') return 'excluded'
        if (matchMap[line.id]?.match_status === 'conflict') return 'conflict'
        if (line.resolved_account_id && accountMap[line.resolved_account_id]) {
          const a = accountMap[line.resolved_account_id]
          return `${a.account_number} ${a.account_name}`
        }
        return looksLikeTotalRow(line) ? 'total header row' : 'will create new'
      },
      render: (line: ImportLine) => {
        const editing = overrideEditing[line.id]
        const mappedAcct = line.resolved_account_id ? accountMap[line.resolved_account_id] : null
        if (editing && mappedAcct) {
          return (
            <MatchedCoaEditor
              entityId={entityId}
              currentAcct={mappedAcct}
              pending={swapCoaMutation.isPending}
              onSelect={(acct) => swapCoaMutation.mutate({ lineId: line.id, accountId: acct.id })}
              onCancel={() => setOverrideEditing((p) => { const n = { ...p }; delete n[line.id]; return n })}
            />
          )
        }
        return (
          <div className="flex items-center gap-1.5 py-2">
            <div className="flex-1 min-w-0">{getMappingStatusLabel(line, accountMap, matchMap[line.id])}</div>
            {mappedAcct && (
              <button
                type="button"
                onClick={() => setOverrideEditing((p) => ({ ...p, [line.id]: true }))}
                className="shrink-0 text-gray-400 hover:text-indigo-600"
                title="Override matched COA"
                data-testid={`override-coa-btn-${line.id}`}
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            {overriddenLines[line.id] && (
              <button
                type="button"
                onClick={() => {
                  const sug = suggestMap[line.id]
                  if (sug?.suggested_account_id) {
                    swapCoaMutation.mutate({ lineId: line.id, accountId: sug.suggested_account_id })
                  }
                  setOverriddenLines((p) => { const n = { ...p }; delete n[line.id]; return n })
                }}
                className="shrink-0 text-[10px] text-gray-500 hover:text-gray-700 flex items-center gap-0.5"
                title="Reset to system suggestion"
                data-testid={`reset-coa-btn-${line.id}`}
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>
        )
      },
    },
    {
      // Agent 3.8: FSLI Suggestion moved to be adjacent to the FSLI dropdown.
      key: 'suggestion',
      header: 'FSLI Suggestion',
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
          <div className="flex flex-col gap-1 py-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                {suggestion.suggested_account_number}
              </span>
              <span className="text-xs text-gray-800 font-medium whitespace-nowrap" title={suggestion.suggested_account_name ?? ''}>
                {suggestion.suggested_account_name}
              </span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${confBadgeColor}`}>
                {confidence}
              </span>
            </div>
            <span className="text-[10px] text-gray-400 whitespace-nowrap" title={evidence}>
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
      },
    },
    {
      key: 'fsli',
      header: 'FSLI / Reporting Line',
      render: (line: ImportLine) => {
        const acct = line.resolved_account_id ? accountMap[line.resolved_account_id] : null
        // Agent 3.9: even for unmatched/new-COA-candidate rows, allow FSLI
        // selection. The FSLI lives on the entity COA account once created;
        // until then we stage it pending the create. Show the picker but
        // disable until the line is mapped/created.
        if (!acct) {
          return (
            <select
              disabled
              className="text-xs border rounded px-1.5 py-0.5 bg-gray-50 text-gray-400 italic min-w-[120px] max-w-[180px]"
              title="Resolve the COA match (or create the new account) before assigning an FSLI"
            >
              <option>Map or create COA first</option>
            </select>
          )
        }
        const eff = inheritanceMap[acct.id]
        const isInherited = eff && (eff.mapping_source === 'parent' || eff.mapping_source === 'grandparent')
        const currentValue = eff?.taxonomy_line_id ?? acct.reporting_taxonomy_line_id ?? ''

        // Implementation-detail badges (Sprint O vs Legacy) intentionally
        // hidden from the user — they don't need to know where the mapping
        // is stored internally.

        return (
          <div className="flex flex-col gap-0.5 py-2">
            <select
              value={currentValue}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null
                if (!resolvedViewId) return
                updateFsliMutation.mutate({ accountId: acct.id, taxonomyLineId: val })
                if (val !== null) {
                  fsliMappingsApi.propagateToChildren(entityId, resolvedViewId, acct.id, val, false)
                    .then((res) => {
                      queryClient.invalidateQueries({ queryKey: ['accounts-all', entityId] })
                      queryClient.invalidateQueries({ queryKey: ['fsli-inheritance', entityId, resolvedViewId] })
                      if (res.propagated_count > 0) {
                        toast(`Mapped. Propagated to ${res.propagated_count} child account${res.propagated_count === 1 ? '' : 's'}.`, 'info')
                      }
                    })
                    .catch(() => undefined)
                }
              }}
              className={`text-xs border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 min-w-[120px] max-w-[180px] ${
                isInherited
                  ? 'border-gray-200 text-gray-400 bg-gray-50 italic'
                  : 'border-gray-200 text-indigo-700 bg-indigo-50'
              }`}
            >
              <option value="">— Select FSLI —</option>
              {fsliOptionsGrouped.map((group) => (
                <optgroup key={group.section} label={group.section}>
                  {group.options.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="flex items-center gap-1 flex-wrap">
              {isInherited && (
                <span className="text-[10px] text-gray-400 italic">inherited</span>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: 'inherited_from',
      header: 'Inherited From',
      render: (line: ImportLine) => {
        const acct = line.resolved_account_id ? accountMap[line.resolved_account_id] : null
        if (!acct) return <span className="text-xs text-gray-300">—</span>
        const eff = inheritanceMap[acct.id]
        if (!eff) return <span className="text-xs text-gray-300">—</span>
        if (eff.mapping_source === 'explicit') {
          return (
            <span className="inline-flex items-center text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
              Explicit
            </span>
          )
        }
        if (eff.mapping_source === 'parent' || eff.mapping_source === 'grandparent') {
          return (
            <span className="text-xs text-blue-600" title={`Inherited from ${eff.inherited_from_account_number}`}>
              ↑ {eff.inherited_from_account_number}
            </span>
          )
        }
        if (eff.mapping_source === 'legacy') {
          // Hidden implementation detail — surface as "Existing" without revealing the storage.
          return (
            <span className="text-[10px] text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
              Existing
            </span>
          )
        }
        return <span className="text-xs text-gray-400 italic">— Unmapped</span>
      },
    },
    {
      key: 'map_to_account',
      header: 'COA Match / Override',
      render: (line: ImportLine) => {
        const selectedAcct = selectedAccounts[line.id]
        const isMapped = line.mapping_status === 'mapped'
        const isSkipped = line.mapping_status === 'skipped'
        const isCreating = createLineId === line.id
        const inputRef = getOrCreateRef(line.id)
        const isEditing = editingLines[line.id]

        if (isMapped && !isEditing) {
          const mappedAcct = line.resolved_account_id ? accountMap[line.resolved_account_id] : null
          const displayName = mappedAcct
            ? `${mappedAcct.account_number} — ${mappedAcct.account_name}`
            : 'Mapped'

          return (
            <div className="flex items-center gap-2 py-2">
              <span className="text-xs font-medium text-green-700 flex items-center gap-1 bg-green-50 border border-green-200 px-2 py-0.5 rounded whitespace-nowrap animate-in fade-in" title={displayName}>
                <Check className="w-3.5 h-3.5 shrink-0" /> {displayName}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (mappedAcct) {
                    setSelectedAccounts((p) => ({ ...p, [line.id]: mappedAcct }))
                  }
                  setEditingLines((p) => ({ ...p, [line.id]: true }))
                }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold shrink-0"
              >
                Change
              </button>
            </div>
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
              taxonomyLines={legacyTaxonomyLines}
              onSubmit={(data) => createMutation.mutate({ lineId: line.id, data })}
              onCancel={() => setCreateLineId(null)}
            />
          )
        }

        return (
          <div className="flex items-center gap-2 py-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex-1 min-w-[160px]">
              <AccountSearch
                entityId={entityId}
                value={selectedAcct?.id ?? null}
                onChange={(acct) => setSelectedAccounts((p) => ({ ...p, [line.id]: acct }))}
                inputRef={inputRef as React.RefObject<HTMLInputElement>}
                onTab={() => focusNextUnmapped(line.id)}
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {selectedAcct && (
                <button
                  type="button"
                  disabled={mapMutation.isPending}
                  onClick={() => mapMutation.mutate({ lineId: line.id, accountId: selectedAcct.id })}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50 font-medium transition-colors"
                  data-testid={`map-btn-${line.id}`}
                >
                  <Check className="w-3.5 h-3.5" /> Map
                </button>
              )}
              {isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAccounts((p) => { const n = { ...p }; delete n[line.id]; return n })
                    setEditingLines((p) => { const n = { ...p }; delete n[line.id]; return n })
                  }}
                  className="px-2.5 py-1.5 border border-gray-300 text-gray-600 text-xs rounded hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
              )}
            </div>
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
      key: 'mark_total_row',
      label: 'Exclude — Total / Header Row',
      icon: SkipForward,
      hidden: (row) => row.mapping_status !== 'unmapped',
      onClick: (row) => skipMutation.mutate(row.id),
    },
    {
      key: 'skip_line',
      label: 'Skip Line',
      icon: SkipForward,
      hidden: (row) => row.mapping_status !== 'unmapped',
      onClick: (row) => skipMutation.mutate(row.id),
    },
    {
      key: 'propagate_fsli',
      label: 'Propagate FSLI to Children',
      icon: GitBranch,
      hidden: (row) => {
        if (!row.resolved_account_id || !resolvedViewId) return true
        const acct = accountMap[row.resolved_account_id]
        if (!acct) return true
        const eff = inheritanceMap[acct.id]
        if (!eff || !eff.taxonomy_line_id) return true
        // Only show if account has children
        const num = acct.account_number
        const hasChildren = Object.values(accountMap).some(
          (a) => a.id !== acct.id && (
            a.parent_account_id === acct.id ||
            a.account_number.startsWith(num + '-') ||
            a.account_number.startsWith(num + '.') ||
            a.account_number.startsWith(num + ':')
          )
        )
        return !hasChildren
      },
      onClick: (row) => {
        if (!row.resolved_account_id || !resolvedViewId) return
        const acct = accountMap[row.resolved_account_id]
        if (!acct) return
        const eff = inheritanceMap[acct.id]
        if (!eff?.taxonomy_line_id) return
        fsliMappingsApi.propagateToChildren(entityId, resolvedViewId, acct.id, eff.taxonomy_line_id, true)
          .then((res) => {
            queryClient.invalidateQueries({ queryKey: ['accounts-all', entityId] })
            queryClient.invalidateQueries({ queryKey: ['fsli-inheritance', entityId, resolvedViewId] })
            toast(`Propagated to ${res.propagated_count} child account${res.propagated_count === 1 ? '' : 's'}.`, 'success')
          })
          .catch((err: Error) => setApiError(err.message))
      },
    },
    {
      key: 'delete_row',
      label: 'Delete row',
      icon: Trash2,
      variant: 'danger',
      onClick: (row) => setDeleteConfirmLineId(row.id),
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
    {
      key: 'batch_map',
      label: 'Batch Map',
      icon: Check,
      disabled: (rows) => !rows.some((r) => r.mapping_status === 'unmapped'),
      onClick: (rows) => {
        const unmappedSelected = rows.filter((r) => r.mapping_status === 'unmapped')
        if (unmappedSelected.length > 0) {
          setBatchMapLines(unmappedSelected)
          setIsBatchMapOpen(true)
        }
      }
    },
    {
      key: 'batch_delete',
      label: 'Delete selected',
      icon: Trash2,
      variant: 'danger',
      onClick: async (rows) => {
        if (rows.length === 0) return
        const ok = typeof window !== 'undefined' ? window.confirm(`Delete ${rows.length} line${rows.length === 1 ? '' : 's'}? This cannot be undone.`) : true
        if (!ok) return
        bulkDeleteMutation.mutate(rows.map((r) => r.id))
      },
    },
  ]

  // Issue 6 — FilterBar definitions
  const filterBarDefs: FilterBarFilterDef[] = [
    {
      key: 'filter-status-chips',
      label: 'Status',
      type: 'checklist',
      value: extFilters.statusChips,
      onChange: (v: string[]) => setExtFilters((p) => ({ ...p, statusChips: v })),
      options: ['mapped', 'unmapped', 'conflict', 'inherited'],
    },
    {
      key: 'filter-parent-contains',
      label: 'Parent contains',
      type: 'text',
      value: extFilters.parentContains,
      onChange: (v: string) => setExtFilters((p) => ({ ...p, parentContains: v })),
    },
    {
      key: 'filter-inherited-from',
      label: 'Inherited from',
      type: 'text',
      value: extFilters.inheritedFromContains,
      onChange: (v: string) => setExtFilters((p) => ({ ...p, inheritedFromContains: v })),
    },
    {
      key: 'filter-confidence',
      label: 'Confidence %',
      type: 'numeric-range',
      value: { min: String(extFilters.confidenceMin), max: String(extFilters.confidenceMax) },
      onChange: (v: { min?: string; max?: string }) =>
        setExtFilters((p) => ({
          ...p,
          confidenceMin: Number(v.min ?? 0) || 0,
          confidenceMax: Number(v.max ?? 100) || 100,
        })),
    },
  ]

  const activeExtFilterCount = (
    (extFilters.statusChips.length > 0 ? 1 : 0) +
    (extFilters.accountType !== 'all' ? 1 : 0) +
    (extFilters.coaMatchState !== 'all' ? 1 : 0) +
    (extFilters.taxonomyAssignment !== 'all' ? 1 : 0) +
    (extFilters.confidenceMin !== 0 || extFilters.confidenceMax !== 100 ? 1 : 0) +
    (extFilters.parentContains ? 1 : 0) +
    (extFilters.inheritedFromContains ? 1 : 0)
  )

  function clearExtFilters() {
    setExtFilters({
      statusChips: [],
      accountType: 'all',
      coaMatchState: 'all',
      taxonomyAssignment: 'all',
      confidenceMin: 0,
      confidenceMax: 100,
      parentContains: '',
      inheritedFromContains: '',
    })
  }

  return (
    <PageLayout
      title="Advanced Mapping (per batch)"
      subtitle={batch ? `${batch.filename} · ${unmappedCount} of ${batch.row_count ?? 0} lines unmapped — power-user editor; most mapping is done in the wizard or Mapping Center` : 'Loading…'}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAutoMapTaxonomyIds(availableTaxonomies.filter((t) => t.is_system).map((t) => t.id))
              setAutoMapRunning(false)
              setIsAutoMapOpen(true)
            }}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 font-medium"
            data-testid="auto-map-taxonomies-btn"
          >
            <Lightbulb className="w-3.5 h-3.5" /> Auto-Map Taxonomies
          </button>
          <button
            type="button"
            onClick={handleExportMappingIssues}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 font-medium"
            data-testid="export-mapping-issues-btn"
          >
            <Download className="w-3.5 h-3.5" /> Export Mapping Issues
          </button>
          <button
            type="button"
            onClick={handleExportMappings}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 font-medium"
          >
            <Download className="w-3.5 h-3.5" /> Export Mappings
          </button>
          <button
            type="button"
            onClick={() => setDeleteBatchConfirmOpen(true)}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-rose-300 text-rose-600 rounded hover:bg-rose-50 font-medium"
            data-testid="delete-batch-btn"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete entire batch
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
      <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3 text-[11px] text-amber-900 flex items-start gap-2" data-testid="advanced-mapping-banner">
        <span className="font-semibold">Advanced editor.</span>
        <span>
          This is the per-batch power-user editor. Normal mapping happens in the wizard's step 4
          or in <a href="/mapping" className="underline font-semibold">Mapping Center</a>.
        </span>
      </div>

      {apiError && <ErrorBanner message={apiError} />}

      {/* Issue 7 — FSLI source banner + selector */}
      {usingFallback && fallbackTaxonomy && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-3 text-xs text-amber-800 flex items-center gap-3 flex-wrap" data-testid="fsli-fallback-banner">
          <span>
            Using <strong>{fallbackTaxonomy.name}</strong> as FSLI source. Pick a different taxonomy above.
          </span>
        </div>
      )}
      {(usingFallback || availableTaxonomies.length > 0) && (
        <div className="flex items-center gap-3 mb-3">
          <label className="text-xs font-medium text-gray-600 whitespace-nowrap">FSLI Source Taxonomy:</label>
          <select
            value={resolvedSourceTaxonomyId ?? ''}
            onChange={(e) => setFsliSourceTaxonomyId(e.target.value ? Number(e.target.value) : null)}
            className="text-xs border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            data-testid="fsli-source-selector"
          >
            <option value="">— Use legacy reporting taxonomy —</option>
            {availableTaxonomies.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.is_system ? '(system)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Reporting view selector */}
      <div className="flex items-center gap-3 mb-3">
        <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Reporting View:</label>
        <select
          value={resolvedViewId ?? ''}
          onChange={(e) => setActiveViewId(e.target.value ? Number(e.target.value) : null)}
          className="text-xs border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          data-testid="reporting-view-selector"
        >
          {reportingViews.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>

      {/* FSLI view-scoped info banner */}
      {defaultView && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-3 text-xs text-amber-800" data-testid="fsli-view-info-banner">
          FSLI mappings in this workbench are saved to: <strong>{reportingViews.find((v) => v.id === resolvedViewId)?.name ?? '…'}</strong>.
          Switch the view to map the same accounts differently for GAAP vs Tax vs Management.
        </div>
      )}

      {/* Mapping explanation — Agent 3.10 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-xs text-blue-800" data-testid="mapping-workflow-explainer">
        <p className="font-semibold mb-1">How mapping works</p>
        <p className="mb-1.5">
          Imported source accounts are first matched to your entity Chart of Accounts.
          Then each COA account is mapped to a financial statement line item using the
          selected taxonomy. <strong>New COA accounts can still be mapped to an FSLI before posting.</strong>
        </p>
        <div className="flex items-center gap-2 font-mono text-blue-700">
          <span className="bg-blue-100 px-2 py-0.5 rounded">Source Account</span>
          <span>→</span>
          <span className="bg-blue-100 px-2 py-0.5 rounded">COA Match</span>
          <span>→</span>
          <span className="bg-blue-100 px-2 py-0.5 rounded">FSLI Mapping</span>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading lines…</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="Account # or name…"
              value={colFilters.sourceAccount}
              onChange={(e) => setColFilters((p) => ({ ...p, sourceAccount: e.target.value }))}
              className="text-xs border border-gray-200 rounded px-2.5 py-1.5 w-48 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
            <select
              value={colFilters.status}
              onChange={(e) => {
                const v = e.target.value
                setColFilters((p) => ({ ...p, status: v }))
                if (v === 'conflict') setShowMapped(true)
              }}
              className="text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              data-testid="status-filter-select"
            >
              <option value="all">All statuses</option>
              <option value="unmapped">Unmapped</option>
              <option value="mapped">Mapped</option>
              <option value="skipped">Skipped</option>
              {conflictCount > 0 && <option value="conflict">Conflicts ({conflictCount})</option>}
            </select>
            <input
              type="text"
              placeholder="Filter FSLI…"
              value={colFilters.fsliText}
              onChange={(e) => setColFilters((p) => ({ ...p, fsliText: e.target.value }))}
              className="text-xs border border-gray-200 rounded px-2.5 py-1.5 w-36 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
            <button
              type="button"
              onClick={() => setFilterPanelOpen((v) => !v)}
              className={`text-xs border rounded px-2.5 py-1.5 flex items-center gap-1 ${filterPanelOpen ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              data-testid="toggle-advanced-filters"
            >
              <Filter className="w-3 h-3" />
              Advanced filters
              {activeExtFilterCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold">
                  {activeExtFilterCount}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 transition-transform ${filterPanelOpen ? 'rotate-180' : ''}`} />
            </button>
            {(colFilters.sourceAccount || colFilters.fsliText || colFilters.status !== 'all') && (
              <button
                type="button"
                onClick={() => setColFilters({ sourceAccount: '', fsliText: '', status: 'all' })}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear filters
              </button>
            )}
          </div>

          {filterPanelOpen && (
            <div className="mb-3 space-y-2" data-testid="advanced-filter-panel">
              <FilterBar
                data-testid="mapping-filter-bar"
                filters={filterBarDefs}
                activeCount={activeExtFilterCount}
                onClearAll={clearExtFilters}
              />
              <div className="flex flex-wrap gap-3 px-2 text-xs">
                <label className="flex items-center gap-1.5">
                  <span className="text-gray-500">Account type:</span>
                  <select
                    value={extFilters.accountType}
                    onChange={(e) => setExtFilters((p) => ({ ...p, accountType: e.target.value }))}
                    className="border border-gray-200 rounded px-2 py-1"
                    data-testid="filter-account-type"
                  >
                    <option value="all">All</option>
                    {accountTypeOptions.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-gray-500">COA match:</span>
                  <select
                    value={extFilters.coaMatchState}
                    onChange={(e) => setExtFilters((p) => ({ ...p, coaMatchState: e.target.value }))}
                    className="border border-gray-200 rounded px-2 py-1"
                    data-testid="filter-coa-match"
                  >
                    <option value="all">All</option>
                    <option value="matched">Matched</option>
                    <option value="unmatched">Unmatched</option>
                    <option value="will-create">Will create</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-gray-500">Taxonomy:</span>
                  <select
                    value={extFilters.taxonomyAssignment}
                    onChange={(e) => setExtFilters((p) => ({ ...p, taxonomyAssignment: e.target.value }))}
                    className="border border-gray-200 rounded px-2 py-1"
                    data-testid="filter-taxonomy"
                  >
                    <option value="all">All</option>
                    <option value="has-fsli">Has FSLI</option>
                    <option value="no-fsli">No FSLI</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {viewMode === 'grouped' && groupedData && (
            <div className="mb-2 text-xs text-gray-500" data-testid="grouped-summary">
              {parentChildSummary.parents} parent accounts · {parentChildSummary.children} child accounts
            </div>
          )}

          {/* Grouped header rows rendered above grid */}
          {viewMode === 'grouped' && groupedData && (
            <div className="mb-2 space-y-1" data-testid="grouped-headers">
              {groupedData.map((g) => {
                const expanded = expandedGroups[g.key] ?? true
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setExpandedGroups((p) => ({ ...p, [g.key]: !(p[g.key] ?? true) }))}
                    className="w-full flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-xs"
                    data-testid={`group-header-${g.key}`}
                  >
                    {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    {g.parent ? (
                      <>
                        <span className="font-mono font-semibold text-gray-700">{g.parent.account_number}</span>
                        <span className="text-gray-600">{g.parent.account_name}</span>
                      </>
                    ) : (
                      <span className="italic text-gray-500">Ungrouped</span>
                    )}
                    <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px]">
                      {g.lines.length}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="min-w-[1400px]">
              <AccountingDataGrid
                columns={gridColumns}
                data={visibleGridData}
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
            </div>
          </div>
        </>
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

      {/* Issue 5 — single-line delete confirm */}
      {deleteConfirmLineId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4" data-testid="delete-line-confirm">
            <h3 className="text-lg font-semibold text-gray-800">Delete line</h3>
            <p className="text-sm text-gray-600">
              Permanently remove line #{lines.find((l) => l.id === deleteConfirmLineId)?.line_number ?? deleteConfirmLineId} from this batch? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmLineId(null)}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteLineMutation.isPending}
                onClick={() => deleteLineMutation.mutate(deleteConfirmLineId)}
                className="px-3 py-1.5 bg-rose-600 text-white text-sm rounded hover:bg-rose-700 disabled:opacity-50"
                data-testid="confirm-delete-line-btn"
              >
                {deleteLineMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue 5 — delete entire batch confirm */}
      {deleteBatchConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4" data-testid="delete-batch-confirm">
            <h3 className="text-lg font-semibold text-gray-800">Delete entire batch</h3>
            <p className="text-sm text-gray-600">
              This will permanently delete the batch <strong>{batch?.filename ?? batchId}</strong> and all its lines.
              Posted batches must be rolled back first.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteBatchConfirmOpen(false)}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBatchMutation.isPending}
                onClick={() => deleteBatchMutation.mutate()}
                className="px-3 py-1.5 bg-rose-600 text-white text-sm rounded hover:bg-rose-700 disabled:opacity-50"
                data-testid="confirm-delete-batch-btn"
              >
                {deleteBatchMutation.isPending ? 'Deleting…' : 'Delete batch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isBatchMapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Batch Map Accounts</h3>
            <p className="text-xs text-gray-500">
              Map the {batchMapLines.length} selected lines to a single COA account.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Select Account</label>
              <AccountSearch
                entityId={batch?.entity_id ?? 0}
                value={batchMapAccount?.id ?? null}
                onChange={setBatchMapAccount}
                placeholder="Search accounts…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsBatchMapOpen(false)
                  setBatchMapLines([])
                  setBatchMapAccount(null)
                }}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!batchMapAccount}
                onClick={async () => {
                  if (!batchMapAccount) return
                  const mappings = batchMapLines.map((l) => ({
                    line_id: l.id,
                    account_id: batchMapAccount.id,
                  }))
                  try {
                    await tbImportApi.bulkMap(batchId, mappings)
                    queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
                    queryClient.invalidateQueries({ queryKey: ['import-batch', batchId] })
                    setIsBatchMapOpen(false)
                    setBatchMapLines([])
                    setBatchMapAccount(null)
                    toast(`Mapped ${mappings.length} lines to ${batchMapAccount.account_number}`, 'success')
                  } catch (err: any) {
                    setApiError(err.message)
                  }
                }}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
                data-testid="confirm-batch-map-btn"
              >
                Apply Mapping
              </button>
            </div>
          </div>
        </div>
      )}
      {isAutoMapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto space-y-4" data-testid="auto-map-modal">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">Auto-Map Taxonomies</h3>
              <button
                type="button"
                onClick={() => { setIsAutoMapOpen(false); setAutoMapRunning(false) }}
                className="text-gray-400 hover:text-gray-600"
                data-testid="auto-map-close-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {!autoMapRunning ? (
              <>
                <p className="text-xs text-gray-500">
                  Select the taxonomies to suggest mappings for. The rule engine will analyze each
                  account in this batch and propose the best taxonomy node match.
                </p>
                <div className="border border-gray-200 rounded p-3 max-h-64 overflow-y-auto">
                  {availableTaxonomies.length === 0 ? (
                    <p className="text-xs text-gray-400">No taxonomies available.</p>
                  ) : (
                    availableTaxonomies.map((tx) => (
                      <label key={tx.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoMapTaxonomyIds.includes(tx.id)}
                          onChange={(e) => {
                            setAutoMapTaxonomyIds((prev) =>
                              e.target.checked ? [...prev, tx.id] : prev.filter((id) => id !== tx.id),
                            )
                          }}
                          data-testid={`auto-map-taxonomy-${tx.id}`}
                        />
                        <span className="font-medium text-gray-700">{tx.name}</span>
                        {tx.is_system && (
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">system</span>
                        )}
                        {tx.industry && (
                          <span className="text-[10px] text-gray-400">{tx.industry}</span>
                        )}
                      </label>
                    ))
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAutoMapOpen(false)}
                    className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={autoMapTaxonomyIds.length === 0}
                    onClick={() => setAutoMapRunning(true)}
                    className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
                    data-testid="run-suggestions-btn"
                  >
                    Run Suggestions
                  </button>
                </div>
              </>
            ) : (
              <TaxonomySuggestionPanel
                accountIds={Array.from(new Set(lines.map((l) => l.resolved_account_id).filter((x): x is number => x != null)))}
                taxonomyIds={autoMapTaxonomyIds}
                onApplied={() => {
                  queryClient.invalidateQueries({ queryKey: ['import-lines', batchId] })
                  queryClient.invalidateQueries({ queryKey: ['accounts-all', entityId] })
                }}
              />
            )}
          </div>
        </div>
      )}
    </PageLayout>
  )
}
