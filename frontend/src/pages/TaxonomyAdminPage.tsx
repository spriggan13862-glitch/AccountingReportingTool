import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, ChevronDown, Plus, Pencil, X, Check, Download, Upload,
  RefreshCw, Copy, Trash2, BookOpen, AlertCircle, CheckCircle,
} from 'lucide-react'
import { reportingTaxonomyApi } from '@/api/reportingTaxonomy'
import type { TaxonomyLineCreate, TaxonomyLineUpdate } from '@/api/reportingTaxonomy'
import { reportingViewsApi } from '@/api/reportingViews'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { useToast } from '@/providers/ToastProvider'
import type { ReportingTaxonomyLine, ReportingTaxonomyView, TaxonomyImportPreview } from '@/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATEMENT_TYPES = [
  { value: 'balance_sheet',    label: 'Balance Sheet' },
  { value: 'income_statement', label: 'Income Statement' },
  { value: 'cash_flow',        label: 'Cash Flow' },
  { value: 'equity_statement', label: 'Equity Statement' },
]

const SECTIONS = [
  'assets', 'liabilities', 'equity', 'revenue', 'other_income',
  'cogs', 'expense', 'other_expense',
]

const SIGN_BEHAVIORS = [
  { value: 'positive', label: 'Positive (normal)' },
  { value: 'negative', label: 'Negative (inverted display)' },
  { value: 'contra',   label: 'Contra (subtracted from group)' },
]

const STMT_COLORS: Record<string, string> = {
  balance_sheet:    'bg-blue-50 text-blue-700 border-blue-200',
  income_statement: 'bg-green-50 text-green-700 border-green-200',
  cash_flow:        'bg-purple-50 text-purple-700 border-purple-200',
  equity_statement: 'bg-amber-50 text-amber-700 border-amber-200',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditState {
  lineId: number
  name: string
  short_name: string
  statement_type: string
  sort_order: number
  normal_balance: string
  sign_behavior: string
  is_subtotal: boolean
  active: boolean
  description: string
  sec_xbrl_tag: string
}

interface TaxonomyNode extends ReportingTaxonomyLine {
  children: TaxonomyNode[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTree(lines: ReportingTaxonomyLine[]): TaxonomyNode[] {
  const map = new Map<number, TaxonomyNode>()
  lines.forEach((l) => map.set(l.id, { ...l, children: [] }))
  const roots: TaxonomyNode[] = []
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  // Sort each level by sort_order
  const sortLevel = (nodes: TaxonomyNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order)
    nodes.forEach((n) => sortLevel(n.children))
  }
  sortLevel(roots)
  return roots
}

function flattenTree(nodes: TaxonomyNode[], result: TaxonomyNode[] = []): TaxonomyNode[] {
  nodes.forEach((n) => { result.push(n); flattenTree(n.children, result) })
  return result
}

// ---------------------------------------------------------------------------
// Line Row component
// ---------------------------------------------------------------------------

interface LineRowProps {
  node: TaxonomyNode
  allLines: ReportingTaxonomyLine[]
  editState: EditState | null
  onEdit: (node: TaxonomyNode) => void
  onSave: () => void
  onCancel: () => void
  onEditChange: (patch: Partial<EditState>) => void
  onDelete: (node: TaxonomyNode) => void
  isSaving: boolean
  depth: number
}

function TaxonomyLineRow({
  node, allLines, editState, onEdit, onSave, onCancel, onEditChange, onDelete, isSaving, depth,
}: LineRowProps) {
  const [expanded, setExpanded] = useState(true)
  const isEditing = editState?.lineId === node.id
  const hasChildren = node.children.length > 0

  return (
    <>
      <tr className={`hover:bg-gray-50 ${isEditing ? 'bg-indigo-50' : ''} ${!node.active ? 'opacity-50' : ''}`}>
        <td className="px-3 py-2 text-xs font-mono text-gray-500 w-36">
          {node.code}
        </td>
        <td className="px-3 py-2" style={{ paddingLeft: `${12 + depth * 20}px` }}>
          <div className="flex items-center gap-1">
            {hasChildren ? (
              <button type="button" onClick={() => setExpanded((v) => !v)} className="text-gray-400 hover:text-gray-600">
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            ) : (
              <span className="w-3 h-3 inline-block" />
            )}
            {isEditing ? (
              <input
                type="text"
                value={editState.name}
                onChange={(e) => onEditChange({ name: e.target.value })}
                className="w-48 border border-indigo-300 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            ) : (
              <span className={`text-sm ${node.is_subtotal ? 'font-semibold' : ''}`}>
                {node.name}
                {node.is_subtotal && <span className="ml-1 text-xs text-gray-400">(subtotal)</span>}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2">
          {node.statement_type && (
            <span className={`px-1.5 py-0.5 rounded border text-xs font-medium ${STMT_COLORS[node.statement_type] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
              {STATEMENT_TYPES.find((s) => s.value === node.statement_type)?.label ?? node.statement_type}
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-gray-500 w-16">
          {isEditing ? (
            <input
              type="number"
              value={editState.sort_order}
              onChange={(e) => onEditChange({ sort_order: Number(e.target.value) })}
              className="w-16 border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          ) : (
            node.sort_order
          )}
        </td>
        <td className="px-3 py-2 text-xs text-gray-500 w-16">
          {node.normal_balance && (
            <span className={`px-1.5 py-0.5 rounded text-xs ${node.normal_balance === 'debit' ? 'text-blue-600' : 'text-orange-600'}`}>
              {node.normal_balance}
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-gray-400 w-20">
          {node.sign_behavior !== 'positive' && (
            <span className="text-amber-600">{node.sign_behavior}</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-gray-400 max-w-[200px] truncate" title={node.description ?? ''}>
          {isEditing ? (
            <input
              type="text"
              value={editState.description}
              onChange={(e) => onEditChange({ description: e.target.value })}
              className="w-full border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          ) : (
            node.description || <span className="text-gray-300">—</span>
          )}
        </td>
        <td className="px-3 py-2 w-20 text-right">
          {isEditing ? (
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                disabled={isSaving}
                onClick={onSave}
                className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                title="Save"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600" title="Cancel">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => onEdit(node)}
                className="p-1 text-gray-300 hover:text-indigo-500"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {!node.system_defined && (
                <button
                  type="button"
                  onClick={() => onDelete(node)}
                  className="p-1 text-gray-300 hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
      {expanded && node.children.map((child) => (
        <TaxonomyLineRow
          key={child.id}
          node={child}
          allLines={allLines}
          editState={editState}
          onEdit={onEdit}
          onSave={onSave}
          onCancel={onCancel}
          onEditChange={onEditChange}
          onDelete={onDelete}
          isSaving={isSaving}
          depth={depth + 1}
        />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Create Line Modal
// ---------------------------------------------------------------------------

interface CreateLineModalProps {
  allLines: ReportingTaxonomyLine[]
  onClose: () => void
  onCreated: () => void
}

function CreateLineModal({ allLines, onClose, onCreated }: CreateLineModalProps) {
  const [form, setForm] = useState<TaxonomyLineCreate>({
    code: '', name: '', section: 'expense', statement_type: 'income_statement',
    sort_order: 900, is_subtotal: false, normal_balance: 'debit',
    sign_behavior: 'positive', active: true,
  })
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const createMutation = useMutation({
    mutationFn: () => reportingTaxonomyApi.create(form),
    onSuccess: () => {
      toast('Taxonomy line created', 'success')
      onCreated()
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Create Taxonomy Line</h2>
        {error && <ErrorBanner message={error} />}
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Code *</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. custom_revenue"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Display name"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Statement Type</label>
              <select
                value={form.statement_type ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, statement_type: e.target.value || null }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                {STATEMENT_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Section</label>
              <select
                value={form.section}
                onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Normal Balance</label>
              <select
                value={form.normal_balance ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, normal_balance: e.target.value || null }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">—</option>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sign Behavior</label>
              <select
                value={form.sign_behavior}
                onChange={(e) => setForm((f) => ({ ...f, sign_behavior: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                {SIGN_BEHAVIORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Parent Line</label>
            <select
              value={form.parent_id ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value ? Number(e.target.value) : null }))}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">— None (top level) —</option>
              {allLines.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input
              type="text"
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_subtotal}
                onChange={(e) => setForm((f) => ({ ...f, is_subtotal: e.target.checked }))}
                className="rounded"
              />
              Subtotal line
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="rounded"
              />
              Active
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!form.code || !form.name || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating…' : 'Create Line'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Import Panel
// ---------------------------------------------------------------------------

function TaxonomyImportPanel({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<TaxonomyImportPreview | null>(null)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const previewMutation = useMutation({
    mutationFn: () => reportingTaxonomyApi.previewImport(file!),
    onSuccess: (data) => { setPreview(data); setError(null) },
    onError: (err: Error) => setError(err.message),
  })

  const applyMutation = useMutation({
    mutationFn: () => reportingTaxonomyApi.applyImport(file!),
    onSuccess: (data) => {
      setResult({ created: data.created, updated: data.updated })
      toast(`Taxonomy updated: ${data.created} created, ${data.updated} updated`, 'success')
      onDone()
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
        <Upload className="w-4 h-4" /> Import Taxonomy CSV
      </h3>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="flex gap-2 items-center mb-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="px-3 py-1.5 text-xs border border-amber-400 rounded text-amber-800 hover:bg-amber-100"
        >
          {file ? file.name : 'Choose CSV file…'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(null) } }}
        />
        {file && !preview && (
          <button
            type="button"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending}
            className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
          >
            {previewMutation.isPending ? 'Parsing…' : 'Preview'}
          </button>
        )}
      </div>
      {preview && (
        <div className="text-xs text-amber-800 mb-3">
          <p className="font-medium mb-1">
            Preview: {preview.create_count} new lines, {preview.update_count} updates
            {preview.error_count > 0 && (
              <span className="text-red-600 ml-2">· {preview.error_count} errors</span>
            )}
          </p>
          {preview.errors.map((e, i) => (
            <p key={i} className="text-red-600 flex items-start gap-1"><AlertCircle className="w-3 h-3 mt-0.5" />{e}</p>
          ))}
          {preview.error_count === 0 && (
            <button
              type="button"
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              className="mt-2 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {applyMutation.isPending ? 'Applying…' : 'Apply Import'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reporting Views Panel
// ---------------------------------------------------------------------------

function ReportingViewsPanel() {
  const qc = useQueryClient()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')

  const { data: views = [] } = useQuery({
    queryKey: ['reporting-views'],
    queryFn: reportingViewsApi.list,
  })

  const createMutation = useMutation({
    mutationFn: () => reportingViewsApi.create({ code: newCode, name: newName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reporting-views'] })
      toast('View created', 'success')
      setCreating(false); setNewName(''); setNewCode('')
    },
  })

  const cloneMutation = useMutation({
    mutationFn: (id: number) => reportingViewsApi.clone(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reporting-views'] }); toast('View cloned', 'success') },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => reportingViewsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reporting-views'] }); toast('View deleted', 'success') },
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => reportingViewsApi.update(id, { is_default: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reporting-views'] }) },
  })

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Reporting Views</h3>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          <Plus className="w-3 h-3" /> New View
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Reporting views let the same account map differently by context (GAAP vs. management vs. lender).
      </p>
      {creating && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Code (e.g. custom_view)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <input
            type="text"
            placeholder="Display name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <button
            type="button"
            disabled={!newCode || !newName || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="px-2 py-1 text-xs bg-indigo-600 text-white rounded disabled:opacity-50"
          >
            Create
          </button>
          <button type="button" onClick={() => setCreating(false)} className="px-2 py-1 text-xs text-gray-500">
            Cancel
          </button>
        </div>
      )}
      <div className="space-y-1">
        {views.map((v) => (
          <div key={v.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-100 rounded">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-800">{v.name}</span>
              <span className="font-mono text-xs text-gray-400">{v.code}</span>
              {v.is_default && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-medium">Default</span>
              )}
              {v.is_system_defined && (
                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-xs">System</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!v.is_default && (
                <button
                  type="button"
                  onClick={() => setDefaultMutation.mutate(v.id)}
                  className="px-2 py-0.5 text-xs text-indigo-600 hover:text-indigo-800"
                  title="Set as default"
                >
                  Set default
                </button>
              )}
              <button
                type="button"
                onClick={() => cloneMutation.mutate(v.id)}
                className="p-1 text-gray-400 hover:text-indigo-500"
                title="Clone"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              {!v.is_system_defined && (
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(v.id)}
                  className="p-1 text-gray-400 hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function TaxonomyAdminPage() {
  const qc = useQueryClient()
  const toast = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [stmtFilter, setStmtFilter] = useState<string>('')
  const [showInactive, setShowInactive] = useState(false)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ['reporting-taxonomy', 'all'],
    queryFn: () => reportingTaxonomyApi.list(false),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TaxonomyLineUpdate }) =>
      reportingTaxonomyApi.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reporting-taxonomy'] })
      setEditState(null)
      toast('Taxonomy line updated', 'success')
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => reportingTaxonomyApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reporting-taxonomy'] })
      toast('Taxonomy line deleted', 'success')
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const reseedMutation = useMutation({
    mutationFn: reportingTaxonomyApi.reseed,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['reporting-taxonomy'] })
      toast(`Taxonomy re-seeded: ${data.total_lines} standard lines`, 'success')
    },
  })

  // Filter and build tree
  const filtered = lines.filter((l) => {
    if (!showInactive && !l.active) return false
    if (stmtFilter && l.statement_type !== stmtFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return l.code.includes(q) || l.name.toLowerCase().includes(q)
    }
    return true
  })

  const tree = buildTree(filtered)
  const flatFiltered = flattenTree(tree)

  function handleEdit(node: TaxonomyNode) {
    setEditState({
      lineId: node.id,
      name: node.name,
      short_name: node.short_name ?? '',
      statement_type: node.statement_type ?? '',
      sort_order: node.sort_order,
      normal_balance: node.normal_balance ?? '',
      sign_behavior: node.sign_behavior ?? 'positive',
      is_subtotal: node.is_subtotal,
      active: node.active,
      description: node.description ?? '',
      sec_xbrl_tag: node.sec_xbrl_tag ?? '',
    })
  }

  function handleSave() {
    if (!editState) return
    updateMutation.mutate({
      id: editState.lineId,
      patch: {
        name: editState.name || undefined,
        short_name: editState.short_name || null,
        statement_type: editState.statement_type || null,
        sort_order: editState.sort_order,
        normal_balance: editState.normal_balance || null,
        sign_behavior: editState.sign_behavior || null,
        is_subtotal: editState.is_subtotal,
        active: editState.active,
        description: editState.description || null,
        sec_xbrl_tag: editState.sec_xbrl_tag || null,
      },
    })
  }

  // Stats
  const statsByType = lines.reduce<Record<string, number>>((acc, l) => {
    if (!l.active) return acc
    const key = l.statement_type ?? l.section
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  return (
    <PageLayout
      title="Taxonomy Admin"
      subtitle="Manage the reporting taxonomy — the standard structure all COA accounts map to"
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5 text-sm text-blue-800">
        <p className="font-semibold flex items-center gap-1.5 mb-1"><BookOpen className="w-4 h-4" /> What is the reporting taxonomy?</p>
        <p className="text-xs text-blue-700 leading-relaxed">
          The reporting taxonomy defines the standardized financial statement structure (Balance Sheet, Income Statement).
          Every entity COA account maps to one taxonomy line. This drives how trial balances aggregate into
          financial reports across all entities and reporting views.
        </p>
      </div>

      {/* Stats chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(statsByType).map(([type, count]) => (
          <button
            key={type}
            type="button"
            onClick={() => setStmtFilter(stmtFilter === type ? '' : type)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border capitalize transition-colors ${
              stmtFilter === type
                ? (STMT_COLORS[type] ?? 'bg-gray-200 text-gray-700 border-gray-300')
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {STATEMENT_TYPES.find((s) => s.value === type)?.label ?? type} · {count}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search by code or name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show inactive
        </label>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          <Plus className="w-3.5 h-3.5" /> New Line
        </button>
        <button
          type="button"
          onClick={() => reportingTaxonomyApi.exportCsv()}
          className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
        <button
          type="button"
          onClick={() => setShowImport((v) => !v)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
        >
          <Upload className="w-3.5 h-3.5" /> Import CSV
        </button>
        <button
          type="button"
          onClick={() => reseedMutation.mutate()}
          disabled={reseedMutation.isPending}
          className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          title="Re-seed standard taxonomy lines"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Re-seed
        </button>
      </div>

      {/* Import panel */}
      {showImport && (
        <TaxonomyImportPanel onDone={() => {
          setShowImport(false)
          qc.invalidateQueries({ queryKey: ['reporting-taxonomy'] })
        }} />
      )}

      {/* Main taxonomy tree */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto mb-6">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left w-36">Code</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left w-36">Statement</th>
              <th className="px-3 py-2 text-left w-16">Order</th>
              <th className="px-3 py-2 text-left w-16">Balance</th>
              <th className="px-3 py-2 text-left w-20">Sign</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">Loading taxonomy…</td></tr>
            ) : flatFiltered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">No taxonomy lines match the current filters</td></tr>
            ) : (
              tree.map((node) => (
                <TaxonomyLineRow
                  key={node.id}
                  node={node}
                  allLines={lines}
                  editState={editState}
                  onEdit={handleEdit}
                  onSave={handleSave}
                  onCancel={() => setEditState(null)}
                  onEditChange={(patch) => setEditState((prev) => prev ? { ...prev, ...patch } : prev)}
                  onDelete={(n) => {
                    if (window.confirm(`Delete taxonomy line "${n.name}"?`)) {
                      deleteMutation.mutate(n.id)
                    }
                  }}
                  isSaving={updateMutation.isPending}
                  depth={0}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Reporting Views */}
      <ReportingViewsPanel />

      {/* Create modal */}
      {showCreate && (
        <CreateLineModal
          allLines={lines}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            qc.invalidateQueries({ queryKey: ['reporting-taxonomy'] })
          }}
        />
      )}
    </PageLayout>
  )
}
