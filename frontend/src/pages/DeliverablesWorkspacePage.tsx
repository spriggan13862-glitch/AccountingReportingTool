import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, Plus, Copy, Trash2, Edit2, Check, X, ChevronRight,
  FileText, BarChart2, FolderOpen, Link, Download, Archive,
  AlertCircle, CheckCircle, Clock, Users, RefreshCw, Search,
  FilePlus, MessageSquare, Eye,
} from 'lucide-react'

import { deliverableWorkspaceApi } from '@/api/deliverableWorkspace'
import type { DeliverablePackage, DeliverableMemo, DeliverablePackageItem } from '@/api/deliverableWorkspace'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { cn } from '@/utils/cn'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PACKAGE_TYPES: { value: string; label: string; color: string }[] = [
  { value: 'audit', label: 'Audit Package', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'advisor', label: 'Advisor Package', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { value: 'management', label: 'Management Package', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  { value: 'tax', label: 'Tax Package', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'qoe', label: 'QoE Package', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'close', label: 'Close Package', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 'lender', label: 'Lender Package', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { value: 'custom', label: 'Custom Package', color: 'bg-slate-50 text-slate-700 border-slate-200' },
]

const PACKAGE_STATUSES: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'draft', label: 'Draft', icon: Edit2 },
  { value: 'internal_review', label: 'Internal Review', icon: Eye },
  { value: 'client_review', label: 'Client Review', icon: Users },
  { value: 'finalized', label: 'Finalized', icon: CheckCircle },
  { value: 'archived', label: 'Archived', icon: Archive },
]

const MEMO_STATUSES = ['open', 'pending_client', 'resolved', 'na']

const ITEM_TYPES: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'journal_entry', label: 'Journal Entry', icon: FileText },
  { value: 'adjustment_set', label: 'Adjustment Set', icon: BarChart2 },
  { value: 'report', label: 'Report', icon: BarChart2 },
  { value: 'financial_statement', label: 'Financial Statement', icon: BarChart2 },
  { value: 'document', label: 'Document', icon: FolderOpen },
  { value: 'reconciliation', label: 'Reconciliation', icon: Link },
  { value: 'workpaper', label: 'Workpaper', icon: FileText },
]

const EXPORT_TEMPLATES = [
  { id: 'adj-listing', label: 'Adjustment Listing', description: 'All adjustments with status and impact', icon: FileText },
  { id: 'adj-rollforward', label: 'Adjustment Rollforward', description: 'Account-level Book vs Adjusted', icon: BarChart2 },
  { id: 'je-package', label: 'Journal Entry Package', description: 'Full JE detail with lines', icon: FileText },
  { id: 'financial-statements', label: 'Financial Statements', description: 'IS, BS, and Cash Flow', icon: BarChart2 },
  { id: 'variance-package', label: 'Variance Package', description: 'Accounts with material variances', icon: BarChart2 },
  { id: 'workpaper-package', label: 'Workpaper Package', description: 'All workpapers by type', icon: FolderOpen },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeConfig(pkg_type: string) {
  return PACKAGE_TYPES.find((t) => t.value === pkg_type) ?? PACKAGE_TYPES[PACKAGE_TYPES.length - 1]
}

function statusConfig(status: string) {
  return PACKAGE_STATUSES.find((s) => s.value === status) ?? PACKAGE_STATUSES[0]
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig(status)
  const Icon = cfg.icon
  const colorMap: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    internal_review: 'bg-amber-50 text-amber-700',
    client_review: 'bg-blue-50 text-blue-700',
    finalized: 'bg-emerald-50 text-emerald-700',
    archived: 'bg-slate-50 text-slate-400',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border', colorMap[status] ?? 'bg-slate-100 text-slate-600', 'border-current/20')}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Dashboard tab
// ---------------------------------------------------------------------------

function DashboardTab({
  onCreatePackage,
}: {
  onCreatePackage: (type: string) => void
}) {
  const { data: dashboard } = useQuery({
    queryKey: ['dw-dashboard'],
    queryFn: deliverableWorkspaceApi.getDashboard,
  })

  const metrics = [
    { label: 'Total Packages', value: dashboard?.total_packages ?? 0, color: 'text-slate-800', testId: 'metric-total' },
    { label: 'Draft', value: dashboard?.draft_count ?? 0, color: 'text-slate-500', testId: 'metric-draft' },
    { label: 'Internal Review', value: dashboard?.internal_review_count ?? 0, color: 'text-amber-600', testId: 'metric-internal' },
    { label: 'Client Review', value: dashboard?.client_review_count ?? 0, color: 'text-blue-600', testId: 'metric-client' },
    { label: 'Finalized', value: dashboard?.finalized_count ?? 0, color: 'text-emerald-600', testId: 'metric-finalized' },
  ]

  const quickActions = [
    { type: 'advisor', label: 'Advisor Package', icon: BarChart2 },
    { type: 'audit', label: 'Audit Package', icon: CheckCircle },
    { type: 'management', label: 'Management Package', icon: Users },
    { type: 'tax', label: 'Tax Package', icon: FileText },
  ]

  return (
    <div className="space-y-6" data-testid="dashboard-tab">
      {/* Metrics */}
      <div className="grid grid-cols-5 gap-3" data-testid="dashboard-metrics">
        {metrics.map((m) => (
          <div key={m.label} className="bg-white border border-slate-200 rounded-lg px-4 py-3" data-testid={m.testId}>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{m.label}</div>
            <div className={cn('text-2xl font-bold mt-1 tabular-nums', m.color)}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-slate-700 mb-3">Quick Actions — Create Package</h3>
        <div className="grid grid-cols-4 gap-3" data-testid="quick-actions">
          {quickActions.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              data-testid={`quick-create-${type}`}
              onClick={() => onCreatePackage(type)}
              className="flex flex-col items-center gap-2 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-indigo-300 transition-colors text-center"
            >
              <Icon className="w-5 h-5 text-indigo-500" />
              <span className="text-xs font-medium text-slate-700">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Package type legend */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-slate-700 mb-3">Package Types</h3>
        <div className="grid grid-cols-4 gap-2">
          {PACKAGE_TYPES.map((t) => (
            <div key={t.value} className={cn('px-3 py-2 rounded-lg border text-xs font-medium', t.color)}>
              {t.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create/rename package form
// ---------------------------------------------------------------------------

function PackageForm({
  initial,
  onSave,
  onCancel,
  isLoading,
}: {
  initial?: Partial<DeliverablePackage>
  onSave: (name: string, type: string, description: string, owner: string) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState(initial?.package_type ?? 'custom')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [owner, setOwner] = useState(initial?.owner ?? '')

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3" data-testid="package-form">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Package Name *</label>
          <input
            data-testid="pkg-name-input"
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Q1 2024 Audit Package"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Type</label>
          <select
            data-testid="pkg-type-select"
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {PACKAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Owner</label>
          <input
            data-testid="pkg-owner-input"
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Advisor name"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Description</label>
          <input
            data-testid="pkg-description-input"
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional notes"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          data-testid="pkg-save-btn"
          onClick={() => onSave(name, type, description, owner)}
          disabled={!name.trim() || isLoading}
          className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {isLoading ? 'Saving…' : 'Save Package'}
        </button>
        <button
          data-testid="pkg-cancel-btn"
          onClick={onCancel}
          className="px-4 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Package detail panel — items and memos
// ---------------------------------------------------------------------------

function PackageDetail({
  pkg,
  onClose,
  onStatusChange,
}: {
  pkg: DeliverablePackage
  onClose: () => void
  onStatusChange: (status: string) => void
}) {
  const qc = useQueryClient()
  const [activeSection, setActiveSection] = useState<'contents' | 'memos'>('contents')
  const [addingItem, setAddingItem] = useState(false)
  const [newItemType, setNewItemType] = useState('journal_entry')
  const [newItemRef, setNewItemRef] = useState('')
  const [newItemLabel, setNewItemLabel] = useState('')
  const [addingMemo, setAddingMemo] = useState(false)
  const [newMemoIssue, setNewMemoIssue] = useState('')
  const [newMemoObs, setNewMemoObs] = useState('')
  const [newMemoRec, setNewMemoRec] = useState('')

  const { data: items } = useQuery({
    queryKey: ['dw-items', pkg.id],
    queryFn: () => deliverableWorkspaceApi.listItems(pkg.id),
  })

  const { data: memos } = useQuery({
    queryKey: ['dw-memos', pkg.id],
    queryFn: () => deliverableWorkspaceApi.listMemos(pkg.id),
  })

  const addItem = useMutation({
    mutationFn: () => deliverableWorkspaceApi.addItem(pkg.id, { item_type: newItemType, item_ref: newItemRef, item_label: newItemLabel || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dw-items', pkg.id] })
      qc.invalidateQueries({ queryKey: ['dw-packages'] })
      setAddingItem(false)
      setNewItemRef('')
      setNewItemLabel('')
    },
  })

  const removeItem = useMutation({
    mutationFn: (itemId: number) => deliverableWorkspaceApi.removeItem(pkg.id, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dw-items', pkg.id] })
      qc.invalidateQueries({ queryKey: ['dw-packages'] })
    },
  })

  const createMemo = useMutation({
    mutationFn: () => deliverableWorkspaceApi.createMemo(pkg.id, { issue: newMemoIssue || undefined, observation: newMemoObs || undefined, recommendation: newMemoRec || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dw-memos', pkg.id] })
      qc.invalidateQueries({ queryKey: ['dw-packages'] })
      setAddingMemo(false)
      setNewMemoIssue('')
      setNewMemoObs('')
      setNewMemoRec('')
    },
  })

  const deleteMemo = useMutation({
    mutationFn: (memoId: number) => deliverableWorkspaceApi.deleteMemo(pkg.id, memoId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dw-memos', pkg.id] })
      qc.invalidateQueries({ queryKey: ['dw-packages'] })
    },
  })

  const tc = typeConfig(pkg.package_type)

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-white border-l border-slate-200 flex flex-col shadow-xl z-40" data-testid="package-detail-panel">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold border', tc.color)}>{tc.label}</span>
            <StatusBadge status={pkg.status} />
          </div>
          <h2 className="text-sm font-semibold text-slate-900 truncate">{pkg.name}</h2>
          {pkg.owner && <p className="text-[11px] text-slate-400 mt-0.5">Owner: {pkg.owner}</p>}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Status change */}
      <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
        <span className="text-[10px] text-slate-400 font-semibold uppercase">Status:</span>
        <select
          data-testid="detail-status-select"
          className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          value={pkg.status}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          {PACKAGE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <span className="ml-auto text-[10px] text-slate-400">{fmtDate(pkg.created_at)}</span>
      </div>

      {/* Section toggle */}
      <div className="flex border-b border-slate-200">
        {([
          { id: 'contents', label: `Contents (${items?.length ?? 0})`, icon: FolderOpen },
          { id: 'memos', label: `Memos (${memos?.length ?? 0})`, icon: MessageSquare },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            data-testid={`detail-section-${id}`}
            onClick={() => setActiveSection(id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
              activeSection === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* Contents section */}
        {activeSection === 'contents' && (
          <div className="space-y-2" data-testid="contents-section">
            {items?.map((item) => {
              const it = ITEM_TYPES.find((t) => t.value === item.item_type)
              const Icon = it?.icon ?? FileText
              return (
                <div key={item.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-700 truncate">{item.item_label || item.item_ref}</div>
                    <div className="text-[10px] text-slate-400">{it?.label ?? item.item_type} · {item.item_ref}</div>
                  </div>
                  <button
                    data-testid={`remove-item-${item.id}`}
                    onClick={() => removeItem.mutate(item.id)}
                    className="p-1 rounded hover:bg-rose-50 hover:text-rose-500 text-slate-300 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )
            })}

            {items?.length === 0 && !addingItem && (
              <p className="text-xs text-slate-400 text-center py-4">No items yet. Add references below.</p>
            )}

            {addingItem && (
              <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3" data-testid="add-item-form">
                <select
                  data-testid="item-type-select"
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none"
                  value={newItemType}
                  onChange={(e) => setNewItemType(e.target.value)}
                >
                  {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input
                  data-testid="item-ref-input"
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none"
                  placeholder="Reference ID (e.g. JE-001, RPT-42)"
                  value={newItemRef}
                  onChange={(e) => setNewItemRef(e.target.value)}
                />
                <input
                  data-testid="item-label-input"
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none"
                  placeholder="Label (optional)"
                  value={newItemLabel}
                  onChange={(e) => setNewItemLabel(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    data-testid="add-item-save"
                    onClick={() => addItem.mutate()}
                    disabled={!newItemRef.trim() || addItem.isPending}
                    className="px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button data-testid="add-item-cancel" onClick={() => setAddingItem(false)} className="px-3 py-1 text-xs border rounded hover:bg-slate-50">Cancel</button>
                </div>
              </div>
            )}

            {!addingItem && (
              <button
                data-testid="add-item-btn"
                onClick={() => setAddingItem(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-indigo-600 font-semibold border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            )}
          </div>
        )}

        {/* Memos section */}
        {activeSection === 'memos' && (
          <div className="space-y-3" data-testid="memos-section">
            {memos?.map((memo) => (
              <div key={memo.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5" data-testid={`memo-${memo.id}`}>
                <div className="flex items-center justify-between">
                  <span className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                    memo.status === 'resolved' ? 'bg-emerald-50 text-emerald-600' :
                    memo.status === 'pending_client' ? 'bg-amber-50 text-amber-600' :
                    'bg-slate-100 text-slate-500',
                  )}>
                    {memo.status.replace('_', ' ')}
                  </span>
                  <button
                    data-testid={`delete-memo-${memo.id}`}
                    onClick={() => deleteMemo.mutate(memo.id)}
                    className="p-0.5 rounded hover:bg-rose-50 hover:text-rose-400 text-slate-300"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                {memo.issue && <div><span className="text-[10px] font-semibold text-slate-400 uppercase">Issue:</span> <span className="text-xs text-slate-700">{memo.issue}</span></div>}
                {memo.observation && <div><span className="text-[10px] font-semibold text-slate-400 uppercase">Observation:</span> <span className="text-xs text-slate-700">{memo.observation}</span></div>}
                {memo.recommendation && <div><span className="text-[10px] font-semibold text-slate-400 uppercase">Recommendation:</span> <span className="text-xs text-slate-700">{memo.recommendation}</span></div>}
                {memo.client_response && <div><span className="text-[10px] font-semibold text-slate-400 uppercase">Client Response:</span> <span className="text-xs text-slate-700">{memo.client_response}</span></div>}
              </div>
            ))}

            {memos?.length === 0 && !addingMemo && (
              <p className="text-xs text-slate-400 text-center py-4">No memos yet.</p>
            )}

            {addingMemo && (
              <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3" data-testid="add-memo-form">
                <textarea
                  data-testid="memo-issue-input"
                  rows={2}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 resize-none focus:outline-none"
                  placeholder="Issue"
                  value={newMemoIssue}
                  onChange={(e) => setNewMemoIssue(e.target.value)}
                />
                <textarea
                  data-testid="memo-obs-input"
                  rows={2}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 resize-none focus:outline-none"
                  placeholder="Observation"
                  value={newMemoObs}
                  onChange={(e) => setNewMemoObs(e.target.value)}
                />
                <textarea
                  data-testid="memo-rec-input"
                  rows={2}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 resize-none focus:outline-none"
                  placeholder="Recommendation"
                  value={newMemoRec}
                  onChange={(e) => setNewMemoRec(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    data-testid="add-memo-save"
                    onClick={() => createMemo.mutate()}
                    disabled={(!newMemoIssue && !newMemoObs && !newMemoRec) || createMemo.isPending}
                    className="px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Add Memo
                  </button>
                  <button data-testid="add-memo-cancel" onClick={() => setAddingMemo(false)} className="px-3 py-1 text-xs border rounded hover:bg-slate-50">Cancel</button>
                </div>
              </div>
            )}

            {!addingMemo && (
              <button
                data-testid="add-memo-btn"
                onClick={() => setAddingMemo(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-indigo-600 font-semibold border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Memo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Export footer */}
      <div className="border-t border-slate-200 p-4">
        <a
          data-testid="export-package-btn"
          href={deliverableWorkspaceApi.exportPackageExcel(pkg.id)}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export Package (Excel)
        </a>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Packages tab
// ---------------------------------------------------------------------------

function PackagesTab({
  onSelect,
  selectedId,
}: {
  onSelect: (pkg: DeliverablePackage | null) => void
  selectedId: number | null
}) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [defaultType, setDefaultType] = useState('custom')

  const { data: packages, isLoading } = useQuery({
    queryKey: ['dw-packages'],
    queryFn: () => deliverableWorkspaceApi.listPackages(),
  })

  const createMut = useMutation({
    mutationFn: (args: { name: string; type: string; desc: string; owner: string }) =>
      deliverableWorkspaceApi.createPackage({ name: args.name, package_type: args.type, description: args.desc || undefined, owner: args.owner || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dw-packages'] })
      qc.invalidateQueries({ queryKey: ['dw-dashboard'] })
      setCreating(false)
    },
  })

  const updateMut = useMutation({
    mutationFn: (args: { id: number; name: string; type: string; desc: string; owner: string }) =>
      deliverableWorkspaceApi.updatePackage(args.id, { name: args.name, package_type: args.type, description: args.desc || undefined, owner: args.owner || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dw-packages'] })
      setEditingId(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: deliverableWorkspaceApi.deletePackage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dw-packages'] })
      qc.invalidateQueries({ queryKey: ['dw-dashboard'] })
      onSelect(null)
    },
  })

  const cloneMut = useMutation({
    mutationFn: deliverableWorkspaceApi.clonePackage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dw-packages'] })
      qc.invalidateQueries({ queryKey: ['dw-dashboard'] })
    },
  })

  const statusChangeMut = useMutation({
    mutationFn: (args: { id: number; status: string }) =>
      deliverableWorkspaceApi.updatePackage(args.id, { status: args.status }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['dw-packages'] })
      onSelect(updated)
    },
  })

  const filtered = useMemo(() => {
    let rows = packages ?? []
    if (statusFilter) rows = rows.filter((p) => p.status === statusFilter)
    if (typeFilter) rows = rows.filter((p) => p.package_type === typeFilter)
    if (search) rows = rows.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    return rows
  }, [packages, statusFilter, typeFilter, search])

  function startCreate(type = 'custom') {
    setDefaultType(type)
    setCreating(true)
    setEditingId(null)
  }

  return (
    <div className="space-y-3" data-testid="packages-tab">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            data-testid="pkg-search"
            className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="Search packages…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          data-testid="pkg-status-filter"
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          {PACKAGE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          data-testid="pkg-type-filter"
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          {PACKAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button
          data-testid="create-package-btn"
          onClick={() => startCreate()}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Package
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <PackageForm
          initial={{ package_type: defaultType }}
          onSave={(name, type, desc, owner) => createMut.mutate({ name, type, desc, owner })}
          onCancel={() => setCreating(false)}
          isLoading={createMut.isPending}
        />
      )}

      {/* Package list */}
      {isLoading ? (
        <div className="py-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />Loading packages…
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" data-testid="packages-list">
          {filtered.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-sm">
              <Package className="w-8 h-8 mx-auto mb-2 text-slate-200" />
              <p>No packages yet. Create your first package above.</p>
            </div>
          )}
          {filtered.map((pkg, idx) => {
            const tc = typeConfig(pkg.package_type)
            const isEditing = editingId === pkg.id
            return (
              <div key={pkg.id}>
                {idx > 0 && <div className="border-t border-slate-100" />}
                {isEditing ? (
                  <div className="p-3">
                    <PackageForm
                      initial={pkg}
                      onSave={(name, type, desc, owner) => updateMut.mutate({ id: pkg.id, name, type, desc, owner })}
                      onCancel={() => setEditingId(null)}
                      isLoading={updateMut.isPending}
                    />
                  </div>
                ) : (
                  <div
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors',
                      selectedId === pkg.id && 'bg-indigo-50',
                    )}
                    data-testid={`package-row-${pkg.id}`}
                    onClick={() => onSelect(selectedId === pkg.id ? null : pkg)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold border', tc.color)}>{tc.label}</span>
                        <StatusBadge status={pkg.status} />
                        {pkg.item_count > 0 && (
                          <span className="text-[10px] text-slate-400">{pkg.item_count} item{pkg.item_count !== 1 ? 's' : ''}</span>
                        )}
                        {pkg.memo_count > 0 && (
                          <span className="text-[10px] text-slate-400">{pkg.memo_count} memo{pkg.memo_count !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-slate-800 truncate">{pkg.name}</div>
                      {(pkg.owner || pkg.description) && (
                        <div className="text-[11px] text-slate-400 truncate">{[pkg.owner, pkg.description].filter(Boolean).join(' · ')}</div>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 shrink-0">{fmtDate(pkg.created_at)}</div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        data-testid={`edit-pkg-${pkg.id}`}
                        onClick={() => setEditingId(pkg.id)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400"
                        title="Rename / edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        data-testid={`clone-pkg-${pkg.id}`}
                        onClick={() => cloneMut.mutate(pkg.id)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400"
                        title="Clone"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        data-testid={`delete-pkg-${pkg.id}`}
                        onClick={() => deleteMut.mutate(pkg.id)}
                        className="p-1 rounded hover:bg-rose-50 hover:text-rose-400 text-slate-400"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <ChevronRight className={cn('w-4 h-4 text-slate-300 shrink-0 transition-transform', selectedId === pkg.id && 'rotate-90')} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export Center tab
// ---------------------------------------------------------------------------

function ExportCenterTab() {
  return (
    <div className="space-y-4" data-testid="export-center-tab">
      <p className="text-xs text-slate-500">Download engagement outputs as Excel workbooks. All exports reflect current data — no snapshot.</p>

      <div className="grid grid-cols-2 gap-3">
        {EXPORT_TEMPLATES.map((tpl) => {
          const Icon = tpl.icon
          return (
            <div key={tpl.id} className="bg-white border border-slate-200 rounded-lg p-4 flex gap-3 items-start" data-testid={`export-template-${tpl.id}`}>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-800">{tpl.label}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{tpl.description}</div>
              </div>
              <a
                data-testid={`download-${tpl.id}`}
                href={tpl.id === 'adj-listing' ? deliverableWorkspaceApi.exportAdjustmentListingExcel() : '#'}
                target={tpl.id === 'adj-listing' ? '_blank' : undefined}
                rel="noreferrer"
                onClick={tpl.id !== 'adj-listing' ? (e) => e.preventDefault() : undefined}
                className={cn(
                  'flex items-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-colors shrink-0',
                  tpl.id === 'adj-listing'
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed',
                )}
                title={tpl.id !== 'adj-listing' ? 'Coming soon' : undefined}
              >
                <Download className="w-3 h-3" />
                Excel
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type WorkspaceTab = 'dashboard' | 'packages' | 'exports'

const TABS: { id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Deliverables Dashboard', icon: BarChart2 },
  { id: 'packages', label: 'Package Center', icon: Package },
  { id: 'exports', label: 'Export Center', icon: Download },
]

export function DeliverablesWorkspacePage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard')
  const [selectedPkg, setSelectedPkg] = useState<DeliverablePackage | null>(null)

  function handleCreateFromDashboard(type: string) {
    setActiveTab('packages')
  }

  function handleStatusChange(status: string) {
    if (!selectedPkg) return
    deliverableWorkspaceApi.updatePackage(selectedPkg.id, { status }).then((updated) => {
      setSelectedPkg(updated)
      qc.invalidateQueries({ queryKey: ['dw-packages'] })
      qc.invalidateQueries({ queryKey: ['dw-dashboard'] })
    })
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <PageLayout
          title="Deliverables Workspace"
          subtitle="Assemble, manage, and export engagement outputs — packages, memos, and reports in one place"
          breadcrumb={
            <Breadcrumb items={[
              { label: 'Deliverables', href: '/deliverables' },
              { label: 'Workspace' },
            ]} />
          }
          actions={
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
              Single source of truth for engagement outputs
            </span>
          }
        >
          {/* Tabs */}
          <div className="flex items-center gap-0 border-b border-slate-200" data-testid="workspace-tabs">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                data-testid={`tab-${id}`}
                onClick={() => setActiveTab(id)}
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

          {/* Tab content */}
          {activeTab === 'dashboard' && (
            <DashboardTab onCreatePackage={handleCreateFromDashboard} />
          )}
          {activeTab === 'packages' && (
            <PackagesTab
              selectedId={selectedPkg?.id ?? null}
              onSelect={(pkg) => setSelectedPkg(pkg)}
            />
          )}
          {activeTab === 'exports' && <ExportCenterTab />}

        </PageLayout>
      </div>

      {/* Package detail panel */}
      {selectedPkg && activeTab === 'packages' && (
        <PackageDetail
          pkg={selectedPkg}
          onClose={() => setSelectedPkg(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
