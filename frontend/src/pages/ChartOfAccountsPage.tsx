import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, ChevronDown, Upload, Pencil, X, Check, Plus,
  MoreVertical, ArrowDownToLine, ArrowUpToLine, ArrowLeftToLine, Search,
  GripVertical, Undo2, Redo2, ChevronsDownUp, ChevronsUpDown, ArrowRightToLine,
} from 'lucide-react'
import { accountsApi } from '@/api/accounts'
import type { AccountUpdate, AccountReparentResult } from '@/api/accounts'
import { reportingTaxonomyApi } from '@/api/reportingTaxonomy'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { CreateAccountModal } from '@/components/ui/CreateAccountModal'
import { useToast } from '@/providers/ToastProvider'
import type { Account, AccountNode, ReportingTaxonomyLine } from '@/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, string> = {
  asset:     'bg-blue-50 text-blue-700 border-blue-200',
  liability: 'bg-orange-50 text-orange-700 border-orange-200',
  equity:    'bg-purple-50 text-purple-700 border-purple-200',
  revenue:   'bg-green-50 text-green-700 border-green-200',
  expense:   'bg-red-50 text-red-700 border-red-200',
}

const STATUS_COLORS: Record<string, string> = {
  active:     'text-emerald-600',
  inactive:   'text-gray-400',
  archived:   'text-gray-300 line-through',
  deprecated: 'text-amber-500',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** DFS flat list of all nodes in display order */
function buildFlatOrder(nodes: AccountNode[]): AccountNode[] {
  const result: AccountNode[] = []
  for (const node of nodes) {
    result.push(node)
    result.push(...buildFlatOrder(node.children))
  }
  return result
}

/** All descendant IDs of a node (used to prevent drag-into-own-subtree) */
function buildSubtreeIds(node: AccountNode): Set<number> {
  const ids = new Set<number>([node.id])
  for (const child of node.children) {
    buildSubtreeIds(child).forEach((id) => ids.add(id))
  }
  return ids
}

function reparentToast(
  r: { account_number: string; account_name: string; new_parent_number: string | null; new_parent_name: string | null }
): string {
  const acct = `${r.account_number} ${r.account_name}`
  if (!r.new_parent_number) return `${acct} moved to root (no parent)`
  return `${acct} moved under ${r.new_parent_number} ${r.new_parent_name}`
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditState {
  accountId: number
  detail_type: string
  account_status: string
  reporting_taxonomy_line_id: number | ''
  parent_account_id: number | ''
}

type HierarchyAction = 'make_parent' | 'make_child' | 'outdent' | 'move_to' | 'move_to_child'

interface ContextMenuState {
  accountId: number
  x: number
  y: number
}

interface UndoEntry {
  accountId: number
  oldParentId: number | null
  newParentId: number | null
  description: string
}

type DropPosition = 'before' | 'inside' | 'after'

interface DropTarget {
  nodeId: number
  position: DropPosition
}

// ---------------------------------------------------------------------------
// Hierarchy context (shared state for drag, collapse, highlight)
// ---------------------------------------------------------------------------

interface HierarchyCtxValue {
  dragNodeId: number | null
  dropTarget: DropTarget | null
  collapsedIds: Set<number>
  highlightIds: Set<number>
  onDragStart: (e: React.DragEvent<HTMLTableRowElement>, nodeId: number, subtreeIds: Set<number>) => void
  onDragOver: (e: React.DragEvent<HTMLTableRowElement>, nodeId: number) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent<HTMLTableRowElement>, nodeId: number) => void
  onToggleCollapsed: (nodeId: number) => void
}

const HierarchyCtx = createContext<HierarchyCtxValue | null>(null)

function useHierarchyCtx(): HierarchyCtxValue {
  const ctx = useContext(HierarchyCtx)
  if (!ctx) throw new Error('HierarchyCtx required')
  return ctx
}

// ---------------------------------------------------------------------------
// MoveToModal — shared for Move To Parent and Move To Child
// ---------------------------------------------------------------------------

interface MoveToModalProps {
  mode: 'parent' | 'child'
  account: AccountNode
  flatAccounts: Account[]
  onSelect: (targetId: number | null) => void
  onClose: () => void
}

function MoveToModal({ mode, account, flatAccounts, onSelect, onClose }: MoveToModalProps) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const filtered = flatAccounts.filter(
    (a) =>
      a.id !== account.id &&
      (a.account_number.toLowerCase().includes(search.toLowerCase()) ||
        a.account_name.toLowerCase().includes(search.toLowerCase()))
  )

  const isParent = mode === 'parent'
  const title = isParent
    ? `Move "${account.account_number} ${account.account_name}" under…`
    : `Make "${account.account_number} ${account.account_name}" parent of…`

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      data-testid={isParent ? 'move-to-modal' : 'move-to-child-modal'}
    >
      <div className="bg-white rounded-lg shadow-xl w-[480px] max-h-[560px] flex flex-col">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-sm text-gray-800 mb-1">{title}</h3>
          {!isParent && (
            <p className="text-xs text-gray-500">The selected account will become a child of {account.account_number} {account.account_name}.</p>
          )}
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by account number or name…"
              className="w-full border border-gray-300 rounded pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              data-testid={isParent ? 'move-to-search' : 'move-to-child-search'}
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 py-1">
          {isParent && (
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-400 border-b border-gray-100"
              onClick={() => { onSelect(null); onClose() }}
              data-testid="move-to-root"
            >
              — Root (no parent) —
            </button>
          )}
          {filtered.length === 0 && search && (
            <p className="px-4 py-3 text-xs text-gray-400">No accounts match "{search}"</p>
          )}
          {filtered.map((a) => (
            <button
              key={a.id}
              className="w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2"
              onClick={() => { onSelect(a.id); onClose() }}
              data-testid={isParent ? `move-to-account-${a.id}` : `move-to-child-account-${a.id}`}
            >
              <span className="text-gray-400 font-mono text-xs w-16 shrink-0">{a.account_number}</span>
              <span className="text-gray-800">{a.account_name}</span>
            </button>
          ))}
        </div>
        <div className="p-3 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 border rounded hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Floating context menu
// ---------------------------------------------------------------------------

interface ContextMenuProps {
  pos: ContextMenuState
  account: AccountNode
  flatOrder: AccountNode[]
  onAction: (action: HierarchyAction) => void
  onClose: () => void
}

function HierarchyContextMenu({ pos, account, flatOrder, onAction, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [onClose])

  const flatIndex = flatOrder.findIndex((n) => n.id === account.id)
  const prevNode = flatIndex > 0 ? flatOrder[flatIndex - 1] : null
  const nextNode = flatIndex < flatOrder.length - 1 ? flatOrder[flatIndex + 1] : null
  const hasParent = account.parent_account_id !== null && account.parent_account_id !== undefined
  const childCount = account.children?.length ?? 0

  const item = (
    icon: React.ReactNode,
    label: string,
    subLabel: string | null,
    onClick: () => void,
    disabled = false,
    testId?: string
  ) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => { if (!disabled) { onClick(); onClose() } }}
      className={`w-full text-left px-3 py-2 flex items-start gap-2.5 text-sm ${
        disabled
          ? 'text-gray-300 cursor-not-allowed'
          : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700'
      }`}
      data-testid={testId}
    >
      <span className="mt-0.5 shrink-0 opacity-60">{icon}</span>
      <div>
        <div className="font-medium leading-tight">{label}</div>
        {subLabel && <div className="text-xs text-gray-400 mt-0.5 leading-tight">{subLabel}</div>}
      </div>
    </button>
  )

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-64 py-1 text-sm"
      style={{ top: pos.y, left: pos.x }}
      data-testid="hierarchy-context-menu"
    >
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
        {account.account_number} {account.account_name}
        {childCount > 0 && <span className="ml-1.5 text-indigo-400">({childCount} children)</span>}
      </div>

      {item(
        <ArrowDownToLine className="w-3.5 h-3.5" />,
        'Make Parent',
        nextNode ? `→ parent of ${nextNode.account_number} ${nextNode.account_name}` : null,
        () => onAction('make_parent'),
        !nextNode,
        'action-make-parent',
      )}

      {item(
        <ArrowUpToLine className="w-3.5 h-3.5" />,
        'Make Child',
        prevNode ? `→ child of ${prevNode.account_number} ${prevNode.account_name}` : null,
        () => onAction('make_child'),
        !prevNode || prevNode.id === account.parent_account_id,
        'action-make-child',
      )}

      {item(
        <ArrowLeftToLine className="w-3.5 h-3.5" />,
        'Outdent / Remove Parent',
        hasParent ? 'Move to root level' : 'Already at root',
        () => onAction('outdent'),
        !hasParent,
        'action-outdent',
      )}

      <div className="border-t border-gray-100 mt-1 pt-1">
        {item(
          <Search className="w-3.5 h-3.5" />,
          'Move To Parent…',
          'Place under any account',
          () => onAction('move_to'),
          false,
          'action-move-to',
        )}
        {item(
          <ArrowRightToLine className="w-3.5 h-3.5" />,
          'Move To Child…',
          'Adopt any account as child',
          () => onAction('move_to_child'),
          false,
          'action-move-to-child',
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AccountRow
// ---------------------------------------------------------------------------

interface AccountRowProps {
  node: AccountNode
  depth: number
  taxonomyLines: ReportingTaxonomyLine[]
  flatAccounts: Account[]
  editState: EditState | null
  onEdit: (node: AccountNode) => void
  onSave: () => void
  onCancel: () => void
  onEditChange: (patch: Partial<EditState>) => void
  isSaving: boolean
  onOpenMenu: (accountId: number, x: number, y: number) => void
}

function AccountRow({
  node,
  depth,
  taxonomyLines,
  flatAccounts,
  editState,
  onEdit,
  onSave,
  onCancel,
  onEditChange,
  isSaving,
  onOpenMenu,
}: AccountRowProps) {
  const {
    dragNodeId,
    dropTarget,
    collapsedIds,
    highlightIds,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDrop,
    onToggleCollapsed,
  } = useHierarchyCtx()

  const collapsed = collapsedIds.has(node.id)
  const isEditing = editState?.accountId === node.id
  const hasChildren = node.children.length > 0
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const isDragging = dragNodeId === node.id
  const isDropTarget = dropTarget?.nodeId === node.id
  const dropPos = isDropTarget ? dropTarget!.position : null
  const isHighlighted = highlightIds.has(node.id)

  const taxonomyName = taxonomyLines.find((t) => t.id === node.reporting_taxonomy_line_id)?.name

  function openMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = Math.min(rect.right, window.innerWidth - 270)
    const y = Math.min(rect.bottom + 4, window.innerHeight - 300)
    onOpenMenu(node.id, x, y)
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    const x = Math.min(e.clientX, window.innerWidth - 270)
    const y = Math.min(e.clientY, window.innerHeight - 300)
    onOpenMenu(node.id, x, y)
  }

  const rowClass = [
    'hover:bg-gray-50 transition-colors',
    isEditing ? 'bg-indigo-50' : '',
    isHighlighted ? 'bg-amber-50 ring-1 ring-inset ring-amber-300' : '',
    isDragging ? 'opacity-40' : '',
    dropPos === 'inside' ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' : '',
    dropPos === 'before' ? 'border-t-2 border-indigo-500' : '',
    dropPos === 'after' ? 'border-b-2 border-indigo-500' : '',
  ].filter(Boolean).join(' ')

  const subtreeIdsRef = useRef<Set<number>>(new Set())
  // Compute lazily on drag start
  function handleDragStart(e: React.DragEvent<HTMLTableRowElement>) {
    subtreeIdsRef.current = buildSubtreeIds(node)
    onDragStart(e, node.id, subtreeIdsRef.current)
  }

  return (
    <>
      <tr
        className={rowClass}
        draggable
        onDragStart={handleDragStart}
        onDragOver={(e) => onDragOver(e, node.id)}
        onDragEnd={onDragEnd}
        onDrop={(e) => onDrop(e, node.id)}
        onContextMenu={onContextMenu}
        data-testid={`account-row-${node.id}`}
      >
        {/* Drag handle */}
        <td className="pl-2 pr-0 py-2 w-6 text-gray-200 hover:text-gray-400 cursor-grab" title="Drag to reparent">
          <GripVertical className="w-3 h-3" />
        </td>

        {/* Acct # */}
        <td className="px-3 py-2 text-xs text-gray-400 font-mono w-24">
          {node.account_number || '—'}
        </td>

        {/* Account name with indent guides */}
        <td className="px-3 py-2" style={{ paddingLeft: `${12 + depth * 20}px` }}>
          <div className="flex items-center gap-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggleCollapsed(node.id)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                title={collapsed ? 'Expand' : 'Collapse'}
              >
                {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            ) : (
              <span className="w-3 h-3 flex-shrink-0 inline-block" />
            )}
            <span className={`text-sm ${STATUS_COLORS[node.account_status] ?? 'text-gray-800'}`}>
              {node.account_name}
            </span>
            {hasChildren && (
              <span className="text-xs text-gray-300 ml-1">({node.children.length})</span>
            )}
          </div>
        </td>

        {/* Type */}
        <td className="px-3 py-2">
          <span className={`px-1.5 py-0.5 rounded border text-xs font-medium capitalize ${TYPE_COLORS[node.account_type] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            {node.account_type}
          </span>
        </td>

        {/* Detail type */}
        <td className="px-3 py-2 text-xs text-gray-500">
          {isEditing ? (
            <input
              type="text"
              value={editState.detail_type}
              onChange={(e) => onEditChange({ detail_type: e.target.value })}
              className="w-36 border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          ) : (
            node.detail_type || <span className="text-gray-300">—</span>
          )}
        </td>

        {/* Status */}
        <td className="px-3 py-2">
          {isEditing ? (
            <select
              value={editState.account_status}
              onChange={(e) => onEditChange({ account_status: e.target.value })}
              className="border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="archived">archived</option>
              <option value="deprecated">deprecated</option>
            </select>
          ) : (
            <span className={`text-xs capitalize ${STATUS_COLORS[node.account_status] ?? ''}`}>
              {node.account_status}
            </span>
          )}
        </td>

        {/* Reporting taxonomy */}
        <td className="px-3 py-2 text-xs text-gray-500 max-w-[180px] truncate">
          {isEditing ? (
            <select
              value={editState.reporting_taxonomy_line_id}
              onChange={(e) => onEditChange({ reporting_taxonomy_line_id: e.target.value ? Number(e.target.value) : '' })}
              className="w-44 border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">— none —</option>
              {taxonomyLines.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            taxonomyName || <span className="text-gray-300">—</span>
          )}
        </td>

        {/* Parent account */}
        <td className="px-3 py-2 text-xs text-gray-500 max-w-[160px] truncate">
          {isEditing ? (
            <select
              value={editState.parent_account_id}
              onChange={(e) => onEditChange({ parent_account_id: e.target.value ? Number(e.target.value) : '' })}
              className="w-40 border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">— none (root) —</option>
              {flatAccounts
                .filter((a) => a.id !== node.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>{a.account_number} {a.account_name}</option>
                ))}
            </select>
          ) : (
            node.parent_account_id
              ? flatAccounts.find((a) => a.id === node.parent_account_id)?.account_number || String(node.parent_account_id)
              : <span className="text-gray-300">—</span>
          )}
        </td>

        {/* Actions */}
        <td className="px-3 py-2 text-right w-20">
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
            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 hover:opacity-100 focus-within:opacity-100 [tr:hover_&]:opacity-100">
              <button
                type="button"
                onClick={() => onEdit(node)}
                className="p-1 text-gray-300 hover:text-indigo-500"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                ref={menuBtnRef}
                type="button"
                onClick={openMenu}
                className="p-1 text-gray-300 hover:text-indigo-500"
                title="Hierarchy actions"
                data-testid={`hierarchy-menu-btn-${node.id}`}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </td>
      </tr>

      {!collapsed && node.children.map((child) => (
        <AccountRow
          key={child.id}
          node={child}
          depth={depth + 1}
          taxonomyLines={taxonomyLines}
          flatAccounts={flatAccounts}
          editState={editState}
          onEdit={onEdit}
          onSave={onSave}
          onCancel={onCancel}
          onEditChange={onEditChange}
          isSaving={isSaving}
          onOpenMenu={onOpenMenu}
        />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// ChartOfAccountsPage
// ---------------------------------------------------------------------------

export function ChartOfAccountsPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [entityId, setEntityId] = useState<number | ''>(
    searchParams.get('entity') ? Number(searchParams.get('entity')) : ''
  )
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [editState, setEditState] = useState<EditState | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [moveToState, setMoveToState] = useState<{ account: AccountNode; mode: 'parent' | 'child' } | null>(null)
  const [highlightIds, setHighlightIds] = useState<Set<number>>(new Set())

  // Undo/redo
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([])
  const pendingUndoRedoRef = useRef<{ type: 'undo' | 'redo'; entry: UndoEntry } | null>(null)

  // Drag/drop
  const [dragNodeId, setDragNodeId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const dragSubtreeIdsRef = useRef<Set<number>>(new Set())

  // Expand/collapse
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set())

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ['accounts', 'tree', entityId],
    queryFn: () => accountsApi.tree(entityId as number),
    enabled: !!entityId,
  })

  const { data: taxonomyLines = [] } = useQuery({
    queryKey: ['reporting-taxonomy'],
    queryFn: () => reportingTaxonomyApi.list(),
  })

  const { data: flatAccounts = [] } = useQuery({
    queryKey: ['accounts', 'list', entityId],
    queryFn: () => accountsApi.list(entityId as number),
    enabled: !!entityId,
  })

  const flatOrder = useMemo(() => buildFlatOrder(tree), [tree])

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: AccountUpdate }) =>
      accountsApi.update(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', 'tree', entityId] })
      setEditState(null)
      toast('Account updated', 'success')
    },
    onError: (err: Error) => setApiError(err.message),
  })

  const reparentMutation = useMutation({
    mutationFn: ({ id, parentId }: { id: number; parentId: number | null }) =>
      accountsApi.reparent(id, parentId),
    onSuccess: (result: AccountReparentResult) => {
      queryClient.invalidateQueries({ queryKey: ['accounts', 'tree', entityId] })
      queryClient.invalidateQueries({ queryKey: ['accounts', 'list', entityId] })
      toast(reparentToast(result), 'success')

      const ids = new Set<number>([result.account_id])
      if (result.new_parent_id) ids.add(result.new_parent_id)
      setHighlightIds(ids)
      setTimeout(() => setHighlightIds(new Set()), 2000)

      const pendingOp = pendingUndoRedoRef.current
      pendingUndoRedoRef.current = null

      const entry: UndoEntry = {
        accountId: result.account_id,
        oldParentId: result.old_parent_id,
        newParentId: result.new_parent_id,
        description: `${result.account_number} ${result.account_name}${result.new_parent_number ? ` under ${result.new_parent_number} ${result.new_parent_name}` : ' to root'}`,
      }

      if (pendingOp === null) {
        setUndoStack((prev) => [...prev, entry])
        setRedoStack([])
      } else if (pendingOp.type === 'undo') {
        setRedoStack((prev) => [...prev, pendingOp.entry])
      } else {
        setUndoStack((prev) => [...prev, pendingOp.entry])
      }
    },
    onError: (err: Error) => {
      pendingUndoRedoRef.current = null
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? err.message
      setApiError(msg)
    },
  })

  // Undo
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || reparentMutation.isPending) return
    const entry = undoStack[undoStack.length - 1]
    setUndoStack((prev) => prev.slice(0, -1))
    pendingUndoRedoRef.current = { type: 'undo', entry }
    reparentMutation.mutate({ id: entry.accountId, parentId: entry.oldParentId })
  }, [undoStack, reparentMutation])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || reparentMutation.isPending) return
    const entry = redoStack[redoStack.length - 1]
    setRedoStack((prev) => prev.slice(0, -1))
    pendingUndoRedoRef.current = { type: 'redo', entry }
    reparentMutation.mutate({ id: entry.accountId, parentId: entry.newParentId })
  }, [redoStack, reparentMutation])

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); handleUndo() }
      if (e.ctrlKey && e.shiftKey && (e.key === 'Z' || e.key === 'z')) { e.preventDefault(); handleRedo() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleUndo, handleRedo])

  // Edit handlers
  function handleEdit(node: AccountNode) {
    setEditState({
      accountId: node.id,
      detail_type: node.detail_type ?? '',
      account_status: node.account_status,
      reporting_taxonomy_line_id: node.reporting_taxonomy_line_id ?? '',
      parent_account_id: node.parent_account_id ?? '',
    })
  }

  function handleSave() {
    if (!editState) return
    updateMutation.mutate({
      id: editState.accountId,
      patch: {
        detail_type: editState.detail_type || null,
        account_status: editState.account_status,
        reporting_taxonomy_line_id: editState.reporting_taxonomy_line_id || null,
        parent_account_id: editState.parent_account_id || null,
      },
    })
  }

  const handleOpenMenu = useCallback((accountId: number, x: number, y: number) => {
    setContextMenu({ accountId, x, y })
  }, [])

  function handleHierarchyAction(action: HierarchyAction) {
    if (!contextMenu) return
    const account = flatOrder.find((n) => n.id === contextMenu.accountId)
    if (!account) return
    const flatIndex = flatOrder.findIndex((n) => n.id === contextMenu.accountId)
    const prevNode = flatIndex > 0 ? flatOrder[flatIndex - 1] : null
    const nextNode = flatIndex < flatOrder.length - 1 ? flatOrder[flatIndex + 1] : null

    setContextMenu(null)

    switch (action) {
      case 'make_parent':
        if (!nextNode) return
        reparentMutation.mutate({ id: nextNode.id, parentId: account.id })
        break
      case 'make_child':
        if (!prevNode) return
        reparentMutation.mutate({ id: account.id, parentId: prevNode.id })
        break
      case 'outdent':
        reparentMutation.mutate({ id: account.id, parentId: null })
        break
      case 'move_to':
        setMoveToState({ account, mode: 'parent' })
        break
      case 'move_to_child':
        setMoveToState({ account, mode: 'child' })
        break
    }
  }

  // Drag/drop handlers
  const handleDragStart = useCallback((
    e: React.DragEvent<HTMLTableRowElement>,
    nodeId: number,
    subtreeIds: Set<number>
  ) => {
    e.dataTransfer.effectAllowed = 'move'
    setDragNodeId(nodeId)
    dragSubtreeIdsRef.current = subtreeIds
  }, [])

  const handleDragOver = useCallback((
    e: React.DragEvent<HTMLTableRowElement>,
    nodeId: number
  ) => {
    e.preventDefault()
    // Prevent drop onto self or own descendants
    if (dragSubtreeIdsRef.current.has(nodeId)) {
      e.dataTransfer.dropEffect = 'none'
      return
    }
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height
    const position: DropPosition = ratio < 0.33 ? 'before' : ratio > 0.67 ? 'after' : 'inside'
    setDropTarget((prev) =>
      prev?.nodeId === nodeId && prev?.position === position ? prev : { nodeId, position }
    )
  }, [])

  const handleDragEnd = useCallback(() => {
    setDragNodeId(null)
    setDropTarget(null)
  }, [])

  const handleDrop = useCallback((
    e: React.DragEvent<HTMLTableRowElement>,
    targetNodeId: number
  ) => {
    e.preventDefault()
    const dragId = dragNodeId
    const target = dropTarget
    setDragNodeId(null)
    setDropTarget(null)

    if (!dragId || !target || dragSubtreeIdsRef.current.has(targetNodeId)) return

    const targetNode = flatOrder.find((n) => n.id === targetNodeId)
    if (!targetNode) return

    let parentId: number | null
    if (target.position === 'inside') {
      parentId = targetNodeId
    } else {
      parentId = targetNode.parent_account_id ?? null
    }

    if (dragId === parentId) return // already has this parent

    reparentMutation.mutate({ id: dragId, parentId })
  }, [dragNodeId, dropTarget, flatOrder, reparentMutation])

  // Collapse handlers
  const handleToggleCollapsed = useCallback((nodeId: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  function expandAll() { setCollapsedIds(new Set()) }
  function collapseAll() {
    const ids = new Set<number>()
    for (const n of flatOrder) { if (n.children.length > 0) ids.add(n.id) }
    setCollapsedIds(ids)
  }

  const contextMenuAccount = contextMenu
    ? flatOrder.find((n) => n.id === contextMenu.accountId) ?? null
    : null

  function countByType(nodes: AccountNode[]): Record<string, number> {
    const counts: Record<string, number> = {}
    function walk(n: AccountNode) {
      counts[n.account_type] = (counts[n.account_type] ?? 0) + 1
      n.children.forEach(walk)
    }
    nodes.forEach(walk)
    return counts
  }

  function filterTree(nodes: AccountNode[]): AccountNode[] {
    return nodes.flatMap((node) => {
      const filteredChildren = filterTree(node.children)
      const typeMatch = !typeFilter || node.account_type === typeFilter
      const statusMatch = !statusFilter || node.account_status === statusFilter
      if (typeMatch && statusMatch) return [{ ...node, children: filteredChildren }]
      if (filteredChildren.length > 0) return [{ ...node, children: filteredChildren }]
      return []
    })
  }

  const typeCounts = countByType(tree)
  const filteredTree = filterTree(tree)

  const hierarchyCtxValue: HierarchyCtxValue = {
    dragNodeId,
    dropTarget,
    collapsedIds,
    highlightIds,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
    onDrop: handleDrop,
    onToggleCollapsed: handleToggleCollapsed,
  }

  const lastUndo = undoStack[undoStack.length - 1]
  const lastRedo = redoStack[redoStack.length - 1]

  return (
    <PageLayout
      title="Chart of Accounts"
      subtitle="Entity-specific account structure with reporting taxonomy mapping"
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Entity selector + action buttons */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="w-64">
          <EntitySelect value={entityId} onChange={(v) => { setEntityId(v); setEditState(null) }} />
        </div>
        {entityId && (
          <>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              <Plus className="w-3.5 h-3.5" /> Create Account
            </button>
            <button
              type="button"
              onClick={() => navigate(`/coa-import`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50"
            >
              <Upload className="w-3.5 h-3.5" /> Import / Update COA
            </button>

            {/* Undo / Redo */}
            <div className="flex items-center gap-1 ml-auto">
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStack.length === 0 || reparentMutation.isPending}
                className="flex items-center gap-1 px-2 py-1.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                title={lastUndo ? `Undo: ${lastUndo.description}` : 'Nothing to undo (Ctrl+Z)'}
                data-testid="undo-btn"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo</span>
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0 || reparentMutation.isPending}
                className="flex items-center gap-1 px-2 py-1.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                title={lastRedo ? `Redo: ${lastRedo.description}` : 'Nothing to redo (Ctrl+Shift+Z)'}
                data-testid="redo-btn"
              >
                <Redo2 className="w-3.5 h-3.5" />
                <span>Redo</span>
              </button>

              {/* Expand / Collapse all */}
              <button
                type="button"
                onClick={expandAll}
                className="p-1.5 text-gray-400 hover:text-gray-600 border rounded hover:bg-gray-50"
                title="Expand all"
                data-testid="expand-all-btn"
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="p-1.5 text-gray-400 hover:text-gray-600 border rounded hover:bg-gray-50"
                title="Collapse all"
                data-testid="collapse-all-btn"
              >
                <ChevronsDownUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Undo label */}
      {lastUndo && (
        <p className="text-xs text-gray-400 mb-2">
          Last action: {lastUndo.description} — press Ctrl+Z to undo
        </p>
      )}

      {!entityId ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-sm text-gray-400">
          Select an entity to view its Chart of Accounts
        </div>
      ) : isLoading ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-sm text-gray-400">
          Loading accounts…
        </div>
      ) : tree.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-sm text-gray-500 mb-3">No accounts imported yet for this entity.</p>
          <button
            type="button"
            onClick={() => navigate('/coa-import')}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
          >
            Import Chart of Accounts
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary chips */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTypeFilter('')}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!typeFilter ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              All · {Object.values(typeCounts).reduce((a, b) => a + b, 0)}
            </button>
            {Object.entries(typeCounts).map(([type, count]) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
                className={`px-3 py-1 rounded-full text-xs font-medium border capitalize transition-colors ${
                  typeFilter === type
                    ? TYPE_COLORS[type] + ' border-current'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {type} · {count}
              </button>
            ))}

            <div className="ml-auto flex items-center gap-1.5">
              <label className="text-xs text-gray-500">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </div>
          </div>

          {/* Drag/drop hint */}
          <p className="text-xs text-gray-400">
            Drag <GripVertical className="inline w-3 h-3" /> rows to reparent · Right-click or click <MoreVertical className="inline w-3 h-3" /> for actions · Ctrl+Z to undo
          </p>

          {/* Accounts table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <HierarchyCtx.Provider value={hierarchyCtxValue}>
              <table className="w-full text-sm min-w-[1060px]">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
                  <tr>
                    <th className="px-2 py-2 w-6" />
                    <th className="px-3 py-2 text-left w-24">Acct #</th>
                    <th className="px-3 py-2 text-left">Account Name</th>
                    <th className="px-3 py-2 text-left w-24">Type</th>
                    <th className="px-3 py-2 text-left w-36">Detail Type</th>
                    <th className="px-3 py-2 text-left w-24">Status</th>
                    <th className="px-3 py-2 text-left w-44">Reporting Line</th>
                    <th className="px-3 py-2 text-left w-36">Parent</th>
                    <th className="px-3 py-2 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTree.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                        No accounts match the current filter
                      </td>
                    </tr>
                  ) : (
                    filteredTree.map((node) => (
                      <AccountRow
                        key={node.id}
                        node={node}
                        depth={0}
                        taxonomyLines={taxonomyLines}
                        flatAccounts={flatAccounts}
                        editState={editState}
                        onEdit={handleEdit}
                        onSave={handleSave}
                        onCancel={() => setEditState(null)}
                        onEditChange={(patch) => setEditState((prev) => prev ? { ...prev, ...patch } : prev)}
                        isSaving={updateMutation.isPending}
                        onOpenMenu={handleOpenMenu}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </HierarchyCtx.Provider>
          </div>
        </div>
      )}

      {/* Floating context menu */}
      {contextMenu && contextMenuAccount && (
        <HierarchyContextMenu
          pos={contextMenu}
          account={contextMenuAccount}
          flatOrder={flatOrder}
          onAction={handleHierarchyAction}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Move To modal (parent or child) */}
      {moveToState && (
        <MoveToModal
          mode={moveToState.mode}
          account={moveToState.account}
          flatAccounts={flatAccounts}
          onSelect={(targetId) => {
            if (moveToState.mode === 'parent') {
              reparentMutation.mutate({ id: moveToState.account.id, parentId: targetId })
            } else {
              if (targetId !== null) {
                reparentMutation.mutate({ id: targetId, parentId: moveToState.account.id })
              }
            }
          }}
          onClose={() => setMoveToState(null)}
        />
      )}

      {/* Create account modal */}
      {showCreateModal && entityId && (
        <CreateAccountModal
          entityId={entityId as number}
          existingAccounts={tree}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['accounts', 'tree', entityId] })}
        />
      )}
    </PageLayout>
  )
}
