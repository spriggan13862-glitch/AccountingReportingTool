import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, ChevronDown, Plus, Pencil, X, Check, Download, Upload,
  RefreshCw, Copy, Trash2, BookOpen, AlertCircle, CheckCircle, Search,
  Filter, Settings, Flag, ArrowRight, ArrowLeft, Zap, Info, ShieldAlert,
  Sparkles, SlidersHorizontal, Eye, EyeOff, Lock, Unlock
} from 'lucide-react'
import { reportingTaxonomyApi } from '@/api/reportingTaxonomy'
import type { TaxonomyLineCreate, TaxonomyLineUpdate } from '@/api/reportingTaxonomy'
import { reportingViewsApi } from '@/api/reportingViews'
import { accountsApi } from '@/api/accounts'
import { tbImportApi } from '@/api/tbImport'
import { entitiesApi } from '@/api/entities'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { useToast } from '@/providers/ToastProvider'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { useOrg } from '@/providers/OrgProvider'
import type { ReportingTaxonomyLine, ReportingTaxonomyView, TaxonomyImportPreview, Account } from '@/types'
import { cn } from '@/utils/cn'

// ---------------------------------------------------------------------------
// Suggestion Engine Mappings
// ---------------------------------------------------------------------------

const AUTHORITATIVE_QB_TYPES: Record<string, string> = {
  "fixed assets":                     "property_equipment",
  "fixed asset":                      "property_equipment",
  "accounts receivable (a/r)":        "accounts_receivable",
  "accounts receivable":              "accounts_receivable",
  "accounts payable (a/p)":           "accounts_payable",
  "accounts payable":                 "accounts_payable",
  "cost of goods sold":               "cogs",
  "credit card":                      "short_term_debt",
  "other current assets":             "other_current_assets",
  "other current asset":              "other_current_assets",
  "other current liabilities":        "other_current_liabilities",
  "other current liability":          "other_current_liabilities",
  "long term liabilities":            "long_term_debt",
  "long-term liabilities":            "long_term_debt",
}

const QB_TYPE_TO_TAXONOMY: Record<string, string> = {
  "bank":             "cash_equivalents",
  "income":           "revenue",
  "other income":     "other_income",
  "revenue":          "revenue",
  "expenses":         "operating_expenses",
  "expense":          "operating_expenses",
  "other expenses":   "other_expense",
  "other expense":    "other_expense",
  "equity":           "other_equity",
  "other assets":     "other_non_current_assets",
  "other asset":      "other_non_current_assets",
}

const DETAIL_TYPE_TO_TAXONOMY: Record<string, string> = {
  "checking":                     "cash_equivalents",
  "savings":                      "cash_equivalents",
  "money market":                 "cash_equivalents",
  "cash on hand":                 "cash_equivalents",
  "bank":                         "cash_equivalents",
  "accounts receivable":          "accounts_receivable",
  "inventory":                    "inventory",
  "prepaid expenses":             "prepaid_expenses",
  "other current assets":         "other_current_assets",
  "employee cash advances":       "other_current_assets",
  "retainage":                    "other_current_assets",
  "undeposited funds":            "cash_equivalents",
  "fixed asset":                  "property_equipment",
  "buildings":                    "property_equipment",
  "machinery & equipment":        "property_equipment",
  "vehicles":                     "property_equipment",
  "leasehold improvements":       "property_equipment",
  "accumulated depreciation":     "property_equipment",
  "intangible assets":            "intangible_assets",
  "accumulated amortization":     "intangible_assets",
  "licenses":                     "intangible_assets",
  "goodwill":                     "intangible_assets",
  "notes receivable":             "other_non_current_assets",
  "security deposits":            "other_non_current_assets",
  "other long-term assets":       "other_non_current_assets",
  "accounts payable":             "accounts_payable",
  "credit card":                  "short_term_debt",
  "line of credit":               "short_term_debt",
  "loan payable":                 "short_term_debt",
  "payroll tax payable":          "accrued_liabilities",
  "accrued liabilities":          "accrued_liabilities",
  "sales tax payable":            "accrued_liabilities",
  "insurance payable":            "accrued_liabilities",
  "deferred revenue":             "deferred_revenue",
  "other current liabilities":    "other_current_liabilities",
  "notes payable":                "long_term_debt",
  "long term liabilities":        "long_term_debt",
  "shareholder notes payable":    "long_term_debt",
  "other long term liabilities":  "other_lt_liabilities",
  "common stock":                 "common_stock",
  "preferred stock":              "common_stock",
  "paid-in capital or surplus":   "common_stock",
  "retained earnings":            "retained_earnings",
  "owner's equity":               "retained_earnings",
  "partner's equity":             "retained_earnings",
  "opening balance equity":       "retained_earnings",
  "treasury stock":               "other_equity",
  "partner distributions":        "other_equity",
  "service/fee income":           "revenue",
  "sales of product income":      "revenue",
  "other primary income":         "revenue",
  "non-profit income":            "revenue",
  "income":                       "revenue",
  "cost of goods sold":           "cogs",
  "supplies & materials - cogs":  "cogs",
  "other costs of services - cos":"cogs",
  "equipment rental - cogs":      "cogs",
  "advertising/promotional":      "operating_expenses",
  "office expenses":              "operating_expenses",
  "payroll expenses":             "operating_expenses",
  "rent or lease of buildings":   "operating_expenses",
  "utilities":                    "operating_expenses",
  "insurance":                    "operating_expenses",
  "legal & professional fees":    "operating_expenses",
  "repair & maintenance":         "operating_expenses",
  "meals":                        "operating_expenses",
  "travel":                       "operating_expenses",
  "bank charges":                 "operating_expenses",
  "depreciation":                 "depreciation_amort",
  "amortization":                 "depreciation_amort",
  "interest paid":                "interest_expense",
  "income tax expense":           "income_tax_expense",
  "other business expenses":      "other_expense",
  "other income":                 "other_income",
  "dividend income":              "other_income",
  "interest earned":              "other_income",
  "other expense":                "other_expense",
  "penalties & settlements":      "other_expense",
  "exchange gain or loss":        "other_expense",
}

const TAX_LINE_TO_TAXONOMY: Record<string, string> = {
  "b/s-assets: cash":                                         "cash_equivalents",
  "b/s-assets: u.s. government obligations":                  "cash_equivalents",
  "b/s-assets: accts. rec. and trade notes":                  "accounts_receivable",
  "b/s-assets: accts receivable":                             "accounts_receivable",
  "b/s-assets: inventories":                                  "inventory",
  "b/s-assets: prepaid expenses":                             "prepaid_expenses",
  "b/s-assets: other current assets":                         "other_current_assets",
  "b/s-assets: tax-exempt securities":                        "other_current_assets",
  "b/s-assets: loans to shareholders":                        "other_non_current_assets",
  "b/s-assets: mortgage and real estate loans":               "other_non_current_assets",
  "b/s-assets: investments":                                  "other_non_current_assets",
  "b/s-assets: depreciable assets":                           "property_equipment",
  "b/s-assets: land":                                         "property_equipment",
  "b/s-assets: intangible assets":                            "intangible_assets",
  "b/s-assets: other assets":                                 "other_non_current_assets",
  "b/s-liabs/cap: accounts payable":                          "accounts_payable",
  "b/s-liabs/cap: mtgs., notes, bonds pay. < 1 yr":           "short_term_debt",
  "b/s-liabs/cap: mortgages, notes, bonds pay. < 1 year":     "short_term_debt",
  "b/s-liabs/cap: other current liabilities":                 "other_current_liabilities",
  "b/s-liabs/cap: loans from shareholders":                   "long_term_debt",
  "b/s-liabs/cap: l-t mortgage/note/bonds pay.":              "long_term_debt",
  "b/s-liabs/cap: long-term liabilities":                     "long_term_debt",
  "b/s-liabs/cap: other liabilities":                         "other_lt_liabilities",
  "b/s-liabs/cap: capital stock":                             "common_stock",
  "b/s-liabs/cap: additional paid-in capital":                "common_stock",
  "b/s-liabs/cap: paid-in or capital surplus":                "common_stock",
  "b/s-liabs/cap: retained earnings":                         "retained_earnings",
  "b/s-liabs/cap: adjustments to s/h equity":                 "other_equity",
  "b/s-liabs/cap: less cost of treasury stock":               "other_equity",
  "income: gross receipts or sales":                          "revenue",
  "income: gross receipts":                                   "revenue",
  "income: rents":                                            "revenue",
  "income: other income":                                     "other_income",
  "income: dividends":                                        "other_income",
  "income: interest":                                         "other_income",
  "income: interest income":                                  "other_income",
  "income: capital gain (loss)":                              "other_income",
  "cogs-form 1125-a: purchases":                              "cogs",
  "cogs-form 1125-a: cost of labor":                          "cogs",
  "cogs-form 1125-a: cost of goods sold":                     "cogs",
  "cogs-form 1125-a: additional section 263a costs":          "cogs",
  "cogs-form 1125-a: other costs":                            "cogs",
  "cogs: purchases":                                          "cogs",
  "deductions: compensation of officers":                     "operating_expenses",
  "deductions: salaries and wages":                           "operating_expenses",
  "deductions: repairs and maintenance":                      "operating_expenses",
  "deductions: bad debts":                                    "operating_expenses",
  "deductions: rents":                                        "operating_expenses",
  "deductions: taxes and licenses":                           "operating_expenses",
  "deductions: depreciation":                                 "depreciation_amort",
  "deductions: amortization":                                 "depreciation_amort",
  "deductions: depletion":                                    "depreciation_amort",
  "deductions: advertising":                                  "operating_expenses",
  "deductions: pension/profit sharing plans":                 "operating_expenses",
  "deductions: employee benefit programs":                    "operating_expenses",
  "deductions: interest expense":                             "interest_expense",
  "deductions: other deductions":                             "operating_expenses",
  "deductions: income tax":                                   "income_tax_expense",
  "schedule c: gross receipts or sales":                      "revenue",
  "schedule c: other income":                                 "other_income",
  "schedule c: advertising":                                  "operating_expenses",
  "schedule c: wages":                                        "operating_expenses",
  "schedule c: rent or lease":                                "operating_expenses",
  "schedule c: utilities":                                    "operating_expenses",
  "schedule c: office expense":                               "operating_expenses",
  "schedule c: cost of goods sold":                           "cogs",
}

const BAD_TAX_LINE_PATTERNS = [
  "obsolete", "inactive", "n/a", "not applicable", "none",
  "suppressed", "omit", "do not use", "not in use", "-none-",
]

const ACCOUNT_NAME_KEYWORDS: [string, string][] = [
  ["cash",                "cash_equivalents"],
  ["checking",            "cash_equivalents"],
  ["savings",             "cash_equivalents"],
  ["petty cash",          "cash_equivalents"],
  ["money market",        "cash_equivalents"],
  ["accounts receivable", "accounts_receivable"],
  [" a/r",                "accounts_receivable"],
  ["inventory",           "inventory"],
  ["prepaid",             "prepaid_expenses"],
  ["fixed asset",         "property_equipment"],
  ["equipment",           "property_equipment"],
  ["building",            "property_equipment"],
  ["vehicle",             "property_equipment"],
  ["machinery",           "property_equipment"],
  ["accumulated deprec",  "property_equipment"],
  ["leasehold",           "property_equipment"],
  ["accumulated deprec",  "property_equipment"],
  ["accumulated amort",   "intangible_assets"],
  ["intangible",          "intangible_assets"],
  ["goodwill",            "intangible_assets"],
  ["accounts payable",    "accounts_payable"],
  [" a/p",                "accounts_payable"],
  ["credit card",         "short_term_debt"],
  ["line of credit",      "short_term_debt"],
  ["loc -",               "short_term_debt"],
  ["other current liab",  "other_current_liabilities"],
  ["payroll tax",         "accrued_liabilities"],
  ["accrued",             "accrued_liabilities"],
  ["sales tax payable",   "accrued_liabilities"],
  ["deferred revenue",    "deferred_revenue"],
  ["long term",           "long_term_debt"],
  ["mortgage",            "long_term_debt"],
  ["note payable",        "long_term_debt"],
  ["common stock",        "common_stock"],
  ["paid-in capital",     "common_stock"],
  ["retained earnings",   "retained_earnings"],
  ["owner",               "retained_earnings"],
  ["gross sales",         "revenue"],
  ["revenue",             "revenue"],
  ["sales",               "revenue"],
  ["income",              "revenue"],
  ["cost of goods",       "cogs"],
  ["cogs",                "cogs"],
  ["cost of sales",       "cogs"],
  ["purchases",           "cogs"],
  ["depreciation",        "depreciation_amort"],
  ["amortization",        "depreciation_amort"],
  ["interest expense",    "interest_expense"],
  ["income tax",          "income_tax_expense"],
  ["other income",        "other_income"],
  ["dividend",            "other_income"],
  ["other expense",       "other_expense"],
]

function isBadTaxLine(taxLine: string): boolean {
  const norm = taxLine.trim().toLowerCase()
  return BAD_TAX_LINE_PATTERNS.some(pat => norm.includes(pat))
}

function getSuggestedTaxonomyCode(
  accountType?: string | null,
  taxLine?: string | null,
  detailType?: string | null,
  accountName?: string | null
): { code: string | null; evidence: string | null } {
  if (accountType) {
    const norm = accountType.trim().toLowerCase()
    const code = AUTHORITATIVE_QB_TYPES[norm]
    if (code) {
      return { code, evidence: `Type = ${accountType}` }
    }
  }

  if (taxLine && !isBadTaxLine(taxLine)) {
    const norm = taxLine.trim().toLowerCase()
    const code = TAX_LINE_TO_TAXONOMY[norm]
    if (code) {
      return { code, evidence: `Tax Line = ${taxLine}` }
    }
    for (const [key, val] of Object.entries(TAX_LINE_TO_TAXONOMY)) {
      if (norm.startsWith(key) || key.startsWith(norm)) {
        return { code: val, evidence: `Tax Line = ${taxLine}` }
      }
    }
    if (norm.startsWith("b/s-assets")) {
      return { code: "other_current_assets", evidence: "Tax Line prefix = B/S-Assets" }
    }
    if (norm.startsWith("b/s-liabs")) {
      return { code: "other_current_liabilities", evidence: "Tax Line prefix = B/S-Liabs" }
    }
    if (norm.startsWith("income")) {
      return { code: "revenue", evidence: "Tax Line prefix = Income" }
    }
    if (norm.startsWith("cogs")) {
      return { code: "cogs", evidence: "Tax Line prefix = COGS" }
    }
    if (norm.startsWith("deductions") || norm.startsWith("schedule c")) {
      return { code: "operating_expenses", evidence: "Tax Line prefix = Deductions" }
    }
  }

  const GENERAL_TYPE_CODES = new Set(["operating_expenses", "other_equity"])
  let typeFallbackCode: string | null = null
  let typeFallbackEvidence: string | null = null
  if (accountType) {
    const norm = accountType.trim().toLowerCase()
    const code = QB_TYPE_TO_TAXONOMY[norm]
    if (code) {
      if (GENERAL_TYPE_CODES.has(code)) {
        typeFallbackCode = code
        typeFallbackEvidence = `Type = ${accountType}`
      } else {
        return { code, evidence: `Type = ${accountType}` }
      }
    }
  }

  if (detailType) {
    const norm = detailType.trim().toLowerCase()
    const code = DETAIL_TYPE_TO_TAXONOMY[norm]
    if (code) {
      return { code, evidence: `Detail Type = ${detailType}` }
    }
    for (const [key, val] of Object.entries(DETAIL_TYPE_TO_TAXONOMY)) {
      if (key.includes(norm) || norm.includes(key)) {
        return { code: val, evidence: `Detail Type ~ ${detailType}` }
      }
    }
  }

  if (accountName) {
    const norm = accountName.trim().toLowerCase()
    for (const [keyword, code] of ACCOUNT_NAME_KEYWORDS) {
      if (norm.includes(keyword)) {
        return { code, evidence: `Name keyword: ${keyword}` }
      }
    }
  }

  if (typeFallbackCode) {
    return { code: typeFallbackCode, evidence: typeFallbackEvidence }
  }

  return { code: null, evidence: null }
}

function getConfidenceColor(evidence: string | null): string {
  if (!evidence) return "bg-slate-100 text-slate-600 border-slate-200"
  if (evidence.includes("Type = ") && [
    "Fixed Asset", "Accounts Receivable", "Accounts Payable",
    "Cost of Goods Sold", "Credit Card",
  ].some(auth => evidence.includes(auth))) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200"
  }
  if (evidence.includes("Tax Line")) return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (evidence.includes("Type =") || evidence.includes("Detail Type")) {
    return "bg-amber-50 text-amber-700 border-amber-200"
  }
  return "bg-slate-100 text-slate-600 border-slate-200"
}

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
  parent_id: number | null
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
// Taxonomy Line Row component (Original - kept for tab admin)
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
  visibleColumns: {
    code: boolean
    name: boolean
    statement: boolean
    order: boolean
    balance: boolean
    sign: boolean
    description: boolean
  }
}

function TaxonomyLineRow({
  node, allLines, editState, onEdit, onSave, onCancel, onEditChange, onDelete, isSaving, depth, visibleColumns
}: LineRowProps) {
  const [expanded, setExpanded] = useState(true)
  const isEditing = editState?.lineId === node.id
  const hasChildren = node.children.length > 0

  return (
    <>
      <tr className={`hover:bg-slate-50 border-b border-slate-100 ${isEditing ? 'bg-indigo-50/50' : ''} ${!node.active ? 'opacity-50' : ''}`}>
        {visibleColumns.code && (
          <td className="px-3 py-2 text-xs font-mono text-slate-500 w-36">
            {node.code}
          </td>
        )}
        {visibleColumns.name && (
          <td className="px-3 py-2" style={{ paddingLeft: `${12 + depth * 20}px` }}>
            <div className="flex items-center gap-1">
              {hasChildren ? (
                <button type="button" onClick={() => setExpanded((v) => !v)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              ) : (
                <span className="w-3.5 h-3.5 inline-block" />
              )}
              {isEditing ? (
                <div className="flex flex-col gap-1 w-full max-w-xs">
                  <input
                    type="text"
                    value={editState.name}
                    onChange={(e) => onEditChange({ name: e.target.value })}
                    className="w-full border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                  />
                  <div className="flex items-center gap-3 mt-1.5">
                    <label className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold">
                      Parent:
                      <select
                        value={editState.parent_id || ''}
                        onChange={(e) => onEditChange({ parent_id: e.target.value ? Number(e.target.value) : null })}
                        className="border border-slate-300 rounded px-1 py-0.5 bg-white text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-400 font-normal"
                      >
                        <option value="">(None)</option>
                        {allLines
                          .filter((l) => l.id !== node.id)
                          .map((l) => (
                            <option key={l.id} value={l.id}>{l.code} - {l.name}</option>
                          ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editState.is_subtotal}
                        onChange={(e) => onEditChange({ is_subtotal: e.target.checked })}
                        className="rounded border-slate-300 text-indigo-650 focus:ring-indigo-500/20"
                      />
                      Subtotal
                    </label>
                  </div>
                </div>
              ) : (
                <span className={`text-sm ${node.is_subtotal ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
                  {node.name}
                  {node.is_subtotal && <span className="ml-1 text-xs text-slate-400 font-normal">(subtotal)</span>}
                </span>
              )}
            </div>
          </td>
        )}
        {visibleColumns.statement && (
          <td className="px-3 py-2">
            {isEditing ? (
              <select
                value={editState.statement_type || ''}
                onChange={(e) => onEditChange({ statement_type: e.target.value || '' })}
                className="border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none bg-white focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">(None)</option>
                {STATEMENT_TYPES.map((st) => (
                  <option key={st.value} value={st.value}>{st.label}</option>
                ))}
              </select>
            ) : (
              node.statement_type && (
                <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${STMT_COLORS[node.statement_type] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  {STATEMENT_TYPES.find((s) => s.value === node.statement_type)?.label ?? node.statement_type}
                </span>
              )
            )}
          </td>
        )}
        {visibleColumns.order && (
          <td className="px-3 py-2 text-xs text-slate-500 w-16">
            {isEditing ? (
              <input
                type="number"
                value={editState.sort_order}
                onChange={(e) => onEditChange({ sort_order: Number(e.target.value) })}
                className="w-16 border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
              />
            ) : (
              node.sort_order
            )}
          </td>
        )}
        {visibleColumns.balance && (
          <td className="px-3 py-2 text-xs text-slate-500 w-16">
            {isEditing ? (
              <select
                value={editState.normal_balance || ''}
                onChange={(e) => onEditChange({ normal_balance: e.target.value || '' })}
                className="border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none bg-white focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">(None)</option>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            ) : (
              node.normal_balance && (
                <span className={`px-1.5 py-0.5 rounded text-xs capitalize ${node.normal_balance === 'debit' ? 'text-blue-600' : 'text-orange-600'}`}>
                  {node.normal_balance}
                </span>
              )
            )}
          </td>
        )}
        {visibleColumns.sign && (
          <td className="px-3 py-2 text-xs text-slate-400 w-20">
            {isEditing ? (
              <select
                value={editState.sign_behavior}
                onChange={(e) => onEditChange({ sign_behavior: e.target.value })}
                className="border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none bg-white focus:ring-1 focus:ring-indigo-400"
              >
                {SIGN_BEHAVIORS.map((sb) => (
                  <option key={sb.value} value={sb.value}>{sb.label}</option>
                ))}
              </select>
            ) : (
              node.sign_behavior !== 'positive' && (
                <span className="text-amber-600 capitalize">{node.sign_behavior}</span>
              )
            )}
          </td>
        )}
        {visibleColumns.description && (
          <td className="px-3 py-2 text-xs text-slate-500 max-w-[200px] truncate" title={node.description ?? ''}>
            {isEditing ? (
              <input
                type="text"
                value={editState.description}
                onChange={(e) => onEditChange({ description: e.target.value })}
                className="w-full border border-indigo-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
              />
            ) : (
              node.description || <span className="text-slate-350">—</span>
            )}
          </td>
        )}
        <td className="px-3 py-2 w-20 text-right">
          {isEditing ? (
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                disabled={isSaving}
                onClick={onSave}
                className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50 cursor-pointer"
                title="Save"
              >
                <Check className="w-4 h-4" />
              </button>
              <button type="button" onClick={onCancel} className="p-1 text-slate-450 hover:text-slate-600 cursor-pointer" title="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => onEdit(node)}
                className="p-1 text-slate-300 hover:text-indigo-500 cursor-pointer transition-colors"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {!node.system_defined && (
                <button
                  type="button"
                  onClick={() => onDelete(node)}
                  className="p-1 text-slate-300 hover:text-red-550 cursor-pointer transition-colors"
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
          visibleColumns={visibleColumns}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200/80 w-full max-w-lg mx-4 p-6 animate-in zoom-in-95 duration-150">
        <h2 className="text-base font-semibold text-slate-950 mb-4">Create Taxonomy Line</h2>
        {error && <ErrorBanner message={error} />}
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Code *</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. custom_revenue"
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Sort Order</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Display name"
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Statement Type</label>
              <select
                value={form.statement_type ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, statement_type: e.target.value || null }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 bg-white"
              >
                {STATEMENT_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Section</label>
              <select
                value={form.section}
                onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 bg-white"
              >
                {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Normal Balance</label>
              <select
                value={form.normal_balance ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, normal_balance: e.target.value || null }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 bg-white"
              >
                <option value="">—</option>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Sign Behavior</label>
              <select
                value={form.sign_behavior}
                onChange={(e) => setForm((f) => ({ ...f, sign_behavior: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 bg-white"
              >
                {SIGN_BEHAVIORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Parent Line</label>
            <select
              value={form.parent_id ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value ? Number(e.target.value) : null }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 bg-white"
            >
              <option value="">— None (top level) —</option>
              {allLines.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
            <input
              type="text"
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 bg-white"
            />
          </div>
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_subtotal}
                onChange={(e) => setForm((f) => ({ ...f, is_subtotal: e.target.checked }))}
                className="rounded border-slate-300 text-indigo-650 focus:ring-indigo-500/20"
              />
              Subtotal line
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="rounded border-slate-300 text-indigo-650 focus:ring-indigo-500/20"
              />
              Active
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!form.code || !form.name || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="px-4 py-2 text-xs font-semibold bg-indigo-650 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
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
      toast(`Taxonomy updated: ${data.created} created, ${data.updated} updated`, 'success')
      onDone()
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <div className="bg-amber-50/50 border border-amber-200/80 rounded-xl p-4 mb-4">
      <h3 className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-1.5">
        <Upload className="w-4 h-4 text-amber-700" /> Import Taxonomy CSV
      </h3>
      {error && <p className="text-xs font-medium text-red-650 mb-2">{error}</p>}
      <div className="flex gap-2.5 items-center mb-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="px-3.5 py-1.5 text-xs font-semibold border border-amber-300 rounded-lg text-amber-800 hover:bg-amber-100/60 cursor-pointer bg-white"
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
            className="px-3.5 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
          >
            {previewMutation.isPending ? 'Parsing…' : 'Preview'}
          </button>
        )}
      </div>
      {preview && (
        <div className="text-xs text-amber-900 mb-3">
          <p className="font-semibold mb-1">
            Preview: {preview.create_count} new lines, {preview.update_count} updates
            {preview.error_count > 0 && (
              <span className="text-red-600 ml-2">· {preview.error_count} errors</span>
            )}
          </p>
          {preview.errors.map((e, i) => (
            <p key={i} className="text-red-600 flex items-start gap-1"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{e}</p>
          ))}
          {preview.error_count === 0 && (
            <button
              type="button"
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              className="mt-2 px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
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
    <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800">Reporting Views</h3>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> New View
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
        Reporting views let the same account map differently by context (GAAP vs. management vs. lender).
      </p>
      {creating && (
        <div className="flex gap-2 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-150">
          <input
            type="text"
            placeholder="Code (e.g. custom_view)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
          />
          <input
            type="text"
            placeholder="Display name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
          />
          <button
            type="button"
            disabled={!newCode || !newName || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="px-3 py-1 text-xs font-semibold bg-indigo-650 text-white rounded-lg disabled:opacity-50 cursor-pointer"
          >
            Create
          </button>
          <button type="button" onClick={() => setCreating(false)} className="px-2 py-1 text-xs text-slate-500 cursor-pointer">
            Cancel
          </button>
        </div>
      )}
      <div className="space-y-2">
        {views.map((v) => (
          <div key={v.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200/60 rounded-lg hover:bg-slate-100/40 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">{v.name}</span>
              <span className="font-mono text-[10px] text-slate-400">{v.code}</span>
              {v.is_default && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold">Default</span>
              )}
              {v.is_system_defined && (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-semibold">System</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!v.is_default && (
                <button
                  type="button"
                  onClick={() => setDefaultMutation.mutate(v.id)}
                  className="px-2.5 py-1 text-xs font-semibold text-indigo-650 hover:text-indigo-850 cursor-pointer"
                  title="Set as default"
                >
                  Set default
                </button>
              )}
              <button
                type="button"
                onClick={() => cloneMutation.mutate(v.id)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-md border border-transparent hover:border-slate-200 cursor-pointer transition-all"
                title="Clone"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              {!v.is_system_defined && (
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(v.id)}
                  className="p-1.5 text-slate-400 hover:text-red-650 hover:bg-white rounded-md border border-transparent hover:border-slate-200 cursor-pointer transition-all"
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
// Main Page & Split-Screen mapping workbench
// ---------------------------------------------------------------------------

export function TaxonomyAdminPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { org } = useOrg()
  const orgId = org?.id ?? 1
  const { activeEntity } = useWorkspace()

  // State
  const [searchQuery, setSearchQuery] = useState('')
  const [stmtFilter, setStmtFilter] = useState<string>('')
  const [showInactive, setShowInactive] = useState(false)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showViewSettings, setShowViewSettings] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState({
    code: true,
    name: true,
    statement: true,
    order: true,
    balance: true,
    sign: true,
    description: true,
  })

  // Mapping workbench state
  const [activeTab, setActiveTab] = useState<'mapping' | 'admin' | 'views'>(() => {
    return activeEntity?.id ? 'mapping' : 'admin'
  })
  
  useEffect(() => {
    if (activeEntity?.id) {
      setActiveTab('mapping')
    } else {
      setActiveTab('admin')
    }
  }, [activeEntity?.id])

  const [selectedBatchId, setSelectedBatchId] = useState<number | 'coa'>('coa')
  const [selectedViewId, setSelectedViewId] = useState<number | null>(null)
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set())
  const [unmappedOnlyFilter, setUnmappedOnlyFilter] = useState(false)
  const [leftSearchQuery, setLeftSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())

  // Flagged for review persist list in localStorage
  const [flaggedIds, setFlaggedIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem(`flagged_taxonomy_accts_${activeEntity?.id ?? 0}`)
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })

  const [lockedIds, setLockedIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem(`locked_taxonomy_accts_${activeEntity?.id ?? 0}`)
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })

  const toggleLock = (acctId: number) => {
    const next = new Set(lockedIds)
    if (next.has(acctId)) next.delete(acctId)
    else next.add(acctId)
    setLockedIds(next)
    localStorage.setItem(`locked_taxonomy_accts_${activeEntity?.id ?? 0}`, JSON.stringify(Array.from(next)))
  }

  // Queries
  const { data: entities = [] } = useQuery({
    queryKey: ['entities-list'],
    queryFn: entitiesApi.list,
  })

  const { data: views = [] } = useQuery({
    queryKey: ['reporting-views'],
    queryFn: reportingViewsApi.list,
  })

  // Initialize selectedViewId from default view when views load
  useEffect(() => {
    if (views.length > 0 && selectedViewId === null) {
      const def = views.find(v => v.is_default) || views[0]
      setSelectedViewId(def.id)
    }
  }, [views, selectedViewId])

  const { data: tbBatches = [] } = useQuery({
    queryKey: ['import-batches', orgId],
    queryFn: () => tbImportApi.listBatches(orgId),
    enabled: !!orgId,
  })

  const { data: accounts = [], refetch: refetchAccounts } = useQuery({
    queryKey: ['accounts-list', activeEntity?.id],
    queryFn: () => accountsApi.list(activeEntity?.id || undefined),
    enabled: !!activeEntity?.id,
  })

  const { data: batchLines = [] } = useQuery({
    queryKey: ['batch-lines', selectedBatchId],
    queryFn: () => tbImportApi.getBatchLines(Number(selectedBatchId)),
    enabled: typeof selectedBatchId === 'number',
  })

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ['reporting-taxonomy', 'all'],
    queryFn: () => reportingTaxonomyApi.list(false),
  })

  // Mutation to map single/bulk accounts to a taxonomy line
  const mapAccountsMutation = useMutation({
    mutationFn: ({ accountIds, taxonomyLineId }: { accountIds: number[]; taxonomyLineId: number | null }) => {
      if (accountIds.length === 1) {
        return accountsApi.update(accountIds[0], { reporting_taxonomy_line_id: taxonomyLineId })
      }
      return accountsApi.bulkUpdate(accountIds, { reporting_taxonomy_line_id: taxonomyLineId })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts-list'] })
      qc.invalidateQueries({ queryKey: ['accounts-tree'] })
      setSelectedAccountIds(new Set())
      toast('Taxonomy mapping updated successfully', 'success')
    },
    onError: (err: Error) => setApiError(err.message),
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

  // Flag system toggle
  const toggleFlag = (id: number) => {
    const next = new Set(flaggedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setFlaggedIds(next)
    localStorage.setItem(`flagged_taxonomy_accts_${activeEntity?.id ?? 0}`, JSON.stringify(Array.from(next)))
  }

  // Suggestion mappings calculator helper
  const getSuggestion = useCallback((account: Account) => {
    return getSuggestedTaxonomyCode(
      account.account_type,
      account.tax_line,
      account.detail_type,
      account.account_name
    )
  }, [])

  // Auto-Map All Unmapped Accounts
  const handleAutoMap = () => {
    const unmapped = accounts.filter(a => a.active && !a.reporting_taxonomy_line_id)
    const groups: Record<number, number[]> = {}
    let count = 0

    unmapped.forEach(acct => {
      const suggestion = getSuggestion(acct)
      if (suggestion.code) {
        const matchingLine = lines.find(l => l.code === suggestion.code)
        if (matchingLine) {
          if (!groups[matchingLine.id]) groups[matchingLine.id] = []
          groups[matchingLine.id].push(acct.id)
          count++
        }
      }
    })

    if (count === 0) {
      toast('No unmapped accounts with confidence suggestions found.', 'info')
      return
    }

    if (window.confirm(`Auto-map ${count} accounts based on suggested mappings?`)) {
      Promise.all(
        Object.entries(groups).map(([lineId, ids]) =>
          accountsApi.bulkUpdate(ids, { reporting_taxonomy_line_id: Number(lineId) })
        )
      ).then(() => {
        qc.invalidateQueries({ queryKey: ['accounts-list'] })
        toast(`Successfully mapped ${count} accounts automatically`, 'success')
      }).catch(err => {
        setApiError(err.message)
      })
    }
  }

  // Filter and build tree for Tab 2 (Manage Structure Admin)
  const filteredLines = lines.filter((l) => {
    if (!showInactive && !l.active) return false
    if (stmtFilter && l.statement_type !== stmtFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return l.code.includes(q) || l.name.toLowerCase().includes(q)
    }
    return true
  })

  const tree = buildTree(filteredLines)
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
      parent_id: node.parent_id ?? null,
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
        parent_id: editState.parent_id,
      },
    })
  }

  // Trial Balance details map
  const tbBalanceMap = useMemo(() => {
    const map = new Map<number, { debit: string; credit: string }>()
    if (typeof selectedBatchId === 'number') {
      batchLines.forEach(line => {
        if (line.resolved_account_id) {
          map.set(line.resolved_account_id, { debit: line.debit, credit: line.credit })
        }
      })
    }
    return map
  }, [batchLines, selectedBatchId])

  // Client accounts listing data matching filters
  const clientAccountsList = useMemo(() => {
    return accounts.filter(a => {
      // Filter out inactive unless shown
      if (!a.active) return false
      // Filter unmapped
      if (unmappedOnlyFilter && a.reporting_taxonomy_line_id !== null) return false
      // If TB batch selected, filter accounts to those present in TB
      if (typeof selectedBatchId === 'number' && !tbBalanceMap.has(a.id)) return false

      if (leftSearchQuery) {
        const query = leftSearchQuery.toLowerCase()
        return (
          a.account_name.toLowerCase().includes(query) ||
          a.account_number.toLowerCase().includes(query) ||
          (a.detail_type || '').toLowerCase().includes(query)
        )
      }
      return true
    })
  }, [accounts, unmappedOnlyFilter, selectedBatchId, tbBalanceMap, leftSearchQuery])

  // Count active / mapped counts
  const totalActiveAccounts = accounts.filter(a => a.active).length
  const totalMappedAccounts = accounts.filter(a => a.active && a.reporting_taxonomy_line_id !== null).length
  const mappingProgressPercentage = totalActiveAccounts > 0 ? Math.round((totalMappedAccounts / totalActiveAccounts) * 100) : 0
  const unmappedAccountsCount = totalActiveAccounts - totalMappedAccounts

  // Accounts grouped by taxonomy code mapping
  const accountsByTaxonomyId = useMemo(() => {
    const map = new Map<number, Account[]>()
    accounts.forEach(a => {
      if (a.reporting_taxonomy_line_id) {
        if (!map.has(a.reporting_taxonomy_line_id)) {
          map.set(a.reporting_taxonomy_line_id, [])
        }
        map.get(a.reporting_taxonomy_line_id)!.push(a)
      }
    })
    return map
  }, [accounts])

  // Calculate rolled-up account count for taxonomy tree nodes
  const getRolledUpCount = useCallback((node: TaxonomyNode): number => {
    let count = accountsByTaxonomyId.get(node.id)?.length ?? 0
    node.children.forEach(c => {
      count += getRolledUpCount(c)
    })
    return count
  }, [accountsByTaxonomyId])

  // Stats type tags
  const statsByType = lines.reduce<Record<string, number>>((acc, l) => {
    if (!l.active) return acc
    const key = l.statement_type ?? l.section
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  // Toggle account select
  const toggleAccountSelect = (id: number) => {
    const next = new Set(selectedAccountIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedAccountIds(next)
  }

  // Toggle all visible accounts in Left panel
  const toggleAllVisibleAccounts = () => {
    const visibleIds = clientAccountsList.map(a => a.id)
    const allSelected = visibleIds.every(id => selectedAccountIds.has(id))
    const next = new Set(selectedAccountIds)

    if (allSelected) {
      visibleIds.forEach(id => next.delete(id))
    } else {
      visibleIds.forEach(id => next.add(id))
    }
    setSelectedAccountIds(next)
  }

  // Toggle tree node expanded state
  const toggleCategory = (id: number) => {
    const next = new Set(expandedCategories)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpandedCategories(next)
  }

  // Mapping tree node renderer (collapsible list)
  const renderTaxonomyMappingNode = (node: TaxonomyNode, depth = 0) => {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedCategories.has(node.id)
    const selfMapped = accountsByTaxonomyId.get(node.id) || []
    const rolledCount = getRolledUpCount(node)

    return (
      <div key={node.id} className="border-l border-slate-150/65 pl-2 ml-1 mt-0.5">
        <div
          onClick={() => hasChildren && toggleCategory(node.id)}
          className={cn(
            "flex items-center gap-2 py-1.5 px-2.5 rounded-lg text-xs transition-colors cursor-pointer",
            selectedAccountIds.size > 0 ? "hover:bg-indigo-50/70 border border-transparent hover:border-indigo-150" : "hover:bg-slate-50",
            node.is_subtotal ? "bg-slate-50/65 font-bold" : ""
          )}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          ) : (
            <span className="w-3.5 h-3.5 shrink-0" />
          )}

          <span className="font-mono text-[10px] text-slate-400 shrink-0">{node.code}</span>
          <span className="flex-1 font-medium text-slate-800 truncate">{node.name}</span>

          {node.normal_balance && (
            <span className="text-[10px] text-slate-400 shrink-0 uppercase tracking-wide">
              {node.normal_balance}
            </span>
          )}

          {rolledCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200/50 shrink-0">
              {rolledCount} mapped
            </span>
          )}

          {selectedAccountIds.size > 0 && !node.is_subtotal && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                mapAccountsMutation.mutate({
                  accountIds: Array.from(selectedAccountIds),
                  taxonomyLineId: node.id
                })
              }}
              className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-650 hover:bg-indigo-700 text-white font-semibold text-[10px] shrink-0 shadow-xs hover:shadow-sm"
            >
              <ArrowLeft className="w-3 h-3" /> Map Selected
            </button>
          )}
        </div>

        {/* Mapped accounts details list inside the category */}
        {isExpanded && selfMapped.length > 0 && (
          <div className="pl-6 py-1 space-y-1">
            {selfMapped.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-slate-50 border border-slate-150 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-700 hover:bg-slate-100/60 transition-colors duration-150">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-slate-400">{a.account_number}</span>
                  <span className="font-semibold text-slate-800">{a.account_name}</span>
                </div>
                <button
                  onClick={() => mapAccountsMutation.mutate({ accountIds: [a.id], taxonomyLineId: null })}
                  className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-red-650 transition-colors"
                  title="Remove mapping"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {isExpanded && hasChildren && (
          <div className="mt-0.5 pl-1.5">
            {node.children.map(child => renderTaxonomyMappingNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // Active Workspace entity checker
  const hasActiveEntity = !!activeEntity?.id

  return (
    <PageLayout
      title="Taxonomy Admin"
      subtitle="红蓝双框 SaaS Workbench — Redesign the admin screen into a split-screen mapping workpaper layout"
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Tabs list at the top */}
      <div className="flex border-b border-slate-200/80 mb-5 flex-wrap justify-between items-center gap-2">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('mapping')}
            className={cn(
              "px-5 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer rounded-t-lg",
              activeTab === 'mapping'
                ? "border-indigo-650 text-indigo-650 bg-indigo-50/20 font-extrabold"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <SlidersHorizontal className="w-4 h-4" /> Taxonomy Mapping
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={cn(
              "px-5 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer rounded-t-lg",
              activeTab === 'admin'
                ? "border-indigo-650 text-indigo-650 bg-indigo-50/20 font-extrabold"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <Settings className="w-4 h-4" /> Manage Taxonomy structure
          </button>
          <button
            onClick={() => setActiveTab('views')}
            className={cn(
              "px-5 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer rounded-t-lg",
              activeTab === 'views'
                ? "border-indigo-650 text-indigo-650 bg-indigo-50/20 font-extrabold"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <BookOpen className="w-4 h-4" /> Reporting Views
          </button>
        </div>

        {/* Global Taxonomy View Selector */}
        <div className="flex items-center gap-2 mb-2 mr-2">
          <span className="text-xs font-bold text-slate-550 uppercase tracking-wide">Active Taxonomy view:</span>
          <select
            value={selectedViewId || ''}
            onChange={(e) => setSelectedViewId(Number(e.target.value))}
            className="h-8 border border-slate-200 rounded-lg bg-white px-2 py-0.5 text-xs font-semibold text-slate-850 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all min-w-[150px]"
          >
            {views.map(v => {
              let label = v.name
              if (v.code === 'gaap') label = 'GAAP'
              if (v.code === 'management') label = 'Management'
              if (v.code === 'tax_basis') label = 'Tax'
              if (v.code === 'sba_lender') label = 'SBA'
              if (v.code === 'qoe') label = 'Industry'
              return <option key={v.id} value={v.id}>{label} View</option>
            })}
          </select>
        </div>
      </div>

      {/* Split-Screen mapping layout (Active Tab: mapping) */}
      <div className={cn(activeTab !== 'mapping' && "hidden")}>
        <div className="space-y-5 animate-in fade-in-50 duration-200">
          {!hasActiveEntity ? (
            <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-12 text-center text-slate-400">
              <ShieldAlert className="w-10 h-10 mx-auto text-slate-350 mb-3" />
              <h3 className="font-semibold text-slate-800 text-sm mb-1">No Entity Selected</h3>
              <p className="text-xs text-slate-400 mb-4 max-w-sm mx-auto leading-relaxed">
                Please select an active entity in the top navigation bar to view and map client Chart of Accounts or Trial Balances.
              </p>
            </div>
          ) : (
            <>
              {/* Mapping control summary & progress */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Source Selection & Active views */}
                <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between gap-3">
                  <div className="flex gap-4 items-center flex-wrap">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Mapping Source</span>
                      <select
                        value={selectedBatchId}
                        onChange={(e) => setSelectedBatchId(e.target.value === 'coa' ? 'coa' : Number(e.target.value))}
                        className="h-9 border border-slate-200 rounded-lg bg-white px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 min-w-[220px] transition-all"
                      >
                        <option value="coa">Chart of Accounts (Full list)</option>
                        {tbBatches.map(b => (
                          <option key={b.id} value={b.id}>
                            Trial Balance: {b.filename} ({b.as_of_date})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Active Taxonomy view</span>
                      <select
                        value={selectedViewId || ''}
                        onChange={(e) => setSelectedViewId(Number(e.target.value))}
                        className="h-9 border border-slate-200 rounded-lg bg-white px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 min-w-[180px] transition-all"
                      >
                        {views.map(v => {
                          let label = v.name
                          if (v.code === 'gaap') label = 'GAAP'
                          if (v.code === 'management') label = 'Management'
                          if (v.code === 'tax_basis') label = 'Tax'
                          if (v.code === 'sba_lender') label = 'SBA'
                          if (v.code === 'qoe') label = 'Industry'
                          return <option key={v.id} value={v.id}>{label} View</option>
                        })}
                      </select>
                    </div>
                  </div>

                  <div className="text-xs text-slate-450 border-t border-slate-100 pt-3 flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-indigo-550 shrink-0" />
                    <span>
                      {selectedBatchId === 'coa'
                        ? `Applying mappings to standard Chart of Accounts for entity: ${activeEntity.name}.`
                        : `Applying mappings to imported Trial Balance accounts.`}
                    </span>
                  </div>
                </div>

                {/* Progress Card */}
                <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Mapping Progress</span>
                    <span className="text-xs font-bold text-indigo-650">{mappingProgressPercentage}% Complete</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2.5">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${mappingProgressPercentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-450 font-medium">
                      {totalMappedAccounts} of {totalActiveAccounts} mapped
                    </span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full border text-[10px] font-bold",
                      unmappedAccountsCount > 0 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    )}>
                      {unmappedAccountsCount} Unmapped
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Split workspace grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left Panel: Accounts list (Col span 7) */}
                <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden flex flex-col">
                  {/* Left panel header */}
                  <div className="p-4 border-b border-slate-200/60 bg-slate-50/50 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        Client Accounts <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px]">{clientAccountsList.length}</span>
                      </h3>
                      <button
                        onClick={handleAutoMap}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold bg-indigo-655 text-white rounded-lg hover:bg-indigo-705 cursor-pointer shadow-xs hover:shadow-sm transition-all"
                      >
                        <Zap className="w-3.5 h-3.5" /> Auto-Map Suggestions
                      </button>
                    </div>

                    <div className="flex gap-2 items-center flex-wrap">
                      {/* Search */}
                      <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search accounts name, code or detail..."
                          value={leftSearchQuery}
                          onChange={(e) => setLeftSearchQuery(e.target.value)}
                          className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs w-full focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 bg-white"
                        />
                      </div>

                      {/* Filters checkbox */}
                      <label className="flex items-center gap-1.5 text-xs text-slate-650 cursor-pointer select-none font-semibold">
                        <input
                          type="checkbox"
                          checked={unmappedOnlyFilter}
                          onChange={(e) => setUnmappedOnlyFilter(e.target.checked)}
                          className="rounded border-slate-350 text-indigo-600 focus:ring-indigo-500/20"
                        />
                        Unmapped Only
                      </label>
                    </div>
                  </div>

                  {/* Accounts list container */}
                  <div className="overflow-y-auto max-h-[550px] divide-y divide-slate-100 min-h-[300px]">
                    {clientAccountsList.length === 0 ? (
                      <div className="text-center py-16 text-slate-400">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="text-xs font-semibold">No accounts match selected filters</p>
                      </div>
                    ) : (
                      clientAccountsList.map(acct => {
                        const isMapped = acct.reporting_taxonomy_line_id !== null
                        const mappedLine = isMapped ? lines.find(l => l.id === acct.reporting_taxonomy_line_id) : null
                        const isSelected = selectedAccountIds.has(acct.id)
                        const isFlagged = flaggedIds.has(acct.id)
                        const isLocked = lockedIds.has(acct.id)
                        const suggestion = getSuggestion(acct)
                        const suggestedLine = suggestion.code ? lines.find(l => l.code === suggestion.code) : null

                        // Resolve parent inheritance
                        let inheritedId: number | null = null
                        let parentId = acct.parent_account_id
                        while (parentId && !inheritedId) {
                          const p = accounts.find(a => a.id === parentId)
                          if (p) {
                            if (p.reporting_taxonomy_line_id) {
                              inheritedId = p.reporting_taxonomy_line_id
                            }
                            parentId = p.parent_account_id
                          } else {
                            break
                          }
                        }
                        const inheritedLine = inheritedId ? lines.find(l => l.id === inheritedId) : null

                        return (
                          <div
                            key={acct.id}
                            className={cn(
                              "flex gap-3 items-start p-3 hover:bg-slate-50 transition-colors duration-150 relative",
                              isSelected ? "bg-indigo-50/15" : ""
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isLocked}
                              onChange={() => toggleAccountSelect(acct.id)}
                              className="mt-1 rounded border-slate-350 text-indigo-600 focus:ring-indigo-500/20 disabled:opacity-40"
                            />

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-semibold text-slate-455">{acct.account_number}</span>
                                <span className="text-xs font-bold text-slate-900 truncate" title={acct.account_name}>{acct.account_name}</span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-655 text-[9px] font-semibold uppercase">{acct.account_type}</span>
                                {acct.detail_type && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-50 text-slate-455 text-[9px]">{acct.detail_type}</span>
                                )}
                              </div>

                              {/* Trial Balance Amount if loaded */}
                              {typeof selectedBatchId === 'number' && tbBalanceMap.has(acct.id) && (
                                <div className="text-[10px] font-semibold text-slate-400 mt-1 flex gap-2">
                                  <span>Debit: {tbBalanceMap.get(acct.id)?.debit}</span>
                                  <span>Credit: {tbBalanceMap.get(acct.id)?.credit}</span>
                                </div>
                              )}

                              {/* Mapped view / suggestions info */}
                              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                {isLocked && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-slate-100 border-slate-300 text-slate-700 text-[10px] font-bold">
                                    <Lock className="w-2.5 h-2.5" /> Locked
                                  </span>
                                )}

                                {isMapped ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border bg-indigo-50 border-indigo-200 text-indigo-700 text-[10px] font-bold">
                                    Mapped: {mappedLine?.name || mappedLine?.code || acct.reporting_taxonomy_line_id}
                                    {!isLocked && (
                                      <button
                                        onClick={() => mapAccountsMutation.mutate({ accountIds: [acct.id], taxonomyLineId: null })}
                                        className="ml-1 p-0.5 rounded hover:bg-indigo-150 text-indigo-500 hover:text-indigo-800"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    )}
                                  </span>
                                ) : inheritedLine ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border bg-slate-55/70 border-slate-200 text-slate-700 text-[10px] font-semibold">
                                    Inherited: {inheritedLine.name}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full border bg-amber-50 border-amber-200 text-amber-700 text-[10px] font-semibold">
                                    Unmapped
                                  </span>
                                )}

                                {/* Suggestions engine */}
                                {!isMapped && suggestedLine && !isLocked && (
                                  <div className="inline-flex items-center gap-1.5">
                                    <span className={cn(
                                      "inline-flex items-center border rounded-full px-2 py-0.5 text-[10px] font-bold gap-1",
                                      getConfidenceColor(suggestion.evidence)
                                    )}>
                                      <Sparkles className="w-2.5 h-2.5" />
                                      Suggested: {suggestedLine.name}
                                    </span>
                                    <button
                                      onClick={() => mapAccountsMutation.mutate({ accountIds: [acct.id], taxonomyLineId: suggestedLine.id })}
                                      className="p-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-600 hover:text-emerald-800 transition-colors shrink-0"
                                      title="Accept suggestion"
                                    >
                                      <Check className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}

                                {isMapped && suggestedLine && (
                                  suggestedLine.id === acct.reporting_taxonomy_line_id ? (
                                    <span className="px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-800 text-[10px] font-semibold">
                                      Suggested Match
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-800 text-[10px] font-semibold">
                                      Overridden
                                    </span>
                                  )
                                )}
                              </div>
                            </div>

                            {/* Flag control / overrides action panel */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => toggleLock(acct.id)}
                                className={cn(
                                  "p-1.5 rounded-md border transition-all cursor-pointer",
                                  isLocked
                                    ? "bg-slate-200 border-slate-350 text-slate-700"
                                    : "bg-white border-slate-200 text-slate-350 hover:text-slate-500 hover:border-slate-300"
                                )}
                                title="Locked mappings will not be changed by auto-map, parent inheritance, or taxonomy re-seeding."
                              >
                                {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => toggleFlag(acct.id)}
                                disabled={isLocked}
                                className={cn(
                                  "p-1.5 rounded-md border transition-all cursor-pointer disabled:opacity-40",
                                  isFlagged
                                    ? "bg-amber-100 border-amber-300 text-amber-600"
                                    : "bg-white border-slate-200 text-slate-350 hover:text-slate-500 hover:border-slate-300"
                                )}
                                title={isFlagged ? "Flagged for review" : "Flag account for review"}
                              >
                                <Flag className="w-3.5 h-3.5 fill-current" />
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Right Panel: Taxonomy category tree mapping (Col span 5) */}
                <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-slate-200/60 bg-slate-50/50">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Standard Taxonomy Tree
                    </h3>
                    <p className="text-[11px] text-slate-450 mt-1 leading-relaxed">
                      {selectedAccountIds.size > 0
                        ? `Click "Map Selected" next to a node to link ${selectedAccountIds.size} accounts.`
                        : "Click a category node containing child nodes to view mapped items."}
                    </p>
                  </div>

                  <div className="p-3 overflow-y-auto max-h-[550px] min-h-[300px] space-y-1">
                    {tree.map(node => renderTaxonomyMappingNode(node))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Floating Actions bar */}
          {selectedAccountIds.size > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-800 text-white rounded-xl shadow-2xl py-3 px-5 flex items-center gap-5 z-40 animate-in slide-in-from-bottom-5 duration-200">
              <span className="text-xs font-bold">{selectedAccountIds.size} accounts selected</span>
              <div className="h-4 w-px bg-slate-700" />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const next = new Set(flaggedIds)
                    selectedAccountIds.forEach(id => {
                      next.add(id)
                    })
                    setFlaggedIds(next)
                    localStorage.setItem(`flagged_taxonomy_accts_${activeEntity?.id ?? 0}`, JSON.stringify(Array.from(next)))
                    toast(`Flagged ${selectedAccountIds.size} accounts for review`, 'success')
                    setSelectedAccountIds(new Set())
                  }}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-bold hover:bg-slate-700 cursor-pointer"
                >
                  Flag Selected
                </button>
                <button
                  onClick={() => setSelectedAccountIds(new Set())}
                  className="px-3 py-1.5 border border-slate-700 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-bold cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab 2: Taxonomy Lines Admin (The original line editing view) */}
      <div className={cn("space-y-4 animate-in fade-in-50 duration-200", activeTab !== 'admin' && "hidden")}>
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-3 text-sm text-slate-800 mb-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-indigo-550 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-xs text-slate-800 mb-0.5">Taxonomy Line Administration</p>
            <p className="text-[11px] text-slate-450 leading-relaxed">
              Add, edit, or delete taxonomy nodes. Seeds drive financial structure rollups. Standard categories should not be removed.
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <input
            type="text"
            placeholder="Search by code or name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-[200px] border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 bg-white"
          />
          <label className="flex items-center gap-1.5 text-xs text-slate-650 cursor-pointer select-none font-semibold">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-slate-350 text-indigo-650 focus:ring-indigo-500/20"
            />
            Show inactive
          </label>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-655 text-white rounded-lg hover:bg-indigo-705 cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> New Line
          </button>
          <button
            type="button"
            onClick={() => setShowViewSettings(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer shadow-xs"
          >
            <Settings className="w-3.5 h-3.5" /> View Settings
          </button>
          <button
            type="button"
            onClick={() => reportingTaxonomyApi.exportCsv()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </button>
          <button
            type="button"
            onClick={() => reseedMutation.mutate()}
            disabled={reseedMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            title="Re-seed standard taxonomy lines"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Re-seed
          </button>
        </div>

        {/* Stats chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(statsByType).map(([type, count]) => (
            <button
              key={type}
              type="button"
              onClick={() => setStmtFilter(stmtFilter === type ? '' : type)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold border capitalize transition-all select-none cursor-pointer shadow-xs",
                stmtFilter === type
                  ? (STMT_COLORS[type] ?? 'bg-slate-200 text-slate-800 border-slate-300 font-bold')
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
              )}
            >
              {STATEMENT_TYPES.find((s) => s.value === type)?.label ?? type} · {count}
            </button>
          ))}
        </div>

        {/* Import panel */}
        {showImport && (
          <TaxonomyImportPanel onDone={() => {
            setShowImport(false)
            qc.invalidateQueries({ queryKey: ['reporting-taxonomy'] })
          }} />
        )}

        {/* Main taxonomy lines table */}
        <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-slate-55 border-b border-slate-200/80 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                <tr>
                  {visibleColumns.code && <th className="px-3 py-3 text-left w-36">Code</th>}
                  {visibleColumns.name && <th className="px-3 py-3 text-left">Name</th>}
                  {visibleColumns.statement && <th className="px-3 py-3 text-left w-36">Statement</th>}
                  {visibleColumns.order && <th className="px-3 py-3 text-left w-16">Order</th>}
                  {visibleColumns.balance && <th className="px-3 py-3 text-left w-16">Balance</th>}
                  {visibleColumns.sign && <th className="px-3 py-3 text-left w-20">Sign</th>}
                  {visibleColumns.description && <th className="px-3 py-3 text-left">Description</th>}
                  <th className="px-3 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-400">Loading taxonomy…</td></tr>
                ) : flatFiltered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-400">No taxonomy lines match the current filters</td></tr>
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
                      visibleColumns={visibleColumns}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Tab 3: Reporting Views management */}
      <div className={cn("space-y-4 animate-in fade-in-50 duration-200", activeTab !== 'views' && "hidden")}>
        <ReportingViewsPanel />
      </div>

      {/* Create Modal */}
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
      {/* View Settings Modal */}
      {showViewSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200/80 w-full max-w-sm mx-4 p-6 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-bold text-slate-950 uppercase tracking-wider">View Settings</h2>
              <button
                type="button"
                onClick={() => setShowViewSettings(false)}
                className="text-slate-400 hover:text-slate-655"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <p className="text-slate-500 mb-3 font-medium">Select columns to display in the Manage Taxonomy Structure table:</p>
              {Object.keys(visibleColumns).map((colKey) => (
                <label key={colKey} className="flex items-center gap-2.5 py-1.5 text-slate-700 cursor-pointer hover:bg-slate-50 rounded px-2 select-none">
                  <input
                    type="checkbox"
                    checked={visibleColumns[colKey as keyof typeof visibleColumns]}
                    onChange={(e) => {
                      setVisibleColumns((prev) => ({
                        ...prev,
                        [colKey]: e.target.checked,
                      }))
                    }}
                    className="rounded border-slate-300 text-indigo-650 focus:ring-indigo-500/20"
                  />
                  <span className="capitalize font-semibold text-slate-800">{colKey.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowViewSettings(false)}
                className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
