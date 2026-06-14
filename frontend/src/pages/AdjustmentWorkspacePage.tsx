import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  SlidersHorizontal, Search, X, ChevronRight, Package, FileText,
  TrendingUp, AlertTriangle, CheckCircle2, Clock, Plus, Edit3,
  Tag, BarChart3, Layers, Filter,
} from 'lucide-react'

import { adjustmentWorkspaceApi, type AdjustmentListItem, type AdjustmentPackage } from '@/api/adjustmentWorkspace'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { useToast } from '@/providers/ToastProvider'
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

function materialityConfig(m: string | null) {
  return MATERIALITY_OPTIONS.find((o) => o.value === m) ?? null
}

function fmtAmount(n: number): string {
  if (n === 0) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '(' : ''
  const end = n < 0 ? ')' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M${end}`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K${end}`
  return `${sign}$${abs.toFixed(0)}${end}`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ImpactBadge({ value, label }: { value: number; label: string }) {
  if (value === 0) return null
  const positive = value > 0
  return (
    <div className="flex flex-col items-end">
      <span className="text-[10px] text-slate-400 leading-none">{label}</span>
      <span className={cn('text-xs font-semibold leading-tight', positive ? 'text-emerald-600' : 'text-rose-600')}>
        {positive ? '+' : ''}{fmtAmount(value)}
      </span>
    </div>
  )
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
    voided: 'bg-slate-300',
  }
  return <span className={cn('inline-block w-2 h-2 rounded-full flex-shrink-0', map[status] ?? 'bg-slate-300')} />
}

// ---------------------------------------------------------------------------
// Impact sidebar panel
// ---------------------------------------------------------------------------

interface ImpactDrawerProps {
  item: AdjustmentListItem
  packages: AdjustmentPackage[]
  onClose: () => void
  onMaterialityChange: (jeId: number, m: string | null) => void
}

function ImpactDrawer({ item, packages, onClose, onMaterialityChange }: ImpactDrawerProps) {
  const { data: note } = useQuery({
    queryKey: ['adj-notes', item.id],
    queryFn: () => adjustmentWorkspaceApi.getNotes(item.id),
  })
  const qc = useQueryClient()
  const toast = useToast()
  const [issueVal, setIssueVal] = useState(note?.issue ?? '')
  const [recVal, setRecVal] = useState(note?.recommendation ?? '')
  const [clientVal, setClientVal] = useState(note?.client_response ?? '')
  const [resStatus, setResStatus] = useState(note?.resolution_status ?? 'open')

  const noteMutation = useMutation({
    mutationFn: () =>
      adjustmentWorkspaceApi.upsertNotes(item.id, {
        issue: issueVal || undefined,
        recommendation: recVal || undefined,
        client_response: clientVal || undefined,
        resolution_status: resStatus,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adj-notes', item.id] })
      qc.invalidateQueries({ queryKey: ['adj-workspace'] })
      toast('Notes saved', 'success')
    },
  })

  const memberPkgIds = new Set(item.package_ids)
  const myPkgs = packages.filter((p) => memberPkgIds.has(p.id))

  return (
    <div data-testid="impact-drawer" className="fixed inset-y-0 right-0 w-96 bg-white border-l border-slate-200 shadow-xl z-40 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div>
          <div className="text-xs text-slate-400 font-mono">{item.je_number}</div>
          <div className="text-sm font-semibold text-slate-800 truncate max-w-[280px]">{item.description}</div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-200 text-slate-500">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Status & materiality */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</div>
          <div className="flex items-center gap-2">
            <StatusDot status={item.status} />
            <span className="text-sm capitalize text-slate-700">{item.status}</span>
          </div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-3">Materiality</div>
          <div className="flex flex-wrap gap-1.5">
            {MATERIALITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onMaterialityChange(item.id, item.materiality === opt.value ? null : opt.value)}
                className={cn(
                  'px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wide border transition-all',
                  item.materiality === opt.value
                    ? cn(opt.color, 'border-current shadow-sm')
                    : 'text-slate-400 bg-slate-50 border-slate-200 hover:border-slate-300',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Financial impact */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Financial Impact</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'NI Impact', value: item.impact.ni_impact },
              { label: 'EBITDA Impact', value: item.impact.ebitda_impact },
              { label: 'Asset Impact', value: item.impact.asset_impact },
              { label: 'Liability Impact', value: item.impact.liability_impact },
              { label: 'Equity Impact', value: item.impact.equity_impact },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded p-2">
                <div className="text-[10px] text-slate-400">{label}</div>
                <div className={cn('text-sm font-semibold', value > 0 ? 'text-emerald-600' : value < 0 ? 'text-rose-600' : 'text-slate-400')}>
                  {value === 0 ? '—' : `${value > 0 ? '+' : ''}${fmtAmount(value)}`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Packages */}
        {myPkgs.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Packages</div>
            {myPkgs.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-xs text-slate-700 bg-indigo-50 px-2 py-1 rounded">
                <Package className="w-3 h-3 text-indigo-500" />
                {p.name}
                <span className="text-indigo-400 text-[10px]">{p.package_type}</span>
              </div>
            ))}
          </div>
        )}

        {/* Advisor notes */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Advisor Notes</div>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 block">Issue</label>
              <textarea
                className="w-full text-xs border border-slate-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
                rows={2}
                value={issueVal}
                onChange={(e) => setIssueVal(e.target.value)}
                placeholder="Describe the issue…"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 block">Recommendation</label>
              <textarea
                className="w-full text-xs border border-slate-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
                rows={2}
                value={recVal}
                onChange={(e) => setRecVal(e.target.value)}
                placeholder="Advisor recommendation…"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 block">Client Response</label>
              <textarea
                className="w-full text-xs border border-slate-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
                rows={2}
                value={clientVal}
                onChange={(e) => setClientVal(e.target.value)}
                placeholder="Client's response…"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 mb-0.5 block">Resolution Status</label>
              <select
                className="w-full text-xs border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                value={resStatus}
                onChange={(e) => setResStatus(e.target.value)}
              >
                <option value="open">Open</option>
                <option value="pending_client">Pending Client</option>
                <option value="resolved">Resolved</option>
                <option value="na">N/A</option>
              </select>
            </div>
          </div>
          <button
            onClick={() => noteMutation.mutate()}
            disabled={noteMutation.isPending}
            className="w-full py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {noteMutation.isPending ? 'Saving…' : 'Save Notes'}
          </button>
        </div>

      </div>

      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
        <a
          href={`/workbench/journal-entries/${item.id}`}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          Open in Journal Entries <ChevronRight className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
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

function MultiImpactBar({ selectedIds }: { selectedIds: number[] }) {
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
          <ImpactBadge value={impact.ni_impact} label="NI" />
          <ImpactBadge value={impact.ebitda_impact} label="EBITDA" />
          <ImpactBadge value={impact.asset_impact} label="Assets" />
          <ImpactBadge value={impact.liability_impact} label="Liabilities" />
          <ImpactBadge value={impact.equity_impact} label="Equity" />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdjustmentWorkspacePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()

  // Filters
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterOverlay, setFilterOverlay] = useState('')
  const [filterMateriality, setFilterMateriality] = useState('')
  const [filterPackage, setFilterPackage] = useState<number | undefined>()

  // UI state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [drawerItem, setDrawerItem] = useState<AdjustmentListItem | null>(null)
  const [showPackages, setShowPackages] = useState(false)
  const [activeTab, setActiveTab] = useState<'adjustments' | 'rollforward'>('adjustments')

  const filters = useMemo(() => ({
    search: search || undefined,
    status: filterStatus || undefined,
    overlay_group: filterOverlay || undefined,
    materiality: filterMateriality || undefined,
    package_id: filterPackage,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adj-workspace'] })
      if (drawerItem) {
        qc.invalidateQueries({ queryKey: ['adj-workspace'] })
      }
    },
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
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)))
    }
  }

  // Summary stats
  const stats = useMemo(() => {
    if (!items) return null
    return {
      total: items.length,
      draft: items.filter((i) => i.status === 'draft').length,
      material: items.filter((i) => i.materiality === 'material' || i.materiality === 'critical').length,
      pending: items.filter((i) => i.advisor_resolution_status === 'pending_client').length,
      open: items.filter((i) => i.has_advisor_note && i.advisor_resolution_status === 'open').length,
    }
  }, [items])

  // Update drawer item from fresh data
  const drawerItemFresh = useMemo(
    () => (drawerItem ? items?.find((i) => i.id === drawerItem.id) ?? drawerItem : null),
    [drawerItem, items],
  )

  return (
    <div className="flex flex-col h-full">
      <PageLayout
        title="Adjustment Workspace"
        subtitle="Unified view of all adjustments, their financial impact, packages, and advisor notes"
        breadcrumb={
          <Breadcrumb items={[
            { label: 'Workbench', href: '/workbench/adjustment-bridge' },
            { label: 'Adjustment Workspace' },
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
              { label: 'Material / Critical', value: stats.material, icon: AlertTriangle, color: 'text-rose-600' },
              { label: 'Pending Client', value: stats.pending, icon: FileText, color: 'text-indigo-600' },
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

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 -mb-2">
          {[
            { id: 'adjustments', label: 'Master Grid', icon: SlidersHorizontal },
            { id: 'rollforward', label: 'Rollforward', icon: BarChart3 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              data-testid={`tab-${id}`}
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
                activeTab === id
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'adjustments' && (
          <div className="space-y-3">

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

            {/* Multi-select bar */}
            <MultiImpactBar selectedIds={Array.from(selectedIds)} />

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
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">JE #</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Materiality</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">NI Impact</th>
                      <th className="px-3 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items?.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                          No adjustments match the current filters.
                        </td>
                      </tr>
                    )}
                    {items?.map((item) => (
                      <tr
                        key={item.id}
                        data-testid={`adj-row-${item.id}`}
                        className={cn(
                          'hover:bg-slate-50 cursor-pointer transition-colors',
                          selectedIds.has(item.id) && 'bg-indigo-50',
                          drawerItem?.id === item.id && 'bg-indigo-100',
                        )}
                        onClick={() => setDrawerItem(drawerItem?.id === item.id ? null : item)}
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700">{item.je_number}</td>
                        <td className="px-3 py-2 text-slate-500">{item.entry_date}</td>
                        <td className="px-3 py-2 text-slate-800 max-w-[200px] truncate">{item.description}</td>
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
                          <div className="flex items-center gap-1.5">
                            <StatusDot status={item.status} />
                            <span className="capitalize text-slate-700">{item.status}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <MaterialityBadge value={item.materiality} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">{fmtAmount(item.total_debit)}</td>
                        <td className="px-3 py-2 text-right">
                          {item.impact.ni_impact !== 0 ? (
                            <span className={cn('font-semibold', item.impact.ni_impact > 0 ? 'text-emerald-600' : 'text-rose-600')}>
                              {item.impact.ni_impact > 0 ? '+' : ''}{fmtAmount(item.impact.ni_impact)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {item.has_advisor_note && (
                            <span className={cn(
                              'inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold',
                              item.advisor_resolution_status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                              item.advisor_resolution_status === 'pending_client' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-600',
                            )}>
                              ✓
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'rollforward' && (
          <RollforwardTab />
        )}

      </PageLayout>

      {drawerItemFresh && (
        <ImpactDrawer
          item={drawerItemFresh}
          packages={packages}
          onClose={() => setDrawerItem(null)}
          onMaterialityChange={(jeId, m) => materialityMutation.mutate({ jeId, materiality: m })}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rollforward tab (account-level view)
// ---------------------------------------------------------------------------

function RollforwardTab() {
  const [entityId, setEntityId] = useState<string>('')
  const { data: entities } = useQuery({
    queryKey: ['entities-brief'],
    queryFn: async () => {
      const mod = await import('@/api/entities')
      return mod.entitiesApi.list()
    },
  })

  const { data: rows, isLoading } = useQuery({
    queryKey: ['adj-rollforward', entityId],
    queryFn: () => adjustmentWorkspaceApi.rollforward(Number(entityId)),
    enabled: !!entityId,
  })

  return (
    <div className="space-y-4" data-testid="rollforward-tab">
      <div className="flex items-center gap-3">
        <select
          data-testid="rollforward-entity-select"
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 min-w-[200px]"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
        >
          <option value="">Select entity…</option>
          {entities?.map?.((e: { id: number; name: string }) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingState message="Computing rollforward…" />}

      {rows && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" data-testid="rollforward-grid">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Account #</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Account Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">As Reported</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Adjustments</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Adjusted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-400">No data for selected entity.</td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.account_id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-slate-700">{row.account_number}</td>
                  <td className="px-3 py-2 text-slate-800">{row.account_name}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">{row.account_type}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-700">{fmtAmount(row.as_reported)}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className={cn(row.adjustments > 0 ? 'text-emerald-600' : row.adjustments < 0 ? 'text-rose-600' : 'text-slate-400')}>
                      {row.adjustments !== 0 ? `${row.adjustments > 0 ? '+' : ''}${fmtAmount(row.adjustments)}` : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900">{fmtAmount(row.adjusted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!entityId && (
        <div className="text-center text-slate-400 py-8 text-sm">Select an entity to view the adjustment rollforward.</div>
      )}
    </div>
  )
}
