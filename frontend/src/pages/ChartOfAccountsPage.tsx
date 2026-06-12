import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, ChevronDown, ChevronUp, Upload, Pencil, X, Check, Plus,
  MoreVertical, ArrowDownToLine, ArrowUpToLine, ArrowLeftToLine, Search,
  GripVertical, Undo2, Redo2, ChevronsDownUp, ChevronsUpDown, ArrowRightToLine,
  Archive, Eye, Copy, Lock, Unlock, Tag, History, SlidersHorizontal,
  AlignJustify, AlignLeft, AlignCenter, ChevronLeft,
  AlertCircle, AlertTriangle, Building2
} from 'lucide-react'
import { accountsApi } from '@/api/accounts'
import type { AccountUpdate, AccountReparentResult } from '@/api/accounts'
import { reportingTaxonomyApi } from '@/api/reportingTaxonomy'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { CreateAccountModal } from '@/components/ui/CreateAccountModal'
import { BatchActionBar } from '@/components/data-grid'
import { useToast } from '@/providers/ToastProvider'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import type { Account, AccountNode, ReportingTaxonomyLine } from '@/types'
import { cn } from '@/utils/cn'

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, string> = {
  asset:     'bg-blue-50 text-blue-700 border-blue-200',
  liability: 'bg-orange-50 text-orange-700 border-orange-200',
  equity:    'bg-purple-50 text-purple-700 border-purple-200',
  revenue:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  expense:   'bg-rose-50 text-rose-700 border-rose-200',
}

const ACTIVE_TYPE_CHIP_COLORS: Record<string, string> = {
  asset:     'bg-blue-600 border-blue-600 text-white shadow-blue-100',
  liability: 'bg-orange-600 border-orange-600 text-white shadow-orange-100',
  equity:    'bg-purple-600 border-purple-600 text-white shadow-purple-100',
  revenue:   'bg-emerald-600 border-emerald-600 text-white shadow-emerald-100',
  expense:   'bg-rose-600 border-rose-600 text-white shadow-rose-100',
}

const STATUS_COLORS: Record<string, string> = {
  active:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  inactive:   'bg-gray-50 text-gray-500 border-gray-200',
  archived:   'bg-gray-50 text-gray-400 border-gray-200 line-through',
  deprecated: 'bg-amber-50 text-amber-700 border-amber-200',
}

type OptionalCol = 'detail_type' | 'reporting_taxonomy_line_id' | 'conflict' | 'parent_account_id'

const ALL_OPTIONAL_COLS: { key: OptionalCol; label: string }[] = [
  { key: 'detail_type', label: 'Detail Type' },
  { key: 'reporting_taxonomy_line_id', label: 'Reporting Line' },
  { key: 'conflict', label: 'Conflict' },
  { key: 'parent_account_id', label: 'Parent' },
]

const DEFAULT_VISIBLE_COLS = new Set<OptionalCol>(['detail_type', 'reporting_taxonomy_line_id', 'conflict', 'parent_account_id'])

function loadVisibleCols(): Set<OptionalCol> {
  try {
    const raw = localStorage.getItem('coa-visible-cols')
    if (raw) return new Set(JSON.parse(raw) as OptionalCol[])
  } catch { /* ignore */ }
  return new Set(DEFAULT_VISIBLE_COLS)
}

const AUTHORITATIVE_QB_TYPES: Record<string, string> = {
  checking: 'cash_and_cash_equivalents',
  savings: 'cash_and_cash_equivalents',
  cashonhand: 'cash_and_cash_equivalents',
  accountsreceivable: 'accounts_receivable',
  allowanceforbaddebts: 'accounts_receivable',
  othercurrentassets: 'other_current_assets',
  inventory: 'inventory',
  prepaidexpenses: 'prepaid_expenses',
  fixedassets: 'property_plant_and_equipment',
  accumulateddepreciation: 'property_plant_and_equipment',
  otherassets: 'other_non_current_assets',
  accountspayable: 'accounts_payable',
  creditcards: 'credit_cards',
  othercurrentliabilities: 'other_current_liabilities',
  longtermliabilities: 'long_term_liabilities',
  equity: 'retained_earnings',
  retainedearnings: 'retained_earnings',
  revenue: 'revenue',
  operatingrevenue: 'revenue',
  costofgoods_sold: 'cogs',
  cogs: 'cogs',
  expense: 'operating_expenses',
  operatingexpenses: 'operating_expenses',
}

function getSuggestedTaxonomyCode(
  accountType?: string | null,
  detailType?: string | null,
  accountName?: string | null
): string | null {
  if (detailType) {
    const normDetail = detailType.trim().toLowerCase().replace(/\s+/g, '')
    if (AUTHORITATIVE_QB_TYPES[normDetail]) return AUTHORITATIVE_QB_TYPES[normDetail]
  }
  if (accountName) {
    const normName = accountName.toLowerCase()
    if (normName.includes('cash') || normName.includes('checking') || normName.includes('bank')) return 'cash_and_cash_equivalents'
    if (normName.includes('receivable') || normName.includes('a/r')) return 'accounts_receivable'
    if (normName.includes('payable') || normName.includes('a/p')) return 'accounts_payable'
    if (normName.includes('inventory')) return 'inventory'
    if (normName.includes('prepaid')) return 'prepaid_expenses'
    if (normName.includes('depreciation') || normName.includes('equipment') || normName.includes('land') || normName.includes('building')) return 'property_plant_and_equipment'
    if (normName.includes('retained earnings') || normName.includes('capital') || normName.includes('common stock')) return 'retained_earnings'
    if (normName.includes('sales') || normName.includes('revenue') || normName.includes('income')) return 'revenue'
    if (normName.includes('cogs') || normName.includes('cost of goods') || normName.includes('cost of sales')) return 'cogs'
    if (normName.includes('expense') || normName.includes('rent') || normName.includes('salary') || normName.includes('travel')) return 'operating_expenses'
  }
  if (accountType) {
    const normType = accountType.trim().toLowerCase().replace(/\s+/g, '')
    if (AUTHORITATIVE_QB_TYPES[normType]) return AUTHORITATIVE_QB_TYPES[normType]
  }
  return null
}

interface ValidationFlag {
  type: 'error' | 'warning' | 'info' | 'success'
  message: string
  code: string
}

function getAccountValidationFlags(
  node: Account,
  flatAccounts: Account[],
  taxonomyLines: ReportingTaxonomyLine[]
): ValidationFlag[] {
  const flags: ValidationFlag[] = []

  const nameLower = node.account_name.toLowerCase()
  const typeLower = node.account_type.toLowerCase()

  // 1. Invalid Category Combinations
  if (nameLower.includes('receivable') && typeLower !== 'asset') {
    flags.push({ type: 'error', message: 'Receivable account should be Asset type', code: 'invalid_category' })
  }
  if (nameLower.includes('payable') && typeLower !== 'liability') {
    flags.push({ type: 'error', message: 'Payable account should be Liability type', code: 'invalid_category' })
  }
  if ((nameLower.includes('cash') || nameLower.includes('checking') || nameLower.includes('savings')) && typeLower !== 'asset') {
    flags.push({ type: 'error', message: 'Cash/Bank account should be Asset type', code: 'invalid_category' })
  }
  if ((nameLower.includes('expense') || nameLower.includes('cost of goods')) && typeLower !== 'expense') {
    flags.push({ type: 'error', message: 'Expense account should be Expense type', code: 'invalid_category' })
  }
  if ((nameLower.includes('revenue') || nameLower.includes('sales')) && typeLower !== 'revenue') {
    flags.push({ type: 'error', message: 'Revenue account should be Revenue type', code: 'invalid_category' })
  }

  // Find direct mapping
  const directMapping = node.reporting_taxonomy_line_id
  
  // Find inherited mapping
  let inheritedMappingId: number | null = null
  let parentId = node.parent_account_id
  while (parentId && !inheritedMappingId) {
    const parent = flatAccounts.find(a => a.id === parentId)
    if (parent) {
      if (parent.reporting_taxonomy_line_id) {
        inheritedMappingId = parent.reporting_taxonomy_line_id
      }
      parentId = parent.parent_account_id
    } else {
      break
    }
  }

  const suggestionCode = getSuggestedTaxonomyCode(node.account_type, node.detail_type, node.account_name)
  const suggestedLine = suggestionCode ? taxonomyLines.find(l => l.code === suggestionCode) : null

  // 2. Mapping Status / Warnings
  if (directMapping) {
    const mappedLine = taxonomyLines.find(l => l.id === directMapping)
    if (mappedLine) {
      // Conflicting Mappings
      const isAssetLine = ['cash_and_cash_equivalents', 'accounts_receivable', 'inventory', 'prepaid_expenses', 'other_current_assets', 'property_plant_and_equipment', 'other_non_current_assets'].includes(mappedLine.code)
      const isLiabLine = ['accounts_payable', 'credit_cards', 'other_current_liabilities', 'long_term_liabilities'].includes(mappedLine.code)
      const isEquityLine = ['retained_earnings'].includes(mappedLine.code)
      const isRevLine = ['revenue'].includes(mappedLine.code)
      const isExpLine = ['cogs', 'operating_expenses'].includes(mappedLine.code)

      if (typeLower === 'asset' && !isAssetLine) {
        flags.push({ type: 'warning', message: `Asset mapped to non-Asset line (${mappedLine.name})`, code: 'conflict' })
      } else if (typeLower === 'liability' && !isLiabLine) {
        flags.push({ type: 'warning', message: `Liability mapped to non-Liability line (${mappedLine.name})`, code: 'conflict' })
      } else if (typeLower === 'equity' && !isEquityLine) {
        flags.push({ type: 'warning', message: `Equity mapped to non-Equity line (${mappedLine.name})`, code: 'conflict' })
      } else if (typeLower === 'revenue' && !isRevLine) {
        flags.push({ type: 'warning', message: `Revenue mapped to non-Revenue line (${mappedLine.name})`, code: 'conflict' })
      } else if (typeLower === 'expense' && !isExpLine) {
        flags.push({ type: 'warning', message: `Expense mapped to non-Expense line (${mappedLine.name})`, code: 'conflict' })
      }

      // Overridden
      if (suggestedLine && suggestedLine.id !== directMapping) {
        flags.push({ type: 'info', message: `Manually Overridden (AI suggested ${suggestedLine.name})`, code: 'override' })
      } else if (suggestedLine && suggestedLine.id === directMapping) {
        flags.push({ type: 'success', message: 'Matches AI Suggestion', code: 'suggested' })
      }
    }
  } else {
    // No direct mapping
    if (inheritedMappingId) {
      const inheritedLine = taxonomyLines.find(l => l.id === inheritedMappingId)
      flags.push({ type: 'info', message: `Inherited from parent (${inheritedLine?.name})`, code: 'inherited' })
    } else {
      flags.push({ type: 'warning', message: 'Unmapped', code: 'unmapped' })
    }
  }

  return flags
}

type GridDensity = 'compact' | 'normal' | 'comfortable'

const DENSITY_PY: Record<GridDensity, string> = {
  compact:     'py-1',
  normal:      'py-2',
  comfortable: 'py-3',
}

function buildFlatOrder(nodes: AccountNode[]): AccountNode[] {
  const result: AccountNode[] = []
  for (const node of nodes) {
    result.push(node)
    result.push(...buildFlatOrder(node.children))
  }
  return result
}

function buildSubtreeIds(node: AccountNode): Set<number> {
  const ids = new Set<number>([node.id])
  for (const child of node.children) buildSubtreeIds(child).forEach((id) => ids.add(id))
  return ids
}

function reparentToast(
  r: { account_number: string; account_name: string; new_parent_number: string | null; new_parent_name: string | null }
): string {
  const acct = `${r.account_number} ${r.account_name}`
  if (!r.new_parent_number) return `${acct} moved to root (no parent)`
  return `${acct} moved under ${r.new_parent_number} ${r.new_parent_name}`
}

function matchesSearch(node: AccountNode, q: string): boolean {
  const lower = q.toLowerCase()
  return (
    node.account_number.toLowerCase().includes(lower) ||
    node.account_name.toLowerCase().includes(lower) ||
    (node.detail_type ?? '').toLowerCase().includes(lower) ||
    node.account_type.toLowerCase().includes(lower)
  )
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditState {
  accountId: number
  account_number: string
  account_name: string
  account_type: string
  detail_type: string
  account_status: string
  reporting_taxonomy_line_id: number | ''
  parent_account_id: number | ''
}

type HierarchyAction = 'make_parent' | 'make_child' | 'outdent' | 'move_to' | 'move_to_child'

interface ContextMenuState { accountId: number; x: number; y: number }

interface ReparentEntry {
  type: 'reparent'
  accountId: number
  description: string
  oldParentId: number | null
  newParentId: number | null
}

interface EditEntry {
  type: 'edit'
  accountId: number
  description: string
  beforePatch: AccountUpdate
  afterPatch: AccountUpdate
}

type UndoEntry = ReparentEntry | EditEntry

type DropPosition = 'before' | 'inside' | 'after'
interface DropTarget { nodeId: number; position: DropPosition }

// ---------------------------------------------------------------------------
// Hierarchy context
// ---------------------------------------------------------------------------

interface HierarchyCtxValue {
  dragNodeId: number | null
  dropTarget: DropTarget | null
  collapsedIds: Set<number>
  highlightIds: Set<number>
  selectedIds: Set<number>
  onDragStart: (e: React.DragEvent<HTMLTableRowElement>, nodeId: number, subtreeIds: Set<number>) => void
  onDragOver: (e: React.DragEvent<HTMLTableRowElement>, nodeId: number) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent<HTMLTableRowElement>, nodeId: number) => void
  onToggleCollapsed: (nodeId: number) => void
  onToggleSelect: (nodeId: number) => void
  onPreview: (nodeId: number) => void
}

const HierarchyCtx = createContext<HierarchyCtxValue | null>(null)
function useHierarchyCtx() {
  const ctx = useContext(HierarchyCtx)
  if (!ctx) throw new Error('HierarchyCtx required')
  return ctx
}

// ---------------------------------------------------------------------------
// AccountPreviewSidebar
// ---------------------------------------------------------------------------

interface AccountPreviewSidebarProps {
  account: AccountNode | null
  allAccounts: Account[]
  taxonomyLines: ReportingTaxonomyLine[]
  onClose: () => void
  onEdit: () => void
  onAddChild: () => void
}

function AccountPreviewSidebar({
  account,
  allAccounts,
  taxonomyLines,
  onClose,
  onEdit,
  onAddChild,
}: AccountPreviewSidebarProps) {
  if (!account) return null

  const parent = allAccounts.find((a) => a.id === account.parent_account_id)

  // Inheritance resolution logic
  let inheritedFrom: Account | null = null
  let currentParentId = account.parent_account_id
  let resolvedTaxonomyLineId = account.reporting_taxonomy_line_id
  
  while (currentParentId && !resolvedTaxonomyLineId) {
    const pAcct = allAccounts.find((a) => a.id === currentParentId)
    if (pAcct) {
      if (pAcct.reporting_taxonomy_line_id) {
        resolvedTaxonomyLineId = pAcct.reporting_taxonomy_line_id
        inheritedFrom = pAcct
      }
      currentParentId = pAcct.parent_account_id
    } else {
      break
    }
  }

  const isInherited = resolvedTaxonomyLineId !== account.reporting_taxonomy_line_id
  const resolvedTaxonomyLine = taxonomyLines.find((t) => t.id === resolvedTaxonomyLineId)

  // Build taxonomy path
  const pathParts: string[] = []
  if (resolvedTaxonomyLine) {
    let curr: ReportingTaxonomyLine | undefined = resolvedTaxonomyLine
    while (curr) {
      pathParts.unshift(curr.name)
      const nextParentId = curr.parent_id
      curr = nextParentId ? taxonomyLines.find((t) => t.id === nextParentId) : undefined
    }
    const stmtTypeLabel = resolvedTaxonomyLine.statement_type === 'balance_sheet' ? 'Balance Sheet' :
                          resolvedTaxonomyLine.statement_type === 'income_statement' ? 'Income Statement' :
                          resolvedTaxonomyLine.statement_type ? resolvedTaxonomyLine.statement_type.replace('_', ' ') : ''
    if (stmtTypeLabel && !pathParts.includes(stmtTypeLabel)) {
      pathParts.unshift(stmtTypeLabel)
    }
  }
  const hierarchyPath = pathParts.join(' > ')

  // Siblings calculation
  const siblings = allAccounts.filter(
    (a) => a.parent_account_id === account.parent_account_id && a.id !== account.id
  )

  return (
    <div className="w-80 shrink-0 border-l border-gray-200 bg-white overflow-y-auto flex flex-col h-full shadow-lg animate-in slide-in-from-right duration-250">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/75 sticky top-0 z-10 backdrop-blur-sm">
        <div className="min-w-0">
          <p className="text-[10px] font-mono font-semibold text-gray-400 tracking-wider uppercase">{account.account_number || "—"}</p>
          <h3 className="text-sm font-bold text-gray-900 truncate mt-0.5" title={account.account_name}>
            {account.account_name}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0 transition-colors"
          title="Close drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 flex-1 space-y-6">
        {/* Type & Status Badges */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider",
              TYPE_COLORS[account.account_type] ?? "bg-gray-100 text-gray-600 border-gray-200"
            )}>
              {account.account_type}
            </span>
            <span className={cn(
              "inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider",
              STATUS_COLORS[account.account_status] ?? "bg-gray-100 text-gray-600 border-gray-200"
            )}>
              {account.account_status}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-gray-700"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Account
            </button>
            <button
              type="button"
              onClick={onAddChild}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Add Child
            </button>
          </div>
        </div>

        {/* Details Card */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 space-y-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Account Details</p>
          <dl className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <dt className="text-gray-500">Normal Balance</dt>
              <dd className="font-semibold text-gray-800 capitalize">{account.normal_balance}</dd>
            </div>
            {account.detail_type && (
              <div className="flex justify-between items-center text-xs">
                <dt className="text-gray-500">Detail Type</dt>
                <dd className="font-semibold text-gray-800">{account.detail_type}</dd>
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              {account.is_header && (
                <span className="inline-flex items-center px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
                  Header
                </span>
              )}
              {!account.is_postable && (
                <span className="inline-flex items-center px-2 py-0.5 rounded border border-red-200 bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-wider">
                  No Posting
                </span>
              )}
              {account.is_postable && !account.is_header && (
                <span className="inline-flex items-center px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider">
                  Postable
                </span>
              )}
            </div>
            {account.fs_statement && (
              <div className="flex justify-between items-center text-xs">
                <dt className="text-gray-500">FS Statement</dt>
                <dd className="font-semibold text-gray-800">{account.fs_statement.replace(/([A-Z])/g, ' $1').trim()}</dd>
              </div>
            )}
            {account.fs_section && (
              <div className="flex justify-between items-center text-xs">
                <dt className="text-gray-500">FS Section</dt>
                <dd className="font-semibold text-gray-800">{account.fs_section}</dd>
              </div>
            )}
            {account.fs_line_label && (
              <div className="flex justify-between items-center text-xs">
                <dt className="text-gray-500">FS Line Label</dt>
                <dd className="font-semibold text-gray-800">{account.fs_line_label}</dd>
              </div>
            )}
            {account.cfs_section && (
              <div className="flex justify-between items-center text-xs">
                <dt className="text-gray-500">CFS Section</dt>
                <dd className="font-semibold text-gray-800">{account.cfs_section}</dd>
              </div>
            )}
            {account.description && (
              <div className="border-t border-gray-200/50 pt-2 mt-2">
                <dt className="text-gray-500 text-[10px] font-semibold uppercase tracking-wide mb-1">Description</dt>
                <dd className="text-gray-600 leading-normal text-xs">{account.description}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Hierarchy Connection */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hierarchy Connection</p>
          {parent ? (
            <div className="flex items-center gap-2 p-3 bg-white border rounded-lg shadow-sm">
              <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-mono text-gray-400 leading-none">{parent.account_number}</p>
                <p className="text-xs font-semibold text-gray-700 truncate mt-0.5">{parent.account_name}</p>
              </div>
              <span className="ml-auto text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">Parent</span>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic pl-1">Root account (no parent)</p>
          )}

          {account.children.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-gray-500 pl-1">
                {account.children.length} child account{account.children.length > 1 ? 's' : ''}:
              </p>
              <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50 bg-white">
                {account.children.map((child) => (
                  <div key={child.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 transition-colors">
                    <span className="font-mono text-[10px] text-gray-400 w-12 shrink-0">{child.account_number}</span>
                    <span className="text-xs font-medium text-gray-700 truncate">{child.account_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Siblings */}
        {siblings.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sibling Accounts</p>
            <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50 bg-white">
              {siblings.map((sib) => (
                <div key={sib.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 transition-colors">
                  <span className="font-mono text-[10px] text-gray-400 w-12 shrink-0">{sib.account_number}</span>
                  <span className="text-xs font-medium text-gray-700 truncate">{sib.account_name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reporting Taxonomy Assignment */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Reporting Mapping</p>
          {resolvedTaxonomyLine ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2.5 p-3 border border-indigo-100 bg-indigo-50/20 rounded-lg">
                <Tag className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className="text-xs font-bold text-indigo-950">{resolvedTaxonomyLine.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${
                      isInherited 
                        ? 'bg-blue-50 text-blue-700 border-blue-200' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`} data-testid="mapping-source-badge">
                      {isInherited ? 'Inherited' : 'Manual'}
                    </span>
                  </div>
                  {pathParts.length > 0 && (
                    <div className="flex items-center gap-0.5 flex-wrap mt-1" data-testid="fs-hierarchy-path">
                      {pathParts.map((segment, i) => (
                        <span key={i} className="flex items-center gap-0.5">
                          {i > 0 && <span className="text-indigo-200 text-[10px]">›</span>}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            i === 0
                              ? 'bg-blue-50 border-blue-200 text-blue-700 font-semibold'
                              : i === pathParts.length - 1
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}>
                            {segment}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                  {isInherited && inheritedFrom && (
                    <p className="text-[10px] text-gray-555 mt-1 italic" data-testid="inherited-from-text">
                      Inherited from parent: {inheritedFrom.account_number} {inheritedFrom.account_name}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3 border border-amber-200 bg-amber-50/50 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-900">Unmapped Account</p>
                <p className="text-[10px] text-amber-700 mt-0.5">Will resolve to unclassified lines in reports.</p>
              </div>
            </div>
          )}
        </div>

        {/* Linked Sources */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Linked Source / Lineage</p>
          {(account as any).source_system ? (
            <div className="p-3 bg-gray-50 border rounded-lg">
              <p className="text-xs font-semibold text-gray-800">
                Created via {(account as any).source_system === 'pdf_import' ? 'PDF Ingestion' : 'Trial Balance Import'}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5 font-mono">
                System: {(account as any).source_system} · ID: #{account.id}
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic pl-1">Manually created account</p>
          )}
        </div>

        {/* Source System */}
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-400">Account ID</span>
            <span className="font-mono text-gray-500">#{account.id}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SettingsPanel
// ---------------------------------------------------------------------------

interface SettingsPanelProps {
  density: GridDensity
  onDensity: (d: GridDensity) => void
  showInactive: boolean
  onShowInactive: (v: boolean) => void
  visibleColumns: Set<OptionalCol>
  onToggleColumn: (col: OptionalCol) => void
  entityId: number | ''
  onClose: () => void
}

function SettingsPanel({ density, onDensity, showInactive, onShowInactive, visibleColumns, onToggleColumn, entityId, onClose }: SettingsPanelProps) {
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const DENSITIES: { key: GridDensity; label: string; icon: React.ElementType }[] = [
    { key: 'compact', label: 'Compact', icon: AlignJustify },
    { key: 'normal', label: 'Normal', icon: AlignLeft },
    { key: 'comfortable', label: 'Comfortable', icon: AlignCenter },
  ]

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-xl w-56 py-2">
      <div className="px-3 py-1.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Density</p>
        <div className="flex gap-1">
          {DENSITIES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onDensity(key)}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 px-2 py-1.5 rounded text-[10px] border',
                density === key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="border-t border-gray-100 mt-1.5 pt-1.5 px-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => onShowInactive(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600"
          />
          <span className="text-xs text-gray-700">Show inactive / archived</span>
        </label>
      </div>
      <div className="border-t border-gray-100 mt-1.5 pt-1.5 px-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Optional Columns</p>
        <div className="flex flex-col gap-1">
          {ALL_OPTIONAL_COLS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={visibleColumns.has(key)}
                onChange={() => onToggleColumn(key)}
                className="rounded border-gray-300 text-indigo-600"
              />
              <span className="text-xs text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="border-t border-gray-100 mt-1.5 pt-1.5 px-3 pb-1">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Data Maintenance</p>
        {backfillMsg && <p className="text-[10px] text-emerald-600 mb-1.5">{backfillMsg}</p>}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              const eid = entityId !== '' ? entityId : undefined
              accountsApi.backfillPaths(eid).then((r) => setBackfillMsg(`Paths updated: ${r.updated} accounts`))
            }}
            className="text-left text-xs text-gray-600 hover:text-indigo-700 py-0.5 underline-offset-2 hover:underline"
          >
            Backfill account paths
          </button>
          <button
            type="button"
            onClick={() => {
              const eid = entityId !== '' ? entityId : undefined
              accountsApi.backfillFsSign(eid).then((r) => setBackfillMsg(`FS sign updated: ${r.updated} accounts`))
            }}
            className="text-left text-xs text-gray-600 hover:text-indigo-700 py-0.5 underline-offset-2 hover:underline"
          >
            Backfill FS sign convention
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MoveToModal
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
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 border rounded hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// HierarchyContextMenu
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
        disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700'
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

      {item(<ArrowDownToLine className="w-3.5 h-3.5" />, 'Make Parent',
        nextNode ? `→ parent of ${nextNode.account_number} ${nextNode.account_name}` : null,
        () => onAction('make_parent'), !nextNode, 'action-make-parent'
      )}
      {item(<ArrowUpToLine className="w-3.5 h-3.5" />, 'Make Child',
        prevNode ? `→ child of ${prevNode.account_number} ${prevNode.account_name}` : null,
        () => onAction('make_child'), !prevNode || prevNode.id === account.parent_account_id, 'action-make-child'
      )}
      {item(<ArrowLeftToLine className="w-3.5 h-3.5" />, 'Outdent / Remove Parent',
        hasParent ? 'Move to root level' : 'Already at root',
        () => onAction('outdent'), !hasParent, 'action-outdent'
      )}
      <div className="border-t border-gray-100 mt-1 pt-1">
        {item(<Search className="w-3.5 h-3.5" />, 'Move To Parent…', 'Place under any account',
          () => onAction('move_to'), false, 'action-move-to'
        )}
        {item(<ArrowRightToLine className="w-3.5 h-3.5" />, 'Move To Child…', 'Adopt any account as child',
          () => onAction('move_to_child'), false, 'action-move-to-child'
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AccountRowActionMenu — full per-row action menu
// ---------------------------------------------------------------------------

interface AccountRowActionMenuProps {
  node: AccountNode
  onEdit: () => void
  onAddChild: () => void
  onDuplicate: () => void
  onArchive: () => void
  onActivate: () => void
  onPreview: () => void
}

function AccountRowActionMenu({
  node, onEdit, onAddChild, onDuplicate, onArchive, onActivate, onPreview,
}: AccountRowActionMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function k(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open])

  const isArchived = node.account_status === 'archived'

  const menuItem = (
    icon: React.ElementType,
    label: string,
    onClick: () => void,
    variant: 'default' | 'danger' = 'default',
    separator = false
  ) => {
    const Icon = icon
    return (
      <div key={label}>
        {separator && <div className="border-t border-gray-100 my-1" />}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(false); onClick() }}
          className={cn(
            'w-full text-left px-3 py-2 text-xs flex items-center gap-2',
            variant === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
          )}
        >
          <Icon className="w-3.5 h-3.5 shrink-0 opacity-60" />
          {label}
        </button>
      </div>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="p-1 text-gray-300 hover:text-indigo-500 opacity-0 group-hover/row:opacity-100 focus:opacity-100"
        data-testid={`row-action-menu-${node.id}`}
        title="Actions"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-44 py-1">
          <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 mb-1">
            {node.account_number}
          </div>
          {menuItem(Pencil, 'Edit', onEdit)}
          {menuItem(Eye, 'Preview', onPreview)}
          {menuItem(Plus, 'Add Child Account', onAddChild)}
          {menuItem(Copy, 'Duplicate', onDuplicate, 'default', true)}
          {isArchived
            ? menuItem(Unlock, 'Activate', onActivate)
            : menuItem(Archive, 'Archive', onArchive, 'danger', true)}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AccountRow
// ---------------------------------------------------------------------------

interface AccountRowProps {
  node: AccountNode
  depth: number
  density: GridDensity
  taxonomyLines: ReportingTaxonomyLine[]
  flatAccounts: Account[]
  editState: EditState | null
  onEdit: (node: AccountNode) => void
  onSave: () => void
  onCancel: () => void
  onEditChange: (patch: Partial<EditState>) => void
  isSaving: boolean
  onOpenMenu: (accountId: number, x: number, y: number) => void
  onAddChild: (node: AccountNode) => void
  onDuplicate: (node: AccountNode) => void
  onArchive: (node: AccountNode) => void
  onActivate: (node: AccountNode) => void
  onResolveConflict: (node: AccountNode) => void
  visibleColumns: Set<OptionalCol>
}

function AccountRow({
  node, depth, density, taxonomyLines, flatAccounts,
  editState, onEdit, onSave, onCancel, onEditChange, isSaving,
  onOpenMenu, onAddChild, onDuplicate, onArchive, onActivate,
  onResolveConflict, visibleColumns,
}: AccountRowProps) {
  const {
    dragNodeId, dropTarget, collapsedIds, highlightIds, selectedIds,
    onDragStart, onDragOver, onDragEnd, onDrop, onToggleCollapsed,
    onToggleSelect, onPreview,
  } = useHierarchyCtx()

  const collapsed = collapsedIds.has(node.id)
  const isEditing = editState?.accountId === node.id
  const hasChildren = node.children.length > 0
  const isDragging = dragNodeId === node.id
  const isDropTarget = dropTarget?.nodeId === node.id
  const dropPos = isDropTarget ? dropTarget!.position : null
  const isHighlighted = highlightIds.has(node.id)
  const isSelected = selectedIds.has(node.id)
  const taxonomyName = taxonomyLines.find((t) => t.id === node.reporting_taxonomy_line_id)?.name

  // Find inherited mapping
  const inheritedMappingId = useMemo(() => {
    let parentId = node.parent_account_id
    while (parentId) {
      const parent = flatAccounts.find(a => a.id === parentId)
      if (parent) {
        if (parent.reporting_taxonomy_line_id) {
          return parent.reporting_taxonomy_line_id
        }
        parentId = parent.parent_account_id
      } else {
        break
      }
    }
    return null
  }, [node.parent_account_id, flatAccounts])

  const inheritedTaxonomyName = useMemo(() => {
    if (!inheritedMappingId) return null
    return taxonomyLines.find((t) => t.id === inheritedMappingId)?.name ?? null
  }, [inheritedMappingId, taxonomyLines])

  const py = DENSITY_PY[density]

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

  const subtreeIdsRef = useRef<Set<number>>(new Set())
  function handleDragStart(e: React.DragEvent<HTMLTableRowElement>) {
    subtreeIdsRef.current = buildSubtreeIds(node)
    onDragStart(e, node.id, subtreeIdsRef.current)
  }

  const rowClass = cn(
    'group/row hover:bg-gray-50 transition-colors',
    isEditing && 'bg-indigo-50',
    isHighlighted && 'bg-amber-50 ring-1 ring-inset ring-amber-300',
    isDragging && 'opacity-40',
    isSelected && !isEditing && 'bg-blue-50',
    dropPos === 'inside' && 'bg-indigo-50 ring-2 ring-inset ring-indigo-400',
    dropPos === 'before' && 'border-t-2 border-indigo-500',
    dropPos === 'after' && 'border-b-2 border-indigo-500',
  )

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
        {/* Checkbox */}
        <td className={cn('pl-3 pr-0 w-8', py)} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(node.id)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
            data-testid={`account-checkbox-${node.id}`}
          />
        </td>

        {/* Drag handle */}
        <td className={cn('pl-1 pr-0 w-5 text-gray-200 hover:text-gray-400 cursor-grab', py)} title="Drag to reparent">
          <GripVertical className="w-3 h-3" />
        </td>

        {/* Acct # */}
        <td className={cn('px-3 text-xs text-gray-400 font-mono w-24', py)}>
          {isEditing ? (
            <input
              type="text"
              value={editState.account_number}
              onChange={(e) => onEditChange({ account_number: e.target.value })}
              className="w-20 border border-indigo-300 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          ) : (
            node.account_number || '—'
          )}
        </td>

        {/* Account name with indent */}
        <td className={cn('px-3', py)}>
          <div className="flex items-center gap-0.5 min-h-[24px]">
            {/* Guide lines for nesting hierarchy */}
            {Array.from({ length: depth }).map((_, i) => {
              const isLast = i === depth - 1
              return (
                <div
                  key={i}
                  className="w-5 self-stretch flex-shrink-0 flex items-center justify-center relative min-h-[24px]"
                >
                  <div
                    className="absolute top-0 w-px bg-slate-200"
                    style={{
                      left: '10px',
                      bottom: isLast ? '50%' : '0'
                    }}
                  />
                  {isLast && (
                    <div
                      className="absolute right-0 h-px bg-slate-200"
                      style={{
                        left: '10px',
                        top: '50%'
                      }}
                    />
                  )}
                </div>
              )
            })}
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggleCollapsed(node.id)}
                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-indigo-650 hover:bg-slate-100 rounded transition-colors flex-shrink-0 cursor-pointer"
              >
                {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            ) : (
              <span className="w-5 h-5 flex-shrink-0 inline-block" />
            )}
            {isEditing ? (
              <input
                type="text"
                value={editState.account_name}
                onChange={(e) => onEditChange({ account_name: e.target.value })}
                className="flex-1 min-w-0 border border-slate-250 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white shadow-xs"
              />
            ) : (
              <button
                type="button"
                onClick={() => onPreview(node.id)}
                className={cn(
                  'text-xs text-left truncate max-w-[280px] font-semibold transition-colors cursor-pointer',
                  node.account_status === 'archived' ? 'text-slate-400 line-through' : 'text-slate-800',
                  'hover:text-indigo-600'
                )}
                title={node.account_name}
              >
                {node.account_name}
              </button>
            )}
            {hasChildren && !isEditing && (
              <span className="text-[10px] text-slate-400 font-bold ml-1 bg-slate-100 px-1.5 py-0.5 rounded-full">({node.children.length})</span>
            )}
          </div>
        </td>

        {/* Type */}
        <td className={cn('px-3 w-24', py)}>
          {isEditing ? (
            <select
              value={editState.account_type}
              onChange={(e) => onEditChange({ account_type: e.target.value })}
              className="border border-slate-200 rounded px-2 py-0.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
            >
              <option value="asset">asset</option>
              <option value="liability">liability</option>
              <option value="equity">equity</option>
              <option value="revenue">revenue</option>
              <option value="cogs">cogs</option>
              <option value="expense">expense</option>
              <option value="other_income">other_income</option>
              <option value="other_expense">other_expense</option>
              <option value="tax">tax</option>
              <option value="intercompany">intercompany</option>
            </select>
          ) : (
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider", TYPE_COLORS[node.account_type] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
              {node.account_type}
            </span>
          )}
        </td>

        {/* Detail type */}
        {visibleColumns.has('detail_type') && (
          <td className={cn('px-3 text-xs text-slate-550 w-36', py)}>
            {isEditing ? (
              <input
                type="text"
                value={editState.detail_type}
                onChange={(e) => onEditChange({ detail_type: e.target.value })}
                className="w-36 border border-slate-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white shadow-xs"
              />
            ) : (
              node.detail_type || <span className="text-slate-300">—</span>
            )}
          </td>
        )}

        {/* Status */}
        <td className={cn('px-3 w-24', py)}>
          {isEditing ? (
            <select
              value={editState.account_status}
              onChange={(e) => onEditChange({ account_status: e.target.value })}
              className="border border-slate-200 rounded px-2 py-0.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="archived">archived</option>
              <option value="deprecated">deprecated</option>
            </select>
          ) : (
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider", STATUS_COLORS[node.account_status] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
              {node.account_status}
            </span>
          )}
        </td>

        {/* Reporting taxonomy */}
        {visibleColumns.has('reporting_taxonomy_line_id') && <td className={cn('px-3 text-xs text-slate-550 max-w-[180px] truncate', py)}>
          {isEditing ? (
            <select
              value={editState.reporting_taxonomy_line_id}
              onChange={(e) => onEditChange({ reporting_taxonomy_line_id: e.target.value ? Number(e.target.value) : '' })}
              className="w-44 border border-slate-200 rounded px-2 py-0.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
            >
              <option value="">— none —</option>
              {taxonomyLines.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            (() => {
              const flags = getAccountValidationFlags(node, flatAccounts, taxonomyLines)
              return (
                <div className="flex flex-col gap-1 items-start">
                  {taxonomyName ? (
                    <span 
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-indigo-150 bg-indigo-50/70 text-indigo-700 text-[11px] font-semibold whitespace-nowrap shadow-sm"
                      data-testid="manual-mapping-badge"
                    >
                      <Tag className="w-3 h-3 text-indigo-400 shrink-0" />
                      {taxonomyName}
                    </span>
                  ) : inheritedTaxonomyName ? (
                    <span 
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-indigo-300 bg-indigo-50/30 text-indigo-600 text-[11px] font-semibold whitespace-nowrap shadow-sm"
                      data-testid="inherited-mapping-badge"
                    >
                      <ArrowRightToLine className="w-3 h-3 text-indigo-400 shrink-0" />
                      {inheritedTaxonomyName} (Inherited)
                    </span>
                  ) : (
                    <span 
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-250 bg-amber-50 text-amber-800 text-[11px] font-semibold whitespace-nowrap shadow-sm"
                      data-testid="unmapped-badge"
                    >
                      <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                      Unmapped
                    </span>
                  )}
                  {flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {flags.map((flag, idx) => (
                        <span
                          key={idx}
                          title={flag.message}
                          className={cn(
                            "inline-flex items-center px-1.5 py-0.2 rounded-full border text-[8px] font-bold uppercase tracking-wider",
                            flag.type === 'error' && "bg-red-50 text-red-700 border-red-200",
                            flag.type === 'warning' && "bg-amber-50 text-amber-700 border-amber-200",
                            flag.type === 'info' && "bg-blue-50 text-blue-700 border-blue-200",
                            flag.type === 'success' && "bg-green-50 text-green-700 border-green-200"
                          )}
                        >
                          {flag.code === 'invalid_category' && 'Invalid Type'}
                          {flag.code === 'conflict' && 'Conflict'}
                          {flag.code === 'override' && 'Overridden'}
                          {flag.code === 'suggested' && 'AI Suggested'}
                          {flag.code === 'inherited' && 'Inherited'}
                          {flag.code === 'unmapped' && 'Unmapped'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()
          )}
        </td>}

        {/* Conflict column cell */}
        {visibleColumns.has('conflict') && <td className={cn('px-3 w-24 text-center', py)}>
          {(() => {
            const flags = getAccountValidationFlags(node, flatAccounts, taxonomyLines)
            const hasConflict = flags.some(f => f.code === 'conflict')
            return hasConflict ? (
              <button
                type="button"
                onClick={() => onResolveConflict(node)}
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-105 text-amber-700 border border-amber-300 hover:bg-amber-200 transition-colors cursor-pointer"
                title="Taxonomy conflict — click to resolve"
                data-testid={`conflict-badge-${node.id}`}
              >
                conflict
              </button>
            ) : (
              <span className="text-gray-300">—</span>
            )
          })()}
        </td>}

        {/* Parent account */}
        {visibleColumns.has('parent_account_id') && <td className={cn('px-3 text-xs text-slate-550 w-32 truncate', py)}>
          {isEditing ? (
            <select
              value={editState.parent_account_id}
              onChange={(e) => onEditChange({ parent_account_id: e.target.value ? Number(e.target.value) : '' })}
              className="w-40 border border-slate-200 rounded px-2 py-0.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
            >
              <option value="">— none (root) —</option>
              {flatAccounts.filter((a) => a.id !== node.id).map((a) => (
                <option key={a.id} value={a.id}>{a.account_number} {a.account_name}</option>
              ))}
            </select>
          ) : (
            node.parent_account_id ? (
              <span className="font-mono text-xs bg-slate-50 border border-slate-200 text-slate-650 px-1.5 py-0.5 rounded">
                {flatAccounts.find((a) => a.id === node.parent_account_id)?.account_number || '—'}
              </span>
            ) : (
              <span className="text-slate-300">—</span>
            )
          )}
        </td>}

        {/* Actions */}
        <td className={cn('px-2 text-right w-20', py)}>
          {isEditing ? (
            <div className="flex items-center justify-end gap-1">
              <button type="button" disabled={isSaving} onClick={onSave} className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50" title="Save">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600" title="Cancel">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                onClick={() => onEdit(node)}
                className="p-1 text-gray-300 hover:text-indigo-500"
                title="Edit"
                data-testid={`edit-btn-${node.id}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={openMenu}
                className="p-1 text-gray-300 hover:text-indigo-500"
                title="Hierarchy actions"
                data-testid={`hierarchy-menu-btn-${node.id}`}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              <AccountRowActionMenu
                node={node}
                onEdit={() => onEdit(node)}
                onAddChild={() => onAddChild(node)}
                onDuplicate={() => onDuplicate(node)}
                onArchive={() => onArchive(node)}
                onActivate={() => onActivate(node)}
                onPreview={() => onPreview(node.id)}
              />
            </div>
          )}
        </td>
      </tr>

      {!collapsed && node.children.map((child) => (
        <AccountRow
          key={child.id}
          node={child}
          depth={depth + 1}
          density={density}
          taxonomyLines={taxonomyLines}
          flatAccounts={flatAccounts}
          editState={editState}
          onEdit={onEdit}
          onSave={onSave}
          onCancel={onCancel}
          onEditChange={onEditChange}
          isSaving={isSaving}
          onOpenMenu={onOpenMenu}
          onAddChild={onAddChild}
          onDuplicate={onDuplicate}
          onArchive={onArchive}
          onActivate={onActivate}
          onResolveConflict={onResolveConflict}
          visibleColumns={visibleColumns}
        />
      ))}
    </>
  )
}

// P2: Dedicated Conflict Resolution Panel for COA
function COAConflictResolutionPanel({
  account,
  flatAccounts,
  taxonomyLines,
  onResolve,
  onClose,
}: {
  account: AccountNode
  flatAccounts: Account[]
  taxonomyLines: ReportingTaxonomyLine[]
  onResolve: (resolution: 'keep_source' | 'use_parent' | 'apply_global' | 'create_new') => void
  onClose: () => void
}) {
  const [resolution, setResolution] = useState<'keep_source' | 'use_parent' | 'apply_global' | 'create_new'>('keep_source')

  const suggestionCode = getSuggestedTaxonomyCode(account.account_type, account.detail_type, account.account_name)
  const suggestedLine = suggestionCode ? taxonomyLines.find((l) => l.code === suggestionCode) : null

  const directMapping = account.reporting_taxonomy_line_id
  const directLine = directMapping ? taxonomyLines.find((l) => l.id === directMapping) : null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6 m-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        data-testid="coa-conflict-resolution-panel"
      >
        <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-gray-900 text-sm">Resolve Taxonomy Conflict</h3>
          <button type="button" onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 mb-4 text-xs">
          <div className="bg-gray-50 rounded p-3 space-y-1">
            <p className="font-medium text-gray-500 uppercase tracking-wide text-[9px]">Account</p>
            <p className="font-bold text-gray-800 text-sm">{account.account_number} — {account.account_name}</p>
            <p className="text-[10px] text-gray-500 font-semibold uppercase">Type: {account.account_type} · Detail: {account.detail_type || '—'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50/50 border border-blue-100 rounded p-3">
              <p className="font-bold text-blue-700 mb-1 text-[9px] uppercase tracking-wide">Direct Mapping</p>
              <code className="text-xs text-blue-900 font-semibold">{directLine ? directLine.name : '—'}</code>
            </div>
            <div className="bg-purple-50/50 border border-purple-100 rounded p-3">
              <p className="font-bold text-purple-700 mb-1 text-[9px] uppercase tracking-wide">Suggested taxonomy (rules)</p>
              <code className="text-xs text-purple-900 font-semibold">{suggestedLine ? suggestedLine.name : '—'}</code>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Resolution Options</label>
          <div className="space-y-2 border border-gray-100 rounded-lg p-3 bg-gray-50/50">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="resolution"
                value="keep_source"
                checked={resolution === 'keep_source'}
                onChange={() => setResolution('keep_source')}
                className="mt-0.5"
              />
              <div className="text-xs">
                <p className="font-bold text-gray-800">Keep Direct Mapping</p>
                <p className="text-gray-500 text-[11px] mt-0.5">Keep the current manual mapping as is (no action).</p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer border-t border-gray-100 pt-2">
              <input
                type="radio"
                name="resolution"
                value="use_parent"
                checked={resolution === 'use_parent'}
                onChange={() => setResolution('use_parent')}
                className="mt-0.5"
              />
              <div className="text-xs">
                <p className="font-bold text-gray-800">Inherit from Parent</p>
                <p className="text-gray-500 text-[11px] mt-0.5">Clear direct mapping to inherit taxonomy line from parent.</p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer border-t border-gray-100 pt-2">
              <input
                type="radio"
                name="resolution"
                value="apply_global"
                checked={resolution === 'apply_global'}
                onChange={() => setResolution('apply_global')}
                className="mt-0.5"
                disabled={!suggestedLine}
              />
              <div className={cn("text-xs", !suggestedLine && "opacity-50")}>
                <p className="font-bold text-gray-800">Apply Suggested Taxonomy</p>
                <p className="text-gray-500 text-[11px] mt-0.5">
                  {suggestedLine 
                    ? `Map to "${suggestedLine.name}" according to type guidelines.` 
                    : "No suggestion available for this account."
                  }
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer border-t border-gray-100 pt-2">
              <input
                type="radio"
                name="resolution"
                value="create_new"
                checked={resolution === 'create_new'}
                onChange={() => setResolution('create_new')}
                className="mt-0.5"
              />
              <div className="text-xs">
                <p className="font-bold text-gray-800">Create New Taxonomy Line</p>
                <p className="text-gray-500 text-[11px] mt-0.5">Redirect to the Taxonomy Administration page to create a custom line.</p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-gray-650 border border-gray-300 rounded-lg hover:bg-gray-50 font-semibold cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { onResolve(resolution); onClose() }}
            className="px-4 py-2 text-xs bg-indigo-650 text-white rounded-lg hover:bg-indigo-700 font-semibold cursor-pointer"
            data-testid="coa-conflict-resolve-btn"
          >
            Apply Resolution
          </button>
        </div>
      </div>
    </div>
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
  const { activeEntity } = useWorkspace()

  const [entityId, setEntityId] = useState<number | ''>(
    searchParams.get('entity') ? Number(searchParams.get('entity')) : (activeEntity?.id ?? '')
  )
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [globalSearch, setGlobalSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  // Column sort — key corresponds to AccountNode field; null = natural tree order
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editState, setEditState] = useState<EditState | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createWithParent, setCreateWithParent] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [moveToState, setMoveToState] = useState<{ account: AccountNode; mode: 'parent' | 'child' } | null>(null)
  const [highlightIds, setHighlightIds] = useState<Set<number>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [previewAccountId, setPreviewAccountId] = useState<number | null>(null)
  const [density, setDensity] = useState<GridDensity>('normal')
  const [showSettings, setShowSettings] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<Set<OptionalCol>>(loadVisibleCols)

  const toggleColumn = useCallback((col: OptionalCol) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col)
      else next.add(col)
      localStorage.setItem('coa-visible-cols', JSON.stringify([...next]))
      return next
    })
  }, [])
  const [conflictAccount, setConflictAccount] = useState<AccountNode | null>(null)

  // Undo/redo
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([])
  const pendingUndoRedoRef = useRef<{ type: 'undo' | 'redo'; entry: UndoEntry } | null>(null)
  const beforeEditRef = useRef<AccountUpdate | null>(null)

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
  const previewAccount = useMemo(
    () => previewAccountId ? flatOrder.find((n) => n.id === previewAccountId) ?? null : null,
    [previewAccountId, flatOrder]
  )

  // Mutations
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: AccountUpdate; beforePatch?: AccountUpdate }) =>
      accountsApi.update(id, patch),
    onSuccess: (_, { id, patch, beforePatch }) => {
      queryClient.invalidateQueries({ queryKey: ['accounts', 'tree', entityId] })
      queryClient.invalidateQueries({ queryKey: ['accounts', 'list', entityId] })
      setEditState(null)
      toast('Account updated', 'success')

      const pendingOp = pendingUndoRedoRef.current
      pendingUndoRedoRef.current = null

      if (pendingOp !== null) {
        if (pendingOp.type === 'undo') {
          setRedoStack((prev) => [...prev, pendingOp.entry])
        } else {
          setUndoStack((prev) => [...prev, pendingOp.entry])
        }
      } else if (beforePatch) {
        const entry: EditEntry = {
          type: 'edit',
          accountId: id,
          description: `edit ${patch.account_name ?? patch.account_number ?? 'account'}`,
          beforePatch,
          afterPatch: patch,
        }
        setUndoStack((prev) => [...prev, entry])
        setRedoStack([])
      }
    },
    onError: (err: Error) => {
      pendingUndoRedoRef.current = null
      setApiError(err.message)
    },
  })

  const bulkMutation = useMutation({
    mutationFn: ({ ids, patch }: { ids: number[]; patch: AccountUpdate }) =>
      accountsApi.bulkUpdate(ids, patch),
    onSuccess: (_, { ids, patch }) => {
      queryClient.invalidateQueries({ queryKey: ['accounts', 'tree', entityId] })
      queryClient.invalidateQueries({ queryKey: ['accounts', 'list', entityId] })
      setSelectedIds(new Set())
      const label = patch.account_status === 'archived' ? 'archived' : 'activated'
      toast(`${ids.length} account${ids.length > 1 ? 's' : ''} ${label}`, 'success')
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

      const entry: ReparentEntry = {
        type: 'reparent',
        accountId: result.account_id,
        oldParentId: result.old_parent_id,
        newParentId: result.new_parent_id,
        description: `${result.account_number} ${result.account_name}${result.new_parent_number ? ` under ${result.new_parent_number}` : ' to root'}`,
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

  // Undo/redo
  const isUndoRedoPending = reparentMutation.isPending || updateMutation.isPending

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || isUndoRedoPending) return
    const entry = undoStack[undoStack.length - 1]
    setUndoStack((prev) => prev.slice(0, -1))
    pendingUndoRedoRef.current = { type: 'undo', entry }
    if (entry.type === 'reparent') {
      reparentMutation.mutate({ id: entry.accountId, parentId: entry.oldParentId })
    } else {
      updateMutation.mutate({ id: entry.accountId, patch: entry.beforePatch })
    }
  }, [undoStack, isUndoRedoPending, reparentMutation, updateMutation])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || isUndoRedoPending) return
    const entry = redoStack[redoStack.length - 1]
    setRedoStack((prev) => prev.slice(0, -1))
    pendingUndoRedoRef.current = { type: 'redo', entry }
    if (entry.type === 'reparent') {
      reparentMutation.mutate({ id: entry.accountId, parentId: entry.newParentId })
    } else {
      updateMutation.mutate({ id: entry.accountId, patch: entry.afterPatch })
    }
  }, [redoStack, isUndoRedoPending, reparentMutation, updateMutation])

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
    beforeEditRef.current = {
      account_number: node.account_number,
      account_name: node.account_name,
      account_type: node.account_type,
      detail_type: node.detail_type ?? null,
      account_status: node.account_status,
      reporting_taxonomy_line_id: node.reporting_taxonomy_line_id ?? null,
      parent_account_id: node.parent_account_id ?? null,
    }
    setEditState({
      accountId: node.id,
      account_number: node.account_number,
      account_name: node.account_name,
      account_type: node.account_type,
      detail_type: node.detail_type ?? '',
      account_status: node.account_status,
      reporting_taxonomy_line_id: node.reporting_taxonomy_line_id ?? '',
      parent_account_id: node.parent_account_id ?? '',
    })
  }

  function handleSave() {
    if (!editState) return
    const beforePatch = beforeEditRef.current ?? undefined
    beforeEditRef.current = null
    updateMutation.mutate({
      id: editState.accountId,
      patch: {
        account_number: editState.account_number || undefined,
        account_name: editState.account_name || undefined,
        account_type: editState.account_type || undefined,
        detail_type: editState.detail_type || null,
        account_status: editState.account_status,
        reporting_taxonomy_line_id: editState.reporting_taxonomy_line_id || null,
        parent_account_id: editState.parent_account_id || null,
      },
      beforePatch,
    })
  }

  // Row actions
  function handleAddChild(node: AccountNode) {
    setCreateWithParent(node.id)
    setShowCreateModal(true)
  }

  function handleDuplicate(node: AccountNode) {
    // Open create modal pre-filled with same type/category
    setCreateWithParent(node.parent_account_id ?? null)
    setShowCreateModal(true)
    toast(`Duplicating ${node.account_name} — fill in the new account number`, 'info')
  }

  function handleArchive(node: AccountNode) {
    updateMutation.mutate({ id: node.id, patch: { account_status: 'archived' } })
  }

  function handleActivate(node: AccountNode) {
    updateMutation.mutate({ id: node.id, patch: { account_status: 'active' } })
  }

  const handleResolveConflict = useCallback((resolution: 'keep_source' | 'use_parent' | 'apply_global' | 'create_new') => {
    if (!conflictAccount) return
    if (resolution === 'keep_source') {
      setConflictAccount(null)
      return
    }
    if (resolution === 'use_parent') {
      updateMutation.mutate({
        id: conflictAccount.id,
        patch: { reporting_taxonomy_line_id: null },
      })
    } else if (resolution === 'apply_global') {
      const suggestionCode = getSuggestedTaxonomyCode(conflictAccount.account_type, conflictAccount.detail_type, conflictAccount.account_name)
      const suggestedLine = suggestionCode ? taxonomyLines.find((l) => l.code === suggestionCode) : null
      if (suggestedLine) {
        updateMutation.mutate({
          id: conflictAccount.id,
          patch: { reporting_taxonomy_line_id: suggestedLine.id },
        })
      }
    } else if (resolution === 'create_new') {
      navigate('/taxonomy-admin')
    }
    setConflictAccount(null)
  }, [conflictAccount, taxonomyLines, updateMutation, navigate])

  // Selection
  const handleToggleSelect = useCallback((nodeId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const selectedRows = useMemo(
    () => flatOrder.filter((n) => selectedIds.has(n.id)),
    [flatOrder, selectedIds]
  )

  // Batch actions
  const batchActions = useMemo(() => [
    {
      key: 'archive',
      label: 'Archive',
      icon: Archive,
      variant: 'danger' as const,
      onClick: (rows: AccountNode[]) => {
        bulkMutation.mutate({ ids: rows.map((r) => r.id), patch: { account_status: 'archived' } })
      },
    },
    {
      key: 'activate',
      label: 'Activate',
      icon: Unlock,
      onClick: (rows: AccountNode[]) => {
        bulkMutation.mutate({ ids: rows.map((r) => r.id), patch: { account_status: 'active' } })
      },
    },
    {
      key: 'export',
      label: 'Export CSV',
      icon: History,
      onClick: (rows: AccountNode[]) => {
        const lines = ['Account Number,Account Name,Type,Detail Type,Status,Reporting Line']
        rows.forEach((r) => {
          const tl = taxonomyLines.find((t) => t.id === r.reporting_taxonomy_line_id)?.name ?? ''
          lines.push(`${r.account_number},"${r.account_name}",${r.account_type},"${r.detail_type ?? ''}",${r.account_status},"${tl}"`)
        })
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'accounts_selected.csv'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      },
    },
  ], [bulkMutation, taxonomyLines])

  // Hierarchy context menu
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

  // Drag/drop
  const handleDragStart = useCallback((
    e: React.DragEvent<HTMLTableRowElement>,
    nodeId: number,
    subtreeIds: Set<number>
  ) => {
    e.dataTransfer.effectAllowed = 'move'
    setDragNodeId(nodeId)
    dragSubtreeIdsRef.current = subtreeIds
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLTableRowElement>, nodeId: number) => {
    e.preventDefault()
    if (dragSubtreeIdsRef.current.has(nodeId)) { e.dataTransfer.dropEffect = 'none'; return }
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

  const handleDrop = useCallback((e: React.DragEvent<HTMLTableRowElement>, targetNodeId: number) => {
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
    if (dragId === parentId) return
    reparentMutation.mutate({ id: dragId, parentId })
  }, [dragNodeId, dropTarget, flatOrder, reparentMutation])

  // Expand/collapse
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

  // Filtering
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
      const statusMatch = showInactive || node.account_status === statusFilter || statusFilter === ''
      const searchMatch = !globalSearch || matchesSearch(node, globalSearch)
      if (typeMatch && statusMatch && searchMatch) return [{ ...node, children: filteredChildren }]
      if (filteredChildren.length > 0) return [{ ...node, children: filteredChildren }]
      return []
    })
  }

  const typeCounts = countByType(tree)

  // Sort each tree level by the chosen column (preserves hierarchy).
  function sortNodes(nodes: AccountNode[]): AccountNode[] {
    if (!sortKey) return nodes
    const sorted = [...nodes].sort((a, b) => {
      let av = ''
      let bv = ''
      if (sortKey === 'conflict') {
        const flagsA = getAccountValidationFlags(a, flatAccounts, taxonomyLines)
        const flagsB = getAccountValidationFlags(b, flatAccounts, taxonomyLines)
        av = flagsA.some((f) => f.code === 'conflict') ? '1' : '0'
        bv = flagsB.some((f) => f.code === 'conflict') ? '1' : '0'
      } else {
        av = String((a as Record<string, unknown>)[sortKey] ?? '')
        bv = String((b as Record<string, unknown>)[sortKey] ?? '')
      }
      const cmp = av.localeCompare(bv, undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted.map((n) => ({ ...n, children: sortNodes(n.children) }))
  }
  function handleColSort(key: string) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filteredTree = sortNodes(filterTree(tree))
  const contextMenuAccount = contextMenu ? flatOrder.find((n) => n.id === contextMenu.accountId) ?? null : null
  const lastUndo = undoStack[undoStack.length - 1]
  const lastRedo = redoStack[redoStack.length - 1]

  const hierarchyCtxValue: HierarchyCtxValue = {
    dragNodeId, dropTarget, collapsedIds, highlightIds, selectedIds,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
    onDrop: handleDrop,
    onToggleCollapsed: handleToggleCollapsed,
    onToggleSelect: handleToggleSelect,
    onPreview: setPreviewAccountId,
  }

  return (
    <PageLayout
      title="Chart of Accounts"
      subtitle="Entity-specific account structure with reporting taxonomy mapping"
      breadcrumb={
        <Breadcrumb items={[{ label: 'Client Books', href: '/client-data/imports' }, { label: 'Chart of Accounts' }]} />
      }
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/client-data/imports/coa')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            Import COA
          </button>
          <button
            type="button"
            onClick={() => navigate('/client-data/taxonomy-mapping')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
          >
            Open Mapping
          </button>
        </div>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Toolbar */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 mb-4 shadow-xs flex items-center gap-3 flex-wrap">
        <div className="w-64">
          <EntitySelect value={entityId} onChange={(v) => { setEntityId(v); setEditState(null); setSelectedIds(new Set()) }} />
        </div>

        {entityId && (
          <>
            {/* Global search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search accounts…"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="pl-9 pr-8 h-9 text-xs border border-slate-200 rounded-lg w-56 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-all hover:bg-slate-50/50 font-medium"
                data-testid="coa-search"
              />
              {globalSearch && (
                <button
                  type="button"
                  onClick={() => setGlobalSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 transition-colors p-0.5 rounded hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 h-9 px-4 text-xs bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-all shadow-sm cursor-pointer"
              data-testid="create-account-btn"
            >
              <Plus className="w-4 h-4" /> Create Account
            </button>
            <button
              type="button"
              onClick={() => navigate('/coa-import')}
              className="flex items-center gap-2 h-9 px-4 text-xs border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold rounded-lg bg-white hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
            >
              <Upload className="w-4 h-4 text-slate-500" /> Import COA
            </button>

            <div className="flex items-center gap-1.5 ml-auto">
              {/* Undo / Redo */}
              <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden shadow-xs">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0 || isUndoRedoPending}
                  className="flex items-center justify-center w-9 h-9 text-slate-500 hover:text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none border-r border-slate-150 transition-colors cursor-pointer"
                  title={lastUndo ? `Undo: ${lastUndo.description} (Ctrl+Z)` : 'Nothing to undo'}
                  data-testid="undo-btn"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={redoStack.length === 0 || isUndoRedoPending}
                  className="flex items-center justify-center w-9 h-9 text-slate-500 hover:text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title={lastRedo ? `Redo: ${lastRedo.description} (Ctrl+Shift+Z)` : 'Nothing to redo'}
                  data-testid="redo-btn"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
              </div>

              {/* Expand / Collapse */}
              <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden shadow-xs">
                <button 
                  type="button" 
                  onClick={expandAll} 
                  className="flex items-center justify-center w-9 h-9 text-slate-500 hover:text-slate-750 hover:bg-slate-50 border-r border-slate-150 transition-colors cursor-pointer" 
                  title="Expand all" 
                  data-testid="expand-all-btn"
                >
                  <ChevronsUpDown className="w-4 h-4" />
                </button>
                <button 
                  type="button" 
                  onClick={collapseAll} 
                  className="flex items-center justify-center w-9 h-9 text-slate-500 hover:text-slate-750 hover:bg-slate-50 transition-colors cursor-pointer" 
                  title="Collapse all" 
                  data-testid="collapse-all-btn"
                >
                  <ChevronsDownUp className="w-4 h-4" />
                </button>
              </div>

              {/* Settings */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSettings((v) => !v)}
                  className={cn(
                    'w-9 h-9 border rounded-lg flex items-center justify-center shadow-xs transition-colors cursor-pointer',
                    showSettings 
                      ? 'border-indigo-400 bg-indigo-50/50 text-indigo-650' 
                      : 'border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  )}
                  title="Display settings"
                  data-testid="settings-btn"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
                {showSettings && (
                  <SettingsPanel
                    density={density}
                    onDensity={setDensity}
                    showInactive={showInactive}
                    onShowInactive={(v) => { setShowInactive(v); if (v) setStatusFilter('') }}
                    visibleColumns={visibleColumns}
                    onToggleColumn={toggleColumn}
                    entityId={entityId}
                    onClose={() => setShowSettings(false)}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Undo label */}
      {lastUndo && (
        <div className="flex items-center gap-1.5 text-xs text-slate-650 bg-slate-50 border border-slate-200/65 rounded-lg px-3 py-1.5 mb-3 w-fit animate-in fade-in duration-200">
          <History className="w-3.5 h-3.5 text-slate-400" />
          <span>Last action: <strong className="font-semibold text-slate-700">{lastUndo.description}</strong>. Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono shadow-xs">Ctrl+Z</kbd> to undo.</span>
        </div>
      )}

      {!entityId ? (
        <div className="bg-white border border-slate-200/80 rounded-xl p-12 text-center text-sm text-slate-400 shadow-xs">
          Select an entity to view its Chart of Accounts
        </div>
      ) : isLoading ? (
        <div className="bg-white border border-slate-200/80 rounded-xl p-12 text-center text-sm text-slate-400 shadow-xs">
          Loading accounts…
        </div>
      ) : tree.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-xl p-12 text-center shadow-xs">
          <p className="text-sm text-slate-500 mb-3">No accounts imported yet for this entity.</p>
          <button
            type="button"
            onClick={() => navigate('/coa-import')}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
          >
            Import Chart of Accounts
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Type filter chips */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-50/50 border border-slate-200/50 p-2 rounded-xl">
            <button
              type="button"
              onClick={() => setTypeFilter('')}
              className={cn(
                "px-3.5 py-1 rounded-full text-xs font-semibold border transition-all duration-200 select-none shadow-xs cursor-pointer",
                !typeFilter
                  ? "bg-slate-900 border-slate-900 text-white"
                  : "bg-white text-slate-655 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              All · {Object.values(typeCounts).reduce((a, b) => a + b, 0)}
            </button>
            {Object.entries(typeCounts).map(([type, count]) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
                className={cn(
                  "px-3.5 py-1 rounded-full text-xs font-semibold border capitalize transition-all duration-200 select-none shadow-xs cursor-pointer",
                  typeFilter === type
                    ? ACTIVE_TYPE_CHIP_COLORS[type]
                    : "bg-white text-slate-655 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                {type} · {count}
              </button>
            ))}

            {!showInactive && (
              <div className="ml-auto flex items-center gap-1.5 pr-1">
                <label className="text-xs text-slate-500 font-semibold">Status:</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border border-slate-200 bg-white rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 font-medium"
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                  <option value="deprecated">Deprecated</option>
                </select>
              </div>
            )}
          </div>

          {/* Selection summary */}
          {selectedIds.size > 0 && (
            <div className="text-xs font-semibold text-indigo-700 bg-indigo-50/60 border border-indigo-150 rounded-lg px-3 py-2 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
              <span>{selectedIds.size} account{selectedIds.size > 1 ? 's' : ''} selected</span>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="underline hover:no-underline cursor-pointer">
                Clear
              </button>
            </div>
          )}

          {/* Hint */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pl-1">
            <span className="font-semibold">Pro-tips:</span>
            <span>Drag <GripVertical className="inline w-3.5 h-3.5" /> to reparent · Right-click row for hierarchy options · Click name to preview details · Press <kbd className="px-1 py-0.5 bg-slate-50 border border-slate-200 rounded font-mono text-[9px]">Ctrl+Z</kbd> / <kbd className="px-1 py-0.5 bg-slate-50 border border-slate-200 rounded font-mono text-[9px]">Ctrl+Shift+Z</kbd></span>
          </div>

          {/* Main layout: table + optional preview sidebar */}
          <div className="flex gap-0 rounded-xl border border-slate-200/80 shadow-sm overflow-hidden bg-white">
            {/* Table */}
            <div className="flex-1 overflow-x-auto">
              <HierarchyCtx.Provider value={hierarchyCtxValue}>
                <table className="w-full text-sm min-w-[980px]">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200/80 sticky top-0 z-10 backdrop-blur-xs">
                    <tr>
                      <th className="px-3 py-3 w-8 text-left">
                        <input
                          type="checkbox"
                          checked={filteredTree.length > 0 && buildFlatOrder(filteredTree).every((n) => selectedIds.has(n.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(new Set(buildFlatOrder(filteredTree).map((n) => n.id)))
                            } else {
                              setSelectedIds(new Set())
                            }
                          }}
                          className="rounded border-slate-350 text-indigo-600 focus:ring-indigo-500/20 focus:ring-2 focus:ring-offset-0 transition-all"
                          title="Select all visible"
                          data-testid="select-all-checkbox"
                        />
                      </th>
                      <th className="px-1 py-3 w-5" />
                      {([
                        ['account_number', 'Acct #', 'w-24', false],
                        ['account_name', 'Account Name', '', false],
                        ['account_type', 'Type', 'w-24', false],
                        ['detail_type', 'Detail Type', 'w-36', true],
                        ['account_status', 'Status', 'w-24', false],
                        ['reporting_taxonomy_line_id', 'Reporting Line', 'w-44', true],
                        ['conflict', 'Conflict', 'w-24', true],
                        ['parent_account_id', 'Parent', 'w-28', true],
                      ] as [string, string, string, boolean][]).filter(([key, , , optional]) =>
                        !optional || visibleColumns.has(key as OptionalCol)
                      ).map(([key, label, width]) => (
                        <th
                          key={key}
                          className={`px-3 py-3 text-left cursor-pointer select-none hover:bg-slate-100 transition-colors ${width}`}
                          onClick={() => handleColSort(key)}
                          data-testid={`col-sort-${key}`}
                        >
                          <span className="flex items-center gap-1 font-bold">
                            {label}
                            {sortKey === key ? (
                              sortDir === 'asc'
                                ? <ChevronUp className="w-3.5 h-3.5 text-indigo-600" />
                                : <ChevronDown className="w-3.5 h-3.5 text-indigo-600" />
                            ) : (
                              <ChevronsUpDown className="w-3.5 h-3.5 opacity-30 text-slate-400 group-hover:opacity-100 transition-opacity" />
                            )}
                          </span>
                        </th>
                      ))}
                      <th className="px-3 py-3 w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTree.length === 0 ? (
                      <tr>
                        <td colSpan={7 + visibleColumns.size} className="px-4 py-8 text-center text-xs text-slate-400">
                          No accounts match the current filter
                        </td>
                      </tr>
                    ) : (
                      filteredTree.map((node) => (
                        <AccountRow
                          key={node.id}
                          node={node}
                          depth={0}
                          density={density}
                          taxonomyLines={taxonomyLines}
                          flatAccounts={flatAccounts}
                          editState={editState}
                          onEdit={handleEdit}
                          onSave={handleSave}
                          onCancel={() => setEditState(null)}
                          onEditChange={(patch) => setEditState((prev) => prev ? { ...prev, ...patch } : prev)}
                          isSaving={updateMutation.isPending}
                          onOpenMenu={handleOpenMenu}
                          onAddChild={handleAddChild}
                          onDuplicate={handleDuplicate}
                          onArchive={handleArchive}
                          onActivate={handleActivate}
                          onResolveConflict={setConflictAccount}
                          visibleColumns={visibleColumns}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </HierarchyCtx.Provider>
            </div>

            {/* Account preview sidebar */}
            {previewAccount && (
              <AccountPreviewSidebar
                account={previewAccount}
                allAccounts={flatAccounts}
                taxonomyLines={taxonomyLines}
                onClose={() => setPreviewAccountId(null)}
                onEdit={() => handleEdit(previewAccount)}
                onAddChild={() => handleAddChild(previewAccount)}
              />
            )}
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

      {/* Move To modal */}
      {moveToState && (
        <MoveToModal
          mode={moveToState.mode}
          account={moveToState.account}
          flatAccounts={flatAccounts}
          onSelect={(targetId) => {
            if (moveToState.mode === 'parent') {
              reparentMutation.mutate({ id: moveToState.account.id, parentId: targetId })
            } else {
              if (targetId !== null) reparentMutation.mutate({ id: targetId, parentId: moveToState.account.id })
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
          onClose={() => { setShowCreateModal(false); setCreateWithParent(null) }}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['accounts', 'tree', entityId] })
            queryClient.invalidateQueries({ queryKey: ['accounts', 'list', entityId] })
          }}
        />
      )}

      {/* Conflict Resolution Modal */}
      {conflictAccount && (
        <COAConflictResolutionPanel
          account={conflictAccount}
          flatAccounts={flatAccounts}
          taxonomyLines={taxonomyLines}
          onResolve={handleResolveConflict}
          onClose={() => setConflictAccount(null)}
        />
      )}

      {/* Batch action bar */}
      <BatchActionBar
        selectedCount={selectedIds.size}
        selectedRows={selectedRows}
        actions={batchActions}
        onClear={() => setSelectedIds(new Set())}
        totalCount={buildFlatOrder(filteredTree).length}
        onSelectAll={() => setSelectedIds(new Set(buildFlatOrder(filteredTree).map((n) => n.id)))}
      />
    </PageLayout>
  )
}
