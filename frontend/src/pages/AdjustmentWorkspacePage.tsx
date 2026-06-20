import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  SlidersHorizontal, Search, X, Package,
  AlertTriangle, CheckCircle2, Clock, Plus, Edit3,
  ChevronDown, ChevronRight, ArrowUpDown,
} from 'lucide-react'

import { adjustmentWorkspaceApi, type AdjustmentListItem, type AdjustmentPackage } from '@/api/adjustmentWorkspace'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { FilterBar } from '@/components/data-grid'
import { useToast } from '@/providers/ToastProvider'
import { useFormatCurrency } from '@/hooks/useFormatCurrency'
import { cn } from '@/utils/cn'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MATERIALITY_OPTIONS = [
  { value: 'clearly_trivial', label: 'Clearly Trivial', color: 'text-slate-500 bg-slate-100' },
  { value: 'immaterial', label: 'Immaterial', color: 'text-blue-700 bg-blue-50' },
  { value: 'material', label: 'Material', color: 'text-amber-700 bg-amber-50' },
  { value: 'critical', label: 'Critical', color: 'text-rose-700 bg-rose-100' },
]

const OVERLAY_OPTIONS = [
  { value: 'audit_adjustment', label: 'Audit Adjustment' },
  { value: 'topside', label: 'Topside' },
  { value: 'elimination', label: 'Elimination' },
  { value: 'accrual', label: 'Accrual' },
  { value: 'pro_forma', label: 'Pro Forma' },
  { value: 'tax', label: 'Tax' },
]

const PKG_TYPE_OPTIONS = [
  { value: 'audit', label: 'Audit' },
  { value: 'management', label: 'Management' },
  { value: 'tax', label: 'Tax' },
  { value: 'qoe', label: 'QoE' },
  { value: 'seller', label: 'Seller' },
  { value: 'buyer', label: 'Buyer' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function materialityConfig(m: string | null) {
  return MATERIALITY_OPTIONS.find((o) => o.value === m) ?? null
}

function MaterialityBadge({ value }: { value: string | null }) {
  const cfg = materialityConfig(value)
  if (!cfg) return <span className="text-xs text-slate-300">—</span>
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide', cfg.color)}>
      {cfg.label}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-amber-400',
    posted: 'bg-emerald-500',
    reversed: 'bg-slate-400',
  }
  return <span className={cn('inline-block w-2 h-2 rounded-full flex-shrink-0', map[status] ?? 'bg-slate-300')} />
}

// ---------------------------------------------------------------------------
// Package management panel
// ---------------------------------------------------------------------------

function PackagePanel({ packages, onCreatePackage, onDeletePackage }: {
  packages: AdjustmentPackage[]
  onCreatePackage: (name: string, type: string) => void
  onDeletePackage: (id: number) => void
}) {
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('audit')

  return (
    <div data-testid="package-panel" className="space-y-4">
      <div className="text-sm font-semibold text-slate-700">Adjustment Packages</div>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <input
            data-testid="package-name-input"
            type="text"
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="Package name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <select
          className="text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
        >
          {PKG_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          data-testid="create-package-btn"
          onClick={() => { if (newName.trim()) { onCreatePackage(newName.trim(), newType); setNewName('') } }}
          className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-1.5">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            data-testid={`package-row-${pkg.id}`}
            className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded border border-slate-200"
          >
            <div>
              <div className="text-xs font-semibold text-slate-800">{pkg.name}</div>
              <div className="text-[10px] text-slate-400">{pkg.package_type} · {pkg.member_count} entries · {pkg.status}</div>
            </div>
            <button
              onClick={() => onDeletePackage(pkg.id)}
              className="text-slate-300 hover:text-rose-500 transition-colors p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {packages.length === 0 && (
          <div className="text-xs text-slate-400 text-center py-4">No packages yet</div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Multi-select impact bar
// ---------------------------------------------------------------------------

function MultiImpactBar({ selectedIds, fmt }: { selectedIds: number[]; fmt: (v: number | null | undefined) => string }) {
  const { data: impact } = useQuery({
    queryKey: ['adj-impact-preview', selectedIds],
    queryFn: () => adjustmentWorkspaceApi.impactPreview(selectedIds),
    enabled: selectedIds.length > 0,
  })

  if (selectedIds.length === 0) return null

  return (
    <div data-testid="multi-impact-bar" className="flex items-center gap-6 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs">
      <span className="font-semibold text-indigo-700">{selectedIds.length} selected</span>
      {impact && (
        <>
          {impact.ni_impact !== 0 && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 leading-none">NI</span>
              <span className={cn('text-xs font-semibold leading-tight', impact.ni_impact > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                {impact.ni_impact > 0 ? '+' : ''}{fmt(impact.ni_impact)}
              </span>
            </div>
          )}
          {impact.ebitda_impact !== 0 && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 leading-none">EBITDA</span>
              <span className={cn('text-xs font-semibold leading-tight', impact.ebitda_impact > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                {impact.ebitda_impact > 0 ? '+' : ''}{fmt(impact.ebitda_impact)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline JE lines sub-table
// ---------------------------------------------------------------------------

function JELinesTable({ lines, fmt }: { lines: NonNullable<AdjustmentListItem['lines']>; fmt: (v: number | null | undefined) => string }) {
  return (
    <tr>
      <td colSpan={13} className="px-0 pb-0">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-slate-50 border-t border-slate-100">
              <th className="w-8" />
              <th className="px-3 py-1 text-left text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Acct #</th>
              <th className="px-3 py-1 text-left text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Account Name</th>
              <th className="px-3 py-1 text-right text-[9px] font-semibold text-slate-400 uppercase tracking-wide w-24">Debit</th>
              <th className="px-3 py-1 text-right text-[9px] font-semibold text-slate-400 uppercase tracking-wide w-24">Credit</th>
              <th className="px-3 py-1 text-right text-[9px] font-semibold text-slate-400 uppercase tracking-wide w-24">Net Impact</th>
              <th className="px-3 py-1 text-left text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Line Memo</th>
              <th colSpan={6} />
            </tr>
          </thead>
          <tbody>
            {lines.map((ln) => {
              const net = ln.debit - ln.credit
              return (
                <tr key={ln.line_number} className="border-t border-slate-50 hover:bg-indigo-50/40">
                  <td className="w-8" />
                  <td className="px-3 py-1 font-mono text-slate-500">{ln.account_number}</td>
                  <td className="px-3 py-1 text-slate-700">{ln.account_name}</td>
                  <td className="px-3 py-1 text-right font-mono text-slate-700">
                    {ln.debit > 0 ? fmt(ln.debit) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-1 text-right font-mono text-slate-700">
                    {ln.credit > 0 ? fmt(ln.credit) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-1 text-right font-mono font-semibold">
                    {net !== 0 ? (
                      <span className={net > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                        {net > 0 ? '+' : '-'}{fmt(Math.abs(net))}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-slate-400 italic">{ln.description ?? ''}</td>
                  <td colSpan={6} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdjustmentWorkspacePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const fmt = useFormatCurrency()

  // Filters (passed to API)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterOverlay, setFilterOverlay] = useState('')
  const [filterMateriality, setFilterMateriality] = useState('')
  const [filterPackage, setFilterPackage] = useState<number | undefined>()
  // Local filter bar state (applied client-side on sortedItems)
  const [fbDescription, setFbDescription] = useState('')
  const [fbStatus, setFbStatus] = useState<string[]>([])
  const [fbNIMin, setFbNIMin] = useState('')
  const [fbNIMax, setFbNIMax] = useState('')
  const [fbBSMin, setFbBSMin] = useState('')
  const [fbBSMax, setFbBSMax] = useState('')
  const [fbDateFrom, setFbDateFrom] = useState('')
  const [fbDateTo, setFbDateTo] = useState('')

  // UI state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set())
  const [showPackages, setShowPackages] = useState(false)
  const [sortKey, setSortKey] = useState<string>('entry_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const filters = useMemo(() => ({
    search: search || undefined,
    status: filterStatus || undefined,
    overlay_group: filterOverlay || undefined,
    materiality: filterMateriality || undefined,
    package_id: filterPackage,
    include_lines: true,
    limit: 200,
  }), [search, filterStatus, filterOverlay, filterMateriality, filterPackage])

  const { data: items, isLoading, error } = useQuery({
    queryKey: ['adj-workspace', filters],
    queryFn: () => adjustmentWorkspaceApi.listAdjustments(filters),
  })

  const { data: packages = [] } = useQuery({
    queryKey: ['adj-packages'],
    queryFn: () => adjustmentWorkspaceApi.listPackages(),
  })

  const materialityMutation = useMutation({
    mutationFn: ({ jeId, materiality }: { jeId: number; materiality: string | null }) =>
      adjustmentWorkspaceApi.setMateriality(jeId, materiality),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adj-workspace'] }),
  })

  const createPackageMutation = useMutation({
    mutationFn: ({ name, type }: { name: string; type: string }) =>
      adjustmentWorkspaceApi.createPackage({ name, package_type: type }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adj-packages'] })
      toast('Package created', 'success')
    },
  })

  const deletePackageMutation = useMutation({
    mutationFn: (id: number) => adjustmentWorkspaceApi.deletePackage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adj-packages'] })
      toast('Package deleted', 'success')
    },
  })

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!items) return
    if (selectedIds.size === items.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(items.map((i) => i.id)))
  }

  const toggleCollapse = (id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const stats = useMemo(() => {
    if (!items) return null
    return {
      total: items.length,
      draft: items.filter((i) => i.status === 'draft').length,
      posted: items.filter((i) => i.status === 'posted').length,
      material: items.filter((i) => i.materiality === 'material' || i.materiality === 'critical').length,
      open: items.filter((i) => i.has_advisor_note && i.advisor_resolution_status === 'open').length,
    }
  }, [items])

  function handleSort(key: string) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sortedItems = useMemo(() => {
    if (!items) return []
    return [...items].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''
      if (sortKey === 'je_number') { av = a.je_number; bv = b.je_number }
      else if (sortKey === 'entry_date') { av = a.entry_date; bv = b.entry_date }
      else if (sortKey === 'description') { av = a.description ?? ''; bv = b.description ?? '' }
      else if (sortKey === 'status') { av = a.status; bv = b.status }
      else if (sortKey === 'materiality') {
        const order = ['critical', 'material', 'immaterial', 'clearly_trivial', '']
        av = order.indexOf(a.materiality ?? ''); bv = order.indexOf(b.materiality ?? '')
      }
      else if (sortKey === 'total_debit') { av = a.total_debit; bv = b.total_debit }
      else if (sortKey === 'total_credit') { av = a.total_credit; bv = b.total_credit }
      else if (sortKey === 'ni_impact') { av = a.impact.ni_impact; bv = b.impact.ni_impact }
      const cmp = typeof av === 'number'
        ? av - (bv as number)
        : String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [items, sortKey, sortDir])

  const filteredItems = useMemo(() => {
    return sortedItems.filter((item) => {
      if (fbDescription && !(item.description ?? '').toLowerCase().includes(fbDescription.toLowerCase())) return false
      if (fbStatus.length > 0 && !fbStatus.includes(item.status)) return false
      const ni = item.impact.ni_impact
      if (fbNIMin && ni < parseFloat(fbNIMin)) return false
      if (fbNIMax && ni > parseFloat(fbNIMax)) return false
      const bs = item.impact.asset_impact + item.impact.liability_impact + item.impact.equity_impact
      if (fbBSMin && bs < parseFloat(fbBSMin)) return false
      if (fbBSMax && bs > parseFloat(fbBSMax)) return false
      if (fbDateFrom && item.entry_date < fbDateFrom) return false
      if (fbDateTo && item.entry_date > fbDateTo) return false
      return true
    })
  }, [sortedItems, fbDescription, fbStatus, fbNIMin, fbNIMax, fbBSMin, fbBSMax, fbDateFrom, fbDateTo])

  function SortTh({ col, label, className }: { col: string; label: string; className?: string }) {
    const active = sortKey === col
    return (
      <th
        className={cn('px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:bg-slate-100 transition-colors', className)}
        onClick={() => handleSort(col)}
      >
        <span className="flex items-center gap-1">
          {label}
          <ArrowUpDown className={cn('w-3 h-3', active ? 'text-indigo-500' : 'text-slate-300')} />
        </span>
      </th>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageLayout
        title="Adjustment Workbench"
        subtitle="JE lines expanded inline — review every debit and credit without a click"
        breadcrumb={
          <Breadcrumb items={[
            { label: 'Workbench', href: '/workbench/adjustment-bridge' },
            { label: 'Adjustment Workbench' },
          ]} />
        }
        actions={
          <div className="flex items-center gap-3">
            <WorkspaceCrossLinks current="adjustment" />
            <button
              type="button"
              onClick={() => setShowPackages((v) => !v)}
              className={cn(
                'text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5',
                showPackages
                  ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
              data-testid="toggle-packages-btn"
            >
              <Package className="w-3.5 h-3.5" />
              Packages
              {packages.length > 0 && (
                <span className="ml-0.5 px-1 py-0 bg-indigo-200 text-indigo-800 rounded-full text-[9px] font-bold">
                  {packages.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/workbench/journal-entries/new')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New Adjustment
            </button>
          </div>
        }
      >

        {/* KPI strip */}
        {stats && (
          <div className="grid grid-cols-5 gap-3" data-testid="workspace-kpi-strip">
            {[
              { label: 'Total Adjustments', value: stats.total, icon: SlidersHorizontal, color: 'text-slate-700' },
              { label: 'Draft', value: stats.draft, icon: Clock, color: 'text-amber-600' },
              { label: 'Posted', value: stats.posted, icon: CheckCircle2, color: 'text-emerald-600' },
              { label: 'Material / Critical', value: stats.material, icon: AlertTriangle, color: 'text-rose-600' },
              { label: 'Open Issues', value: stats.open, icon: Edit3, color: 'text-orange-600' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
                <Icon className={cn('w-4 h-4 flex-shrink-0', color)} />
                <div>
                  <div className="text-lg font-bold text-slate-900">{value}</div>
                  <div className="text-[10px] text-slate-400 leading-tight">{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Packages panel */}
        {showPackages && (
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <PackagePanel
              packages={packages}
              onCreatePackage={(name, type) => createPackageMutation.mutate({ name, type })}
              onDeletePackage={(id) => deletePackageMutation.mutate(id)}
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2" data-testid="workspace-filters">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              data-testid="workspace-search"
              type="text"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Search JE # or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            data-testid="filter-status"
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
            <option value="reversed">Reversed</option>
          </select>
          <select
            data-testid="filter-overlay"
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={filterOverlay}
            onChange={(e) => setFilterOverlay(e.target.value)}
          >
            <option value="">All Types</option>
            {OVERLAY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            data-testid="filter-materiality"
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={filterMateriality}
            onChange={(e) => setFilterMateriality(e.target.value)}
          >
            <option value="">All Materiality</option>
            {MATERIALITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            data-testid="filter-package"
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={filterPackage ?? ''}
            onChange={(e) => setFilterPackage(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">All Packages</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {(search || filterStatus || filterOverlay || filterMateriality || filterPackage) && (
            <button
              onClick={() => { setSearch(''); setFilterStatus(''); setFilterOverlay(''); setFilterMateriality(''); setFilterPackage(undefined) }}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              <X className="w-3 h-3" />Clear
            </button>
          )}
        </div>

        {/* Column filter bar */}
        {(() => {
          const fbActiveCount = [fbDescription, fbNIMin, fbNIMax, fbBSMin, fbBSMax, fbDateFrom, fbDateTo].filter(Boolean).length + fbStatus.length
          const clearFb = () => {
            setFbDescription(''); setFbStatus([]); setFbNIMin(''); setFbNIMax(''); setFbBSMin(''); setFbBSMax(''); setFbDateFrom(''); setFbDateTo('')
          }
          return (
            <FilterBar
              data-testid="adj-filter-bar"
              clearButtonTestId="adj-filter-clear"
              activeCount={fbActiveCount}
              onClearAll={clearFb}
              filters={[
                {
                  key: 'adj-filter-description',
                  label: 'Description',
                  type: 'text',
                  value: fbDescription,
                  onChange: setFbDescription,
                },
                {
                  key: 'adj-filter-status',
                  label: 'Status',
                  type: 'checklist',
                  value: fbStatus,
                  onChange: setFbStatus,
                  options: ['draft', 'posted', 'reversed'],
                },
                {
                  key: 'adj-filter-ni-impact',
                  label: 'NI Impact',
                  type: 'numeric-range',
                  value: { min: fbNIMin, max: fbNIMax },
                  onChange: (v: { min?: string; max?: string }) => { setFbNIMin(v.min ?? ''); setFbNIMax(v.max ?? '') },
                },
                {
                  key: 'adj-filter-bs-impact',
                  label: 'BS Impact',
                  type: 'numeric-range',
                  value: { min: fbBSMin, max: fbBSMax },
                  onChange: (v: { min?: string; max?: string }) => { setFbBSMin(v.min ?? ''); setFbBSMax(v.max ?? '') },
                },
                {
                  key: 'adj-filter-date',
                  label: 'Date',
                  type: 'date-range',
                  value: { from: fbDateFrom, to: fbDateTo },
                  onChange: (v: { from?: string; to?: string }) => { setFbDateFrom(v.from ?? ''); setFbDateTo(v.to ?? '') },
                },
              ]}
            />
          )
        })()}

        {/* Multi-select bar */}
        <MultiImpactBar selectedIds={Array.from(selectedIds)} fmt={fmt} />

        {/* Grid */}
        {isLoading ? (
          <LoadingState message="Loading adjustments…" />
        ) : error ? (
          <ErrorState message="Failed to load adjustments" />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" data-testid="adjustment-grid">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={items && items.length > 0 && selectedIds.size === items.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="w-6 px-1 py-2" />
                  <SortTh col="je_number" label="JE #" />
                  <SortTh col="entry_date" label="Date" />
                  <SortTh col="description" label="Description" />
                  <SortTh col="status" label="Status" />
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                  <SortTh col="materiality" label="Materiality" />
                  <SortTh col="total_debit" label="Total Dr" className="text-right" />
                  <SortTh col="total_credit" label="Total Cr" className="text-right" />
                  <SortTh col="bs_impact" label="BS Impact" className="text-right" />
                  <SortTh col="ni_impact" label="NI Impact" className="text-right" />
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={13} className="px-3 py-8 text-center text-slate-400">
                      No adjustments match the current filters.
                    </td>
                  </tr>
                )}
                {(() => {
                  const totalDr = filteredItems.reduce((s, i) => s + i.total_debit, 0)
                  const totalCr = filteredItems.reduce((s, i) => s + i.total_credit, 0)
                  const totalNI = filteredItems.reduce((s, i) => s + i.impact.ni_impact, 0)
                  const totalBS = filteredItems.reduce((s, i) => s + i.impact.asset_impact + i.impact.liability_impact + i.impact.equity_impact, 0)
                  return filteredItems.length > 1 ? (
                    <tr className="bg-slate-100 border-t-2 border-slate-300 text-[10px] font-bold text-slate-600">
                      <td colSpan={2} />
                      <td colSpan={6} className="px-3 py-2 uppercase tracking-wide text-slate-400">
                        Total ({filteredItems.length} adjustments)
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totalDr)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totalCr)}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        <span className={totalBS > 0 ? 'text-emerald-700' : totalBS < 0 ? 'text-rose-700' : 'text-slate-400'}>
                          {totalBS !== 0 ? (totalBS > 0 ? '+' : '') + fmt(Math.abs(totalBS)) : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        <span className={totalNI > 0 ? 'text-emerald-700' : totalNI < 0 ? 'text-rose-700' : 'text-slate-400'}>
                          {totalNI !== 0 ? (totalNI > 0 ? '+' : '') + fmt(Math.abs(totalNI)) : '—'}
                        </span>
                      </td>
                      <td colSpan={2} />
                    </tr>
                  ) : null
                })()}
                {filteredItems.map((item) => {
                  const isCollapsed = collapsedIds.has(item.id)
                  const hasLines = item.lines && item.lines.length > 0
                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        data-testid={`adj-row-${item.id}`}
                        className={cn(
                          'hover:bg-slate-50 transition-colors',
                          selectedIds.has(item.id) && 'bg-indigo-50',
                        )}
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                          />
                        </td>
                        <td className="px-1 py-2">
                          {hasLines && (
                            <button
                              type="button"
                              onClick={() => toggleCollapse(item.id)}
                              className="text-slate-400 hover:text-slate-600 p-0.5"
                              aria-label={isCollapsed ? 'Expand lines' : 'Collapse lines'}
                            >
                              {isCollapsed
                                ? <ChevronRight className="w-3.5 h-3.5" />
                                : <ChevronDown className="w-3.5 h-3.5" />
                              }
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700">{item.je_number}</td>
                        <td className="px-3 py-2 text-slate-500">{item.entry_date}</td>
                        <td className="px-3 py-2 text-slate-800 max-w-[200px] truncate">{item.description}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <StatusDot status={item.status} />
                            <span className="capitalize text-slate-700">{item.status}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {item.overlay_group ? (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">
                              {item.overlay_group.replace(/_/g, ' ')}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <MaterialityBadge value={item.materiality} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700" data-testid="total-debit">
                          {fmt(item.total_debit)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700" data-testid="total-credit">
                          {fmt(item.total_credit)}
                        </td>
                        <td className="px-3 py-2 text-right" data-testid={`adj-bs-impact-${item.id}`}>
                          {item.impact.asset_impact || item.impact.liability_impact || item.impact.equity_impact ? (
                            <span className={cn('font-semibold', (item.impact.asset_impact + item.impact.liability_impact + item.impact.equity_impact) > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                              {(item.impact.asset_impact + item.impact.liability_impact + item.impact.equity_impact) > 0 ? '+' : ''}{fmt(Math.abs(item.impact.asset_impact + item.impact.liability_impact + item.impact.equity_impact))}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="px-3 py-2 text-right" data-testid={`adj-ni-impact-${item.id}`}>
                          {item.impact.ni_impact !== 0 ? (
                            <span className={cn('font-semibold', item.impact.ni_impact > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                              {item.impact.ni_impact > 0 ? '+' : ''}{fmt(Math.abs(item.impact.ni_impact))}
                              {item.impact.ni_impact < 0 && <span className="text-rose-600"> ↓</span>}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-400 text-[10px]">{item.source}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/workbench/journal-entries/${item.id}/edit`)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                      {hasLines && !isCollapsed && (
                        <JELinesTable key={`lines-${item.id}`} lines={item.lines!} fmt={fmt} />
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      </PageLayout>
    </div>
  )
}
