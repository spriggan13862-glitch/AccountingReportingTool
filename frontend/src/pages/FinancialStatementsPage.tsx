import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, Download, ShieldAlert, X, Search } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { reportingApi } from '@/api/reporting'
import { financialStatementsApi } from '@/api/financialStatements'
import { accountsApi } from '@/api/accounts'
import { journalEntriesApi } from '@/api/journalEntries'
import { reportingTaxonomyApi } from '@/api/reportingTaxonomy'
import { overlayApi } from '@/api/overlay'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { ScenarioSelect } from '@/components/ui/ScenarioSelect'
import { DrilldownPanel } from '@/components/reports/DrilldownPanel'
import { useOrg } from '@/providers/OrgProvider'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { cn } from '@/utils/cn'
import type { TaxonomyFsLine, CashFlowSection, CashFlowLine, OverlayCalculateRequest, OverlayLineItem, ReportingTaxonomyLine } from '@/types'

type Tab = 'official_tb' | 'draft_tb' | 'BS' | 'IS' | 'CF'

const fmt = (v: string | number) => {
  const val = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(val)) return '—'
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const adjColor = (val: string | number) => {
  const n = typeof val === 'string' ? parseFloat(val) : val
  if (n > 0.005) return 'text-emerald-700 font-semibold'
  if (n < -0.005) return 'text-rose-700 font-semibold'
  return 'text-slate-400 font-normal'
}

const isDev = import.meta.env.DEV

function getFsLine(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('asset') || t.includes('liability') || t.includes('equity')) {
    return 'Balance Sheet'
  }
  return 'Income Statement'
}

// ---------------------------------------------------------------------------
// TaxonomyTable
// ---------------------------------------------------------------------------

export function TaxonomyTable({
  rows,
  isLoading,
  entityId,
  onDrilldown,
}: {
  rows: (TaxonomyFsLine & {
    importedBalance?: number
    postedAdjustments?: number
    draftAdjustments?: number
    adjustedBalance?: number
  })[]
  isLoading: boolean
  entityId: number | ''
  onDrilldown?: (code: string) => void
}) {
  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <RefreshCw className="w-5 h-5 text-gray-300 animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-400">Loading statement…</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center">
        <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700 mb-1">No taxonomy lines configured</p>
        <div className="text-xs text-gray-500 max-w-sm mx-auto space-y-1">
          <p>Taxonomy lines are not yet seeded for this installation. This usually resolves automatically when you:</p>
          <ol className="list-decimal list-inside mt-2 space-y-1 text-left">
            <li>Import a Chart of Accounts (COA Import page)</li>
            <li>Or visit the <strong>Reporting Taxonomy</strong> page to initialize lines</li>
            <li>Then click <strong>Inherit Taxonomy</strong> on this page</li>
          </ol>
        </div>
      </div>
    )
  }

  const allZero = rows.every((r) => parseFloat(r.display_balance) === 0)
  const mappedCount = rows.reduce((s, r) => s + (r.is_subtotal ? 0 : r.account_count), 0)

  const isMultiColumn = rows.length > 0 && ('importedBalance' in rows[0])

  if (isMultiColumn) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-slate-755 min-w-[800px]" data-testid="taxonomy-table">
          <thead>
            <tr className="border-b bg-slate-50 text-slate-550 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-2.5 pl-4 text-left">Line Item</th>
              <th className="py-2.5 pr-4 text-right w-36">Imported Balance</th>
              <th className="py-2.5 pr-4 text-right w-36">Posted Adj.</th>
              <th className="py-2.5 pr-4 text-right w-36">Draft Adj.</th>
              <th className="py-2.5 pr-4 text-right w-36">Adjusted Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const indent = row.hierarchy_depth * 16
              const isHeader = row.hierarchy_depth === 0
              const isSubtotal = row.is_subtotal
              const isClickable = !!onDrilldown && !!row.code
              const showValue = !(isHeader && !isSubtotal)

              const impVal = row.importedBalance ?? 0
              const postVal = row.postedAdjustments ?? 0
              const draftVal = row.draftAdjustments ?? 0
              const adjVal = row.adjustedBalance ?? 0

              const rowClasses = [
                isHeader ? 'bg-slate-50/60 border-t border-b font-bold text-slate-850' : '',
                isSubtotal ? 'border-t font-bold bg-slate-50/30 text-slate-900' : '',
                isClickable ? 'cursor-pointer hover:bg-slate-50 text-indigo-650' : '',
              ].filter(Boolean).join(' ')

              return (
                <tr
                  key={row.taxonomy_id}
                  onClick={isClickable ? () => onDrilldown!(row.code) : undefined}
                  className={cn('border-b border-slate-100/80 transition-colors', rowClasses)}
                >
                  <td className="py-2 pl-4" style={{ paddingLeft: `${indent + 16}px` }}>
                    {row.name}
                    {row.account_count > 0 && (
                      <span className="ml-1.5 text-[10px] font-semibold text-slate-400">({row.account_count})</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-600">
                    {showValue ? fmt(impVal) : ''}
                  </td>
                  <td className={cn('py-2 pr-4 text-right tabular-nums', adjColor(postVal))}>
                    {showValue && Math.abs(postVal) > 0.005 ? (postVal > 0 ? '+' : '') + fmt(postVal) : (showValue ? '—' : '')}
                  </td>
                  <td className={cn('py-2 pr-4 text-right tabular-nums', adjColor(draftVal))}>
                    {showValue && Math.abs(draftVal) > 0.005 ? (draftVal > 0 ? '+' : '') + fmt(draftVal) : (showValue ? '—' : '')}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-900 font-bold">
                    {showValue ? fmt(adjVal) : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // Legacy fallback
  const unmapped = rows.filter((r) => r.account_count === 0 && !r.is_subtotal)

  return (
    <div>
      {allZero && mappedCount === 0 && (
        <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">No accounts mapped to taxonomy lines.</p>
            <p className="mt-0.5">Import a Chart of Accounts or assign reporting lines on the Chart of Accounts page, then click <strong>Inherit Taxonomy</strong>.</p>
          </div>
        </div>
      )}
      {allZero && mappedCount > 0 && (
        <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Accounts are mapped ({mappedCount}) but all balances are $0.</p>
            <p className="mt-0.5">No posted trial balance data found for this entity and date. Import a trial balance or post journal entries to a scenario first.</p>
          </div>
        </div>
      )}
      {!allZero && unmapped.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {unmapped.length} taxonomy line{unmapped.length !== 1 ? 's' : ''} have no mapped accounts — run <strong>Inherit Taxonomy</strong> to propagate from parent accounts.
        </div>
      )}

      <table className="w-full text-sm" data-testid="taxonomy-table">
        <tbody>
          {rows.map((row) => {
            const indent = row.hierarchy_depth * 16
            const isHeader = row.hierarchy_depth === 0
            const isSubtotal = row.is_subtotal
            const balance = parseFloat(row.display_balance)
            const isEmpty = balance === 0 && row.account_count === 0
            const isClickable = !!onDrilldown && !!row.code

            const rowClasses = [
              isHeader ? 'bg-gray-50 border-t border-b font-semibold' : '',
              isSubtotal ? 'border-t font-medium' : '',
              isEmpty && !isClickable ? 'text-gray-400' : '',
              isClickable ? 'cursor-pointer hover:bg-blue-50/50 text-indigo-650 font-semibold' : '',
            ].filter(Boolean).join(' ')

            return (
              <tr
                key={row.taxonomy_id}
                onClick={isClickable ? () => onDrilldown!(row.code) : undefined}
                className={rowClasses || undefined}
              >
                <td className="py-1.5" style={{ paddingLeft: `${indent + 12}px` }}>
                  {row.name}
                  {row.account_count > 0 && (
                    <span className="ml-1.5 text-xs text-gray-405">({row.account_count})</span>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums pr-4 w-36">
                  {(isHeader && !isSubtotal) ? '' : fmt(row.display_balance)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {unmapped.length > 0 && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          <strong>{unmapped.length} taxonomy line(s)</strong> have no mapped accounts and show $0.
          Use <strong>Inherit Taxonomy</strong> or assign accounts in the Chart of Accounts page.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CashFlowStatement
// ---------------------------------------------------------------------------

function CashFlowStatement({ entityId, asOfDate, scenarioIds }: { entityId: number; asOfDate: string; scenarioIds: number[] }) {
  const { data: fsData, isLoading, error } = useQuery({
    queryKey: ['fs-cf', entityId, asOfDate, scenarioIds],
    queryFn: () =>
      financialStatementsApi
        .getCashFlow(entityId, asOfDate, asOfDate, scenarioIds)
        .then((r) => r.data),
    enabled: !!entityId && !!asOfDate,
  })

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <RefreshCw className="w-5 h-5 text-gray-300 animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-400">Loading cash flow…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="py-10 text-center">
        <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-500">Failed to load cash flow statement.</p>
        <p className="text-xs text-gray-400 mt-1">Ensure journal entries are posted and periods are configured.</p>
      </div>
    )
  }
  if (!fsData) return null

  function renderSection(section: CashFlowSection) {
    return (
      <div key={section.label} className="mb-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-1 border-b pb-1">{section.label}</h4>
        <table className="w-full text-sm">
          <tbody>
            {section.lines.map((line: CashFlowLine, i: number) => (
              <tr key={i} className={line.is_subtotal ? 'font-medium border-t' : ''}>
                <td className={`py-1 ${!line.is_subtotal ? 'pl-4' : ''}`}>{line.label}</td>
                <td className="py-1 text-right tabular-nums">{fmt(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="p-4">
      {[fsData.operating, fsData.investing, fsData.financing].map(renderSection)}
      <div className="border-t pt-2 font-semibold flex justify-between px-0">
        <span>Net Change in Cash</span>
        <span className="tabular-nums">{fmt(fsData.net_change)}</span>
      </div>
      {fsData.warnings.map((w: string, i: number) => (
        <p key={i} className="text-xs text-amber-600 mt-1">{w}</p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InheritFeedback
// ---------------------------------------------------------------------------

interface InheritResult { updated: number; already_set: number; no_ancestor: number }

function InheritFeedback({ data }: { data: InheritResult }) {
  const { updated, already_set, no_ancestor } = data

  if (updated > 0) {
    return (
      <div className="text-xs text-emerald-600 self-end pb-2 font-medium" data-testid="inherit-result">
        ✓ Inherited: {updated} account{updated !== 1 ? 's' : ''} classified
        {already_set > 0 && <span className="text-gray-400 font-normal ml-1">({already_set} already set)</span>}
      </div>
    )
  }

  if (no_ancestor > 0 && updated === 0) {
    return (
      <div className="text-xs text-amber-600 self-end pb-2" data-testid="inherit-result">
        <span className="font-medium">No eligible parent mappings found.</span>
        {' '}{no_ancestor} account{no_ancestor !== 1 ? 's' : ''} have no ancestor with a reporting line.
        Assign reporting lines to parent accounts first, then re-run Inherit.
      </div>
    )
  }

  if (already_set > 0 && updated === 0 && no_ancestor === 0) {
    return (
      <div className="text-xs text-gray-500 self-end pb-2" data-testid="inherit-result">
        ✓ All {already_set} account{already_set !== 1 ? 's' : ''} already have reporting lines — nothing to inherit.
      </div>
    )
  }

  return (
    <div className="text-xs text-gray-400 self-end pb-2" data-testid="inherit-result">
      Inherited: 0 accounts updated
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatementDebugPanel (dev only)
// ---------------------------------------------------------------------------

function StatementDebugPanel({
  entityId, asOfDate, scenarioId, bsRows, isRows,
}: {
  entityId: number | ''; asOfDate: string; scenarioId: number | '';
  bsRows: TaxonomyFsLine[]; isRows: TaxonomyFsLine[];
}) {
  const [open, setOpen] = useState(false)

  const bsUnmapped = bsRows.filter((r) => r.account_count === 0 && !r.is_subtotal).length
  const isUnmapped = isRows.filter((r) => r.account_count === 0 && !r.is_subtotal).length
  const bsTotal = bsRows.reduce((s, r) => s + (r.is_subtotal ? 0 : r.account_count), 0)
  const isTotal = isRows.reduce((s, r) => s + (r.is_subtotal ? 0 : r.account_count), 0)

  return (
    <div className="mt-6 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500" data-testid="debug-panel">
      <button
        className="w-full flex items-center gap-1 px-3 py-2 hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="font-mono font-semibold text-gray-400 uppercase tracking-wide">Statement Debug</span>
        <span className="ml-auto text-gray-300">dev only</span>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1 font-mono border-t border-dashed border-gray-200">
          <p>entity_id: <strong>{entityId || '—'}</strong></p>
          <p>as_of_date: <strong>{asOfDate || '—'}</strong></p>
          <p>scenario_id: <strong>{scenarioId || 'all'}</strong></p>
          <p className="mt-1">BS rows loaded: <strong>{bsRows.length}</strong> | mapped accounts: <strong>{bsTotal}</strong> | unmapped lines: <strong className={bsUnmapped > 0 ? 'text-amber-500' : ''}>{bsUnmapped}</strong></p>
          <p>IS rows loaded: <strong>{isRows.length}</strong> | mapped accounts: <strong>{isTotal}</strong> | unmapped lines: <strong className={isUnmapped > 0 ? 'text-amber-500' : ''}>{isUnmapped}</strong></p>
          <p className="text-gray-300 mt-1">Tip: Run "Inherit Taxonomy" if accounts exist but all balances are $0.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FinancialStatementsPage
// ---------------------------------------------------------------------------

export function FinancialStatementsPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const queryClient = useQueryClient()
  const { activeEntity } = useWorkspace()

  const [entityId, setEntityId] = useState<number | ''>(activeEntity?.id ?? '')

  // Mutation for Initialize Reporting Taxonomy setup flow
  const initializeTaxonomyMutation = useMutation({
    mutationFn: async () => {
      await reportingTaxonomyApi.reseed()
      return reportingApi.inheritTaxonomy(entityId as number)
    },
    onSuccess: () => {
      // Invalidate queries to refresh the financial statements workspace
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['overlay-calculate'] })
      queryClient.invalidateQueries({ queryKey: ['taxonomy-bs'] })
      queryClient.invalidateQueries({ queryKey: ['taxonomy-is'] })
    }
  })
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10))
  const [scenarioId, setScenarioId] = useState<number | ''>('')
  const [tab, setTab] = useState<Tab>('BS')
  const [drilldownCode, setDrilldownCode] = useState<string | null>(null)

  // Redesign controls & toggles
  const [officialOnly, setOfficialOnly] = useState(false)
  const [includeDrafts, setIncludeDrafts] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Drilldown side drawer state
  const [drilldownState, setDrilldownState] = useState<{
    account_id: number
    account_number: string
    account_name: string
    type: 'posted' | 'draft'
  } | null>(null)

  const scenarioIds = scenarioId !== '' ? [scenarioId] : []
  const ready = entityId !== '' && !!asOfDate

  const periodStart = useMemo(() => {
    if (!asOfDate) return ''
    return `${asOfDate.slice(0, 4)}-01-01`
  }, [asOfDate])

  // Queries for calculations & rollup
  const { data: accounts } = useQuery({
    queryKey: ['accounts', entityId],
    queryFn: () => accountsApi.list(entityId as number),
    enabled: ready,
  })

  const unmappedAccountCount = useMemo(() => {
    return accounts?.filter((acc) => !acc.reporting_taxonomy_line_id).length ?? 0
  }, [accounts])

  const { data: journalEntries } = useQuery({
    queryKey: ['journal-entries', entityId],
    queryFn: () => journalEntriesApi.list({ entity_id: entityId as number, page_size: 1000 }),
    enabled: ready,
  })

  const { data: taxonomyLines } = useQuery({
    queryKey: ['reporting-taxonomy-lines'],
    queryFn: () => reportingTaxonomyApi.list(false),
    enabled: ready,
  })

  // Load excluded drafts map
  const excludedMap = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('je_excluded_map') || '{}')
    } catch {
      return {}
    }
  }, [ready])

  // Fetch base Trial Balance with draft adjustments
  const { data: overlayResult } = useQuery({
    queryKey: ['overlay-calculate', entityId, asOfDate, scenarioId, includeDrafts, officialOnly],
    queryFn: () => {
      const req: OverlayCalculateRequest = {
        organization_id: orgId,
        entity_id: entityId as number,
        as_of_date: asOfDate,
        scenario_id: scenarioId !== '' ? scenarioId as number : 1,
        preview_type: 'trial_balance',
        included_je_ids: null,
        overlay_groups: null,
        include_re_rollforward: true,
        is_consolidated: false,
        create_audit_record: false,
      }
      return overlayApi.calculate(req)
    },
    enabled: ready,
  })

  // Fetch official statements from backend
  const { data: bsRows = [], isLoading: bsLoading } = useQuery({
    queryKey: ['taxonomy-bs', entityId, asOfDate, scenarioIds],
    queryFn: () => reportingApi.taxonomyBalanceSheet(entityId as number, asOfDate, scenarioIds),
    enabled: ready && (tab === 'BS' || tab === 'official_tb' || tab === 'draft_tb'),
  })

  const { data: isRows = [], isLoading: isLoading_ } = useQuery({
    queryKey: ['taxonomy-is', entityId, asOfDate, scenarioIds],
    queryFn: () => reportingApi.taxonomyIncomeStatement(entityId as number, asOfDate, scenarioIds),
    enabled: ready && (tab === 'IS' || tab === 'official_tb' || tab === 'draft_tb'),
  })

  const inheritMutation = useMutation({
    mutationFn: () => reportingApi.inheritTaxonomy(entityId as number),
  })

  const { data: fsValidation } = useQuery({
    queryKey: ['fs-validate', entityId, asOfDate, scenarioIds, periodStart],
    queryFn: () =>
      financialStatementsApi
        .validateStatements(entityId as number, asOfDate, scenarioIds, periodStart)
        .then((r) => r.data),
    enabled: ready && !!periodStart,
  })

  const { data: drilldown } = useQuery({
    queryKey: ['drilldown', entityId, asOfDate, drilldownCode, scenarioIds],
    queryFn: () =>
      financialStatementsApi
        .getDrilldown(entityId as number, asOfDate, scenarioIds, drilldownCode!)
        .then((r) => r.data),
    enabled: !!drilldownCode && ready,
  })

  const handleExport = () => {
    if (!ready) return
    const url = financialStatementsApi.getClosePackageUrl(entityId as number, asOfDate, scenarioIds)
    window.open(url, '_blank')
  }

  // Pre-calculations mappings
  const accountTaxonomyMap = useMemo(() => {
    const map = new Map<number, number | null>()
    if (accounts) {
      accounts.forEach((acc) => {
        map.set(acc.id, acc.reporting_taxonomy_line_id)
      })
    }
    return map
  }, [accounts])

  const taxonomyLineMap = useMemo(() => {
    const map = new Map<number, ReportingTaxonomyLine>()
    if (taxonomyLines) {
      taxonomyLines.forEach((line) => {
        map.set(line.id, line)
      })
    }
    return map
  }, [taxonomyLines])

  // Computed accounts (trial balance)
  const computedItems = useMemo(() => {
    if (!overlayResult) return []

    return overlayResult.line_items.map((item) => {
      // 1. Taxonomy Category
      const taxId = accountTaxonomyMap.get(item.account_id)
      const taxLine = taxId ? taxonomyLineMap.get(taxId) : null
      const taxonomyCategory = taxLine ? taxLine.name : 'Unmapped'

      // 2. FS Line
      const fsLine = getFsLine(item.account_type)

      // 3. Posted Adjustments
      let postedChange = 0
      if (journalEntries) {
        for (const je of journalEntries) {
          if (je.status === 'posted' && je.source !== 'import' && je.source !== 'tb_import') {
            for (const line of je.lines) {
              if (line.account_id === item.account_id) {
                const debit = parseFloat(line.debit || '0')
                const credit = parseFloat(line.credit || '0')
                postedChange += (debit - credit)
              }
            }
          }
        }
      }
      const isCredit = item.normal_balance?.toLowerCase() === 'credit'
      const postedAdjustments = isCredit ? -postedChange : postedChange

      // 4. Excluded Adjustments
      let excludedChange = 0
      if (journalEntries) {
        for (const je of journalEntries) {
          const isExcluded = excludedMap[je.id] === true
          if (je.status === 'draft' && isExcluded) {
            for (const line of je.lines) {
              if (line.account_id === item.account_id) {
                const debit = parseFloat(line.debit || '0')
                const credit = parseFloat(line.credit || '0')
                excludedChange += (debit - credit)
              }
            }
          }
        }
      }
      const excludedAdjustments = isCredit ? -excludedChange : excludedChange

      // 5. Imported Balance (base book balance before manual posted JEs)
      const importedBalance = parseFloat(item.official_signed_balance || '0') - postedAdjustments

      // 6. Draft Adjustments (respecting toggles)
      const rawDraft = parseFloat(item.draft_signed_adjustment || '0')
      const draftAdjustments = includeDrafts && !officialOnly ? rawDraft : 0

      // 7. Adjusted Balance
      const adjustedBalance = importedBalance + postedAdjustments + draftAdjustments

      // 8. Variance
      const variance = postedAdjustments + draftAdjustments

      return {
        ...item,
        taxonomyCategory,
        fsLine,
        importedBalance,
        postedAdjustments,
        draftAdjustments,
        excludedAdjustments,
        adjustedBalance,
        variance,
      }
    })
  }, [overlayResult, accounts, journalEntries, taxonomyLines, accountTaxonomyMap, taxonomyLineMap, excludedMap, includeDrafts, officialOnly])

  // Filtered trial balance rows
  const filteredItems = useMemo(() => {
    return computedItems.filter((item) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return item.account_number.toLowerCase().includes(q) || item.account_name.toLowerCase().includes(q)
    })
  }, [computedItems, searchQuery])

  // Roll up function for BS/IS tabs
  const computeTaxonomyColumns = (rows: TaxonomyFsLine[]) => {
    if (rows.length === 0) return []

    const colMap = new Map<number, {
      importedBalance: number
      postedAdjustments: number
      draftAdjustments: number
      adjustedBalance: number
    }>()

    rows.forEach((row) => {
      colMap.set(row.taxonomy_id, {
        importedBalance: 0,
        postedAdjustments: 0,
        draftAdjustments: 0,
        adjustedBalance: 0,
      })
    })

    computedItems.forEach((item) => {
      const taxId = accountTaxonomyMap.get(item.account_id)
      if (taxId && colMap.has(taxId)) {
        const cols = colMap.get(taxId)!
        cols.importedBalance += item.importedBalance
        cols.postedAdjustments += item.postedAdjustments
        cols.draftAdjustments += item.draftAdjustments
        cols.adjustedBalance += item.adjustedBalance
      }
    })

    const sortedRows = [...rows].sort((a, b) => b.hierarchy_depth - a.hierarchy_depth)
    sortedRows.forEach((row) => {
      if (row.parent_id && colMap.has(row.parent_id)) {
        const childCols = colMap.get(row.taxonomy_id)!
        const parentCols = colMap.get(row.parent_id)!
        parentCols.importedBalance += childCols.importedBalance
        parentCols.postedAdjustments += childCols.postedAdjustments
        parentCols.draftAdjustments += childCols.draftAdjustments
        parentCols.adjustedBalance += childCols.adjustedBalance
      }
    })

    return rows.map((row) => {
      const cols = colMap.get(row.taxonomy_id) || {
        importedBalance: 0,
        postedAdjustments: 0,
        draftAdjustments: 0,
        adjustedBalance: 0,
      }
      const factor = row.sign_flip ? -1 : 1

      const draftAdj = includeDrafts && !officialOnly ? cols.draftAdjustments : 0
      const postedAdj = cols.postedAdjustments
      const importedBal = cols.importedBalance
      const adjustedBalance = importedBal + postedAdj + draftAdj

      return {
        ...row,
        importedBalance: importedBal * factor,
        postedAdjustments: postedAdj * factor,
        draftAdjustments: draftAdj * factor,
        adjustedBalance: adjustedBalance * factor,
      }
    })
  }

  // Rolled-up Statements
  const computedBsRows = useMemo(() => {
    return computeTaxonomyColumns(bsRows)
  }, [bsRows, computedItems, accounts, taxonomyLines, includeDrafts, officialOnly])

  const computedIsRows = useMemo(() => {
    return computeTaxonomyColumns(isRows)
  }, [isRows, computedItems, accounts, taxonomyLines, includeDrafts, officialOnly])

  // Drilldown lines query details for side drawer
  const drilldownLines = useMemo(() => {
    if (!drilldownState || !journalEntries) return []

    const accountId = drilldownState.account_id
    const type = drilldownState.type

    const lines: Array<{
      je_id: number
      je_number: string
      entry_date: string
      description: string
      debit: string
      credit: string
      created_by: string
    }> = []

    for (const je of journalEntries) {
      const isPostedMatch = type === 'posted' && je.status === 'posted' && je.source !== 'import' && je.source !== 'tb_import'
      const isDraftMatch = type === 'draft' && je.status === 'draft' && !excludedMap[je.id]

      if (isPostedMatch || isDraftMatch) {
        for (const line of je.lines) {
          if (line.account_id === accountId) {
            lines.push({
              je_id: je.id,
              je_number: je.je_number,
              entry_date: je.entry_date,
              description: je.description || '',
              debit: line.debit || '0',
              credit: line.credit || '0',
              created_by: je.created_by || '—',
            })
          }
        }
      }
    }
    return lines
  }, [drilldownState, journalEntries, excludedMap])

  // Tabs navigation list
  const tabs: { key: Tab; label: string }[] = [
    { key: 'official_tb', label: 'Official Trial Balance' },
    { key: 'draft_tb', label: 'Draft-Adjusted Trial Balance' },
    { key: 'BS', label: 'Balance Sheet' },
    { key: 'IS', label: 'Income Statement' },
    { key: 'CF', label: 'Cash Flow' },
  ]

  // Renders the flat Trial Balance sheet
  function renderTrialBalanceTable(mode: 'official' | 'draft') {
    return (
      <div className="space-y-3">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search accounts by number or name…"
            className="pl-9 pr-4 py-2 w-full rounded-lg border border-slate-200 text-xs focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 transition-all bg-slate-50/50 hover:bg-slate-50"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-xs text-slate-700 min-w-[700px]">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-550 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 pl-4 text-left w-72">Account</th>
                <th className="py-2.5 pl-2 text-left w-32">Type</th>
                <th className="py-2.5 pr-4 text-right w-36">Imported Balance</th>
                <th className="py-2.5 pr-4 text-right w-36">Posted Adj.</th>
                <th className="py-2.5 pr-4 text-right w-36">Draft Adj.</th>
                <th className="py-2.5 pr-4 text-right w-36">Adjusted Balance</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const draftVal = mode === 'draft' && includeDrafts && !officialOnly ? item.draftAdjustments : 0
                const adjVal = item.importedBalance + item.postedAdjustments + draftVal

                const hasPosted = Math.abs(item.postedAdjustments) > 0.005
                const hasDraft = Math.abs(draftVal) > 0.005

                return (
                  <tr key={item.account_id} className="border-b border-slate-100 hover:bg-slate-50/40 transition-colors">
                    <td className="py-2 pl-4 font-medium text-slate-900">
                      {item.account_number} — {item.account_name}
                      {item.is_synthetic_re && <span className="ml-1.5 text-[9px] text-purple-650 font-bold bg-purple-100 px-1 py-0.5 rounded">synthetic RE</span>}
                    </td>
                    <td className="py-2 pl-2 text-slate-500 capitalize">{item.account_type}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{fmt(item.importedBalance)}</td>

                    {/* Posted Adj Drilldown */}
                    <td
                      onClick={() => hasPosted && setDrilldownState({ account_id: item.account_id, account_number: item.account_number, account_name: item.account_name, type: 'posted' })}
                      className={cn('py-2 pr-4 text-right tabular-nums', hasPosted ? 'cursor-pointer hover:underline' : '', adjColor(item.postedAdjustments))}
                    >
                      {hasPosted ? (item.postedAdjustments > 0 ? '+' : '') + fmt(item.postedAdjustments) : '—'}
                    </td>

                    {/* Draft Adj Drilldown */}
                    <td
                      onClick={() => hasDraft && setDrilldownState({ account_id: item.account_id, account_number: item.account_number, account_name: item.account_name, type: 'draft' })}
                      className={cn('py-2 pr-4 text-right tabular-nums', hasDraft ? 'cursor-pointer hover:underline' : '', adjColor(draftVal))}
                    >
                      {hasDraft ? (draftVal > 0 ? '+' : '') + fmt(draftVal) : '—'}
                    </td>

                    <td className="py-2 pr-4 text-right tabular-nums text-slate-900 font-bold">{fmt(adjVal)}</td>
                  </tr>
                )
              })}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                    No accounts found matching the query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* Title & Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financial Statements</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Reports Preview — Book vs. GAAP Adjusting Entry Bridge
          </p>
        </div>
        <div className="flex gap-2">
          {ready && (
            <>
              <button
                onClick={() => inheritMutation.mutate()}
                disabled={inheritMutation.isPending}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors"
                title="Propagate taxonomy classification from parent accounts to children that have none"
              >
                {inheritMutation.isPending ? 'Inheriting…' : 'Inherit Taxonomy'}
              </button>
              <button
                onClick={handleExport}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-md hover:bg-slate-50 transition-colors"
              >
                Export Close Package
              </button>
            </>
          )}
        </div>
      </div>

      {/* P9: Guided Setup Assistant */}
      {ready && unmappedAccountCount > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-sm animate-in fade-in duration-300" data-testid="setup-assistant">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <h3 className="text-sm font-bold text-amber-900">Financial Statements Setup Assistant</h3>
          </div>

          {/* Setup checklist */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Accounts mapped', value: (accounts?.length ?? 0) - unmappedAccountCount, total: accounts?.length ?? 0, ok: unmappedAccountCount === 0 },
              { label: 'Accounts unmapped', value: unmappedAccountCount, total: accounts?.length ?? 0, ok: unmappedAccountCount === 0, warn: true },
              { label: 'Taxonomy initialized', value: (taxonomyLines?.length ?? 0) > 0 ? 'Yes' : 'No', ok: (taxonomyLines?.length ?? 0) > 0 },
              { label: 'JE balances', value: (journalEntries?.items?.length ?? 0) > 0 ? `${journalEntries?.items?.length ?? 0} entries` : 'None', ok: (journalEntries?.items?.length ?? 0) > 0 },
              { label: 'As-of date', value: asOfDate, ok: !!asOfDate },
              { label: 'Scenario', value: scenarioId !== '' ? `#${scenarioId}` : 'All', ok: true },
            ].map((item) => (
              <div key={item.label} className={`rounded-lg p-3 border text-xs ${item.ok ? 'bg-green-50 border-green-200' : item.warn ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <p className="text-gray-500 mb-0.5">{item.label}</p>
                <p className={`font-semibold ${item.ok ? 'text-green-700' : item.warn ? 'text-amber-700' : 'text-gray-600'}`}>
                  {typeof item.value === 'number' && item.total !== undefined
                    ? `${item.value} / ${item.total}`
                    : String(item.value)}
                </p>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => initializeTaxonomyMutation.mutate()}
              disabled={initializeTaxonomyMutation.isPending}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              data-testid="initialize-taxonomy-btn"
            >
              {initializeTaxonomyMutation.isPending ? 'Initializing…' : 'Initialize Taxonomy'}
            </button>
            <a
              href="/coa-import"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Import Trial Balance / COA
            </a>
            <a
              href="/pdf-import"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Import Financial Statements (PDF)
            </a>
            <a
              href="/chart-of-accounts"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Review Unmapped Accounts
            </a>
            <a
              href="/taxonomy-admin"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Open Mapping Workbench
            </a>
            {initializeTaxonomyMutation.isSuccess && (
              <span className="text-xs text-emerald-600 font-semibold self-center animate-pulse">
                ✓ Successfully initialized!
              </span>
            )}
          </div>
        </div>
      )}

      {/* Pro Forma Banner */}
      {ready && includeDrafts && !officialOnly && (computedItems.some(i => i.draftAdjustments !== 0)) && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 shadow-sm transition-all">
          <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold text-amber-900">Preview / Pro Forma — Not Posted</span>
            <span className="ml-2 text-xs text-amber-700">
              This workpaper includes draft adjustments. These balances are not posted to the official general ledger.
            </span>
          </div>
        </div>
      )}

      {/* Parameters Selector Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-4 items-end justify-between shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          <EntitySelect value={entityId} onChange={setEntityId} label="Entity" required />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">As-of Date</label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 transition-all cursor-pointer"
            />
          </div>
          <ScenarioSelect
            value={scenarioId}
            onChange={setScenarioId}
            label="Scenario"
            placeholder="All scenarios (default: Actual)"
          />
        </div>

        {/* Adjusting Checkbox Toggles */}
        {ready && (
          <div className="flex items-center gap-4 py-1.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={officialOnly}
                onChange={(e) => setOfficialOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-350 text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
              Official Only
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeDrafts}
                onChange={(e) => setIncludeDrafts(e.target.checked)}
                disabled={officialOnly}
                className="h-4 w-4 rounded border-slate-350 text-amber-500 focus:ring-amber-500 cursor-pointer disabled:opacity-50"
              />
              Include Draft Adjustments
            </label>
          </div>
        )}

        {/* Inherit feedback */}
        {inheritMutation.data && <InheritFeedback data={inheritMutation.data as InheritResult} />}
      </div>

      {!ready && (
        <div className="text-center py-20 border border-slate-200 border-dashed rounded-xl bg-white shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-1">Select an entity and date</p>
          <p className="text-xs text-slate-500">Choose an entity and reporting date to generate financial statements.</p>
        </div>
      )}

      {ready && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {/* Tabs */}
          <div className="border-b border-slate-100 flex flex-wrap pt-1 bg-slate-50/50">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'px-5 py-3 text-xs font-bold border-b-2 transition-all focus:outline-none cursor-pointer',
                  tab === key
                    ? 'border-amber-500 text-amber-700 bg-white'
                    : 'border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-700'
                )}
                data-testid={`tab-${key}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Statements / TB contents */}
          <div className="p-4">
            {tab === 'official_tb' && renderTrialBalanceTable('official')}
            {tab === 'draft_tb' && renderTrialBalanceTable('draft')}
            {tab === 'BS' && (
              <TaxonomyTable rows={computedBsRows} isLoading={bsLoading} entityId={entityId} onDrilldown={setDrilldownCode} />
            )}
            {tab === 'IS' && (
              <TaxonomyTable rows={computedIsRows} isLoading={isLoading_} entityId={entityId} onDrilldown={setDrilldownCode} />
            )}
            {tab === 'CF' && (
              <CashFlowStatement
                entityId={entityId as number}
                asOfDate={asOfDate}
                scenarioIds={scenarioIds}
              />
            )}
          </div>
        </div>
      )}

      {/* Three-Statement Health Widget */}
      {ready && fsValidation && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-3">Three-Statement Health</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                label: 'Balance Sheet',
                ok: fsValidation.is_balanced,
                detail: fsValidation.is_balanced ? 'In balance' : `Off by ${fmt(fsValidation.bs_difference)}`,
              },
              {
                label: 'Cash Flow',
                ok: fsValidation.cf_tied,
                detail: fsValidation.cf_tied
                  ? 'Tied to BS cash'
                  : fsValidation.cf_difference != null
                  ? `Off by ${fmt(fsValidation.cf_difference)}`
                  : 'Not computed',
              },
              {
                label: 'Retained Earnings',
                ok: fsValidation.re_tied,
                detail: fsValidation.re_tied
                  ? 'Tied to net income'
                  : fsValidation.re_difference != null
                  ? `Off by ${fmt(fsValidation.re_difference)}`
                  : 'Not computed',
              },
            ].map(({ label, ok, detail }) => (
              <div
                key={label}
                className={`flex items-start gap-3 rounded-lg border p-3 text-xs ${
                  ok ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
                }`}
              >
                <span className={`mt-0.5 text-base leading-none ${ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {ok ? '✓' : '✗'}
                </span>
                <div>
                  <p className={`font-semibold ${ok ? 'text-emerald-800' : 'text-rose-800'}`}>{label}</p>
                  <p className={`mt-0.5 ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>{detail}</p>
                </div>
              </div>
            ))}
          </div>
          {fsValidation.issues.length > 0 && (
            <ul className="mt-3 space-y-1">
              {fsValidation.issues.map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                  {issue}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Legacy Drilldown Modal panel */}
      {drilldownCode && (
        <DrilldownPanel
          drilldown={drilldown ?? null}
          onClose={() => setDrilldownCode(null)}
          taxonomyLines={taxonomyLines}
        />
      )}

      {/* Dev Only Debug Panel */}
      {isDev && ready && (
        <StatementDebugPanel
          entityId={entityId}
          asOfDate={asOfDate}
          scenarioId={scenarioId}
          bsRows={bsRows}
          isRows={isRows}
        />
      )}

      {/* Drilldown Slide-out Drawer Dialog */}
      <Dialog.Root open={!!drilldownState} onOpenChange={(open) => !open && setDrilldownState(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 transition-opacity animate-in fade-in" />
          <Dialog.Content className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-2xl bg-white shadow-2xl border-l border-slate-200 flex flex-col focus:outline-none animate-in slide-in-from-right duration-250">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <Dialog.Title className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  Drilldown Details
                </Dialog.Title>
                <Dialog.Description className="text-xs text-slate-500 mt-0.5">
                  {drilldownState && `Account: ${drilldownState.account_number} — ${drilldownState.account_name} (${drilldownState.type === 'posted' ? 'Posted' : 'Draft'} Adjustments)`}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  onClick={() => setDrilldownState(null)}
                  className="rounded p-1 hover:bg-slate-100 transition-colors"
                >
                  <X className="h-4 w-4 text-slate-400 hover:text-slate-650" />
                </button>
              </Dialog.Close>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead>
                    <tr className="border-b bg-slate-50 text-slate-550 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">JE Number</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-right">Debit</th>
                      <th className="py-2.5 px-3 text-right">Credit</th>
                      <th className="py-2.5 px-3">Preparer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldownLines.map((line, idx) => (
                      <tr key={`${line.je_id}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{line.je_number}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-550">{line.entry_date}</td>
                        <td className="py-2.5 px-3 max-w-[200px] truncate text-slate-600" title={line.description}>
                          {line.description || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-emerald-700">
                          {parseFloat(line.debit) > 0.005 ? fmt(line.debit) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-rose-700">
                          {parseFloat(line.credit) > 0.005 ? fmt(line.credit) : '—'}
                        </td>
                        <td className="py-2.5 px-3 truncate max-w-[120px] text-slate-500" title={line.created_by}>
                          {line.created_by}
                        </td>
                      </tr>
                    ))}
                    {drilldownLines.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                          No contributing adjusting entry lines found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50">
              <Dialog.Close asChild>
                <button
                  type="button"
                  onClick={() => setDrilldownState(null)}
                  className="rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none"
                >
                  Close
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
