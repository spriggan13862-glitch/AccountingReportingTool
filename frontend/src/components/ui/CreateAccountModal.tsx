import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { accountsApi } from '@/api/accounts'
import type { AccountCreate } from '@/api/accounts'
import { reportingTaxonomyApi } from '@/api/reportingTaxonomy'
import { useToast } from '@/providers/ToastProvider'
import type { AccountNode } from '@/types'

// ---------------------------------------------------------------------------
// QB-style account category definitions
// ---------------------------------------------------------------------------

interface QBCategory {
  label: string
  accountType: string   // internal type: asset/liability/equity/revenue/expense
  normalBalance: 'debit' | 'credit'
  help: string
  detailTypes: string[]
}

const QB_CATEGORIES: QBCategory[] = [
  {
    label: 'Bank',
    accountType: 'asset',
    normalBalance: 'debit',
    help: 'Checking, savings, and money-market accounts used to deposit funds.',
    detailTypes: ['Checking', 'Savings', 'Money Market', 'Cash On Hand', 'Trust Account'],
  },
  {
    label: 'Credit Card',
    accountType: 'liability',
    normalBalance: 'credit',
    help: 'Credit card accounts used to track outstanding credit-card balances.',
    detailTypes: ['Credit Card'],
  },
  {
    label: 'Income',
    accountType: 'revenue',
    normalBalance: 'credit',
    help: 'Revenue earned from core business operations — sales, services, fees.',
    detailTypes: ['Service/Fee Income', 'Sales of Product Income', 'Other Primary Income', 'Non-Profit Income'],
  },
  {
    label: 'Expense',
    accountType: 'expense',
    normalBalance: 'debit',
    help: 'Day-to-day costs of running the business.',
    detailTypes: [
      'Advertising/Promotional', 'Bank Charges', 'Insurance', 'Legal & Professional Fees',
      'Meals', 'Office Expenses', 'Payroll Expenses', 'Rent or Lease of Buildings',
      'Repair & Maintenance', 'Travel', 'Utilities', 'Other Business Expenses',
    ],
  },
  {
    label: 'Fixed Asset',
    accountType: 'asset',
    normalBalance: 'debit',
    help: 'Long-term physical assets like equipment, vehicles, and buildings.',
    detailTypes: ['Buildings', 'Machinery & Equipment', 'Vehicles', 'Leasehold Improvements', 'Land', 'Accumulated Depreciation'],
  },
  {
    label: 'Loan / Long-Term Liability',
    accountType: 'liability',
    normalBalance: 'credit',
    help: 'Amounts owed beyond one year — mortgages, notes payable, bonds.',
    detailTypes: ['Notes Payable', 'Long Term Liabilities', 'Shareholder Notes Payable', 'Other Long Term Liabilities'],
  },
  {
    label: 'Equity',
    accountType: 'equity',
    normalBalance: 'credit',
    help: "Owner's stake in the business — paid-in capital, retained earnings, distributions.",
    detailTypes: ['Common Stock', 'Preferred Stock', 'Paid-in Capital or Surplus', 'Retained Earnings', "Owner's Equity", 'Partner Distributions', 'Treasury Stock'],
  },
  // ---- Other Account Types ----
  {
    label: 'Accounts Receivable',
    accountType: 'asset',
    normalBalance: 'debit',
    help: 'Amounts customers owe you for products or services already delivered.',
    detailTypes: ['Accounts Receivable'],
  },
  {
    label: 'Other Current Asset',
    accountType: 'asset',
    normalBalance: 'debit',
    help: 'Short-term assets expected to convert to cash within one year.',
    detailTypes: ['Inventory', 'Prepaid Expenses', 'Undeposited Funds', 'Other Current Assets', 'Employee Cash Advances'],
  },
  {
    label: 'Other Asset',
    accountType: 'asset',
    normalBalance: 'debit',
    help: 'Long-term assets not classified elsewhere — security deposits, notes receivable.',
    detailTypes: ['Intangible Assets', 'Goodwill', 'Licenses', 'Notes Receivable', 'Security Deposits', 'Other Long-Term Assets'],
  },
  {
    label: 'Accounts Payable',
    accountType: 'liability',
    normalBalance: 'credit',
    help: 'Amounts you owe to vendors and suppliers for goods and services received.',
    detailTypes: ['Accounts Payable'],
  },
  {
    label: 'Other Current Liability',
    accountType: 'liability',
    normalBalance: 'credit',
    help: 'Short-term obligations due within one year — payroll taxes, sales tax, accrued liabilities.',
    detailTypes: ['Payroll Tax Payable', 'Accrued Liabilities', 'Sales Tax Payable', 'Deferred Revenue', 'Other Current Liabilities'],
  },
  {
    label: 'Long Term Liability',
    accountType: 'liability',
    normalBalance: 'credit',
    help: 'Obligations due beyond one year, other than mortgages and bonds.',
    detailTypes: ['Notes Payable', 'Long Term Liabilities', 'Other Long Term Liabilities'],
  },
  {
    label: 'Cost of Goods Sold',
    accountType: 'expense',
    normalBalance: 'debit',
    help: 'Direct costs attributable to goods sold — purchases, materials, direct labor.',
    detailTypes: ['Cost of Goods Sold', 'Supplies & Materials - COGS', 'Equipment Rental - COGS', 'Other Costs of Services - COS'],
  },
  {
    label: 'Other Income',
    accountType: 'revenue',
    normalBalance: 'credit',
    help: 'Income from activities outside core operations — interest, dividends, gains.',
    detailTypes: ['Other Income', 'Dividend Income', 'Interest Earned'],
  },
  {
    label: 'Other Expense',
    accountType: 'expense',
    normalBalance: 'debit',
    help: 'Costs outside normal operations — penalties, exchange losses, non-recurring items.',
    detailTypes: ['Other Expense', 'Penalties & Settlements', 'Exchange Gain or Loss', 'Income Tax Expense'],
  },
]

const MAIN_CATEGORIES = QB_CATEGORIES.slice(0, 7)
const OTHER_CATEGORIES = QB_CATEGORIES.slice(7)

// ---------------------------------------------------------------------------

interface Props {
  entityId: number
  existingAccounts: AccountNode[]
  onClose: () => void
  onCreated?: () => void
}

export function CreateAccountModal({ entityId, existingAccounts, onClose, onCreated }: Props) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [selectedCategory, setSelectedCategory] = useState<QBCategory | null>(null)
  const [showOther, setShowOther] = useState(false)

  // Form fields
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [detailType, setDetailType] = useState('')
  const [parentAccountId, setParentAccountId] = useState<number | ''>('')
  const [reportingLineId, setReportingLineId] = useState<number | ''>('')
  const [description, setDescription] = useState('')
  const [taxLine, setTaxLine] = useState('')
  const [active, setActive] = useState(true)
  const [isHeader, setIsHeader] = useState(false)
  const [cfsSection, setCfsSection] = useState('')
  const [fsStatement, setFsStatement] = useState('')
  const [fsSectionValue, setFsSectionValue] = useState('')
  const [fsLineLabel, setFsLineLabel] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { data: taxonomyLines = [] } = useQuery({
    queryKey: ['reporting-taxonomy'],
    queryFn: () => reportingTaxonomyApi.list(),
  })

  // Flatten tree for parent account selector
  function flattenTree(nodes: AccountNode[], depth = 0): { id: number; label: string }[] {
    return nodes.flatMap((n) => [
      { id: n.id, label: `${'  '.repeat(depth)}${n.account_number ? n.account_number + ' — ' : ''}${n.account_name}` },
      ...flattenTree(n.children, depth + 1),
    ])
  }
  const flatAccounts = flattenTree(existingAccounts)

  const createMutation = useMutation({
    mutationFn: (body: AccountCreate) => accountsApi.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', 'tree', entityId] })
      toast('Account created', 'success')
      onCreated?.()
      onClose()
    },
    onError: (err: Error) => setFormError(err.message),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCategory) { setFormError('Select an account type.'); return }
    if (!accountNumber.trim()) { setFormError('Account number is required.'); return }
    if (!accountName.trim()) { setFormError('Account name is required.'); return }
    if (!reportingLineId) { setFormError('Reporting line is required.'); return }
    setFormError(null)
    createMutation.mutate({
      entity_id: entityId,
      account_number: accountNumber.trim(),
      account_name: accountName.trim(),
      account_type: selectedCategory.accountType,
      normal_balance: selectedCategory.normalBalance,
      detail_type: detailType || null,
      parent_account_id: parentAccountId || null,
      reporting_taxonomy_line_id: reportingLineId || null,
      description: description || null,
      tax_line: taxLine || null,
      is_header: isHeader,
      is_postable: !isHeader,
      cfs_section: cfsSection || null,
      fs_statement: fsStatement || null,
      fs_section: fsSectionValue || null,
      fs_line_label: fsLineLabel || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">New Account</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Step 1: Account Type */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Account Type <span className="text-red-500">*</span>
            </p>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {MAIN_CATEGORIES.map((cat) => (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => { setSelectedCategory(cat); setDetailType('') }}
                  className={`p-2 rounded-lg border text-xs font-medium text-left transition-colors ${
                    selectedCategory?.label === cat.label
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowOther((v) => !v)}
              className="text-xs text-indigo-600 hover:text-indigo-800 mb-2"
            >
              {showOther ? '▲ Hide other account types' : '▼ Other account types'}
            </button>
            {showOther && (
              <div className="grid grid-cols-4 gap-2 mt-1">
                {OTHER_CATEGORIES.map((cat) => (
                  <button
                    key={cat.label}
                    type="button"
                    onClick={() => { setSelectedCategory(cat); setDetailType('') }}
                    className={`p-2 rounded-lg border text-xs font-medium text-left transition-colors ${
                      selectedCategory?.label === cat.label
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            )}
            {selectedCategory && (
              <p className="mt-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-3 py-2">
                <span className="font-semibold">{selectedCategory.label}:</span>{' '}
                {selectedCategory.help}
              </p>
            )}
          </div>

          {/* Step 2: Account fields (shown only after type selected) */}
          {selectedCategory && (
            <form id="create-account-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Account Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Account Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g. Cash — Operating"
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    FSLI <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={reportingLineId}
                    onChange={(e) => setReportingLineId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    <option value="">— select —</option>
                    {taxonomyLines.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Detail Type</label>
                  {selectedCategory.detailTypes.length > 0 ? (
                    <select
                      value={detailType}
                      onChange={(e) => setDetailType(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="">— select —</option>
                      {selectedCategory.detailTypes.map((dt) => (
                        <option key={dt} value={dt}>{dt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={detailType}
                      onChange={(e) => setDetailType(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Parent Account / Subaccount of
                  </label>
                  <select
                    value={parentAccountId}
                    onChange={(e) => setParentAccountId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    <option value="">— top-level account —</option>
                    {flatAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tax Line Mapping</label>
                  <input
                    type="text"
                    value={taxLine}
                    onChange={(e) => setTaxLine(e.target.value)}
                    placeholder="e.g. B/S-Assets: Cash"
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description / Note</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
                />
              </div>

              {/* Financial Statement Mapping */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Financial Statement Mapping</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">FS Statement</label>
                    <select
                      value={fsStatement}
                      onChange={(e) => setFsStatement(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="">— not mapped —</option>
                      <option value="IncomeStatement">Income Statement</option>
                      <option value="BalanceSheet">Balance Sheet</option>
                      <option value="CashFlow">Cash Flow Statement</option>
                      <option value="StatementOfEquity">Statement of Equity</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CFS Section</label>
                    <select
                      value={cfsSection}
                      onChange={(e) => setCfsSection(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="">— not applicable —</option>
                      <option value="Operating">Operating</option>
                      <option value="Investing">Investing</option>
                      <option value="Financing">Financing</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">FS Section</label>
                    <input
                      type="text"
                      value={fsSectionValue}
                      onChange={(e) => setFsSectionValue(e.target.value)}
                      placeholder="e.g. Current Assets"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">FS Line Label</label>
                    <input
                      type="text"
                      value={fsLineLabel}
                      onChange={(e) => setFsLineLabel(e.target.value)}
                      placeholder="e.g. Cash and Cash Equivalents"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    id="create-active"
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="create-active" className="text-xs text-gray-600">Active</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="create-is-header"
                    type="checkbox"
                    checked={isHeader}
                    onChange={(e) => setIsHeader(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="create-is-header" className="text-xs text-gray-600">
                    Header account <span className="text-gray-400">(no direct posting)</span>
                  </label>
                </div>
              </div>

              {/* Mapping chain reminder */}
              <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-2 font-mono flex items-center gap-1.5 flex-wrap">
                <span>Source Account</span>
                <span className="text-gray-300">→</span>
                <span className="font-semibold text-gray-700">Entity COA</span>
                <span className="text-gray-300">→</span>
                <span>Reporting / FSLI Line</span>
                <span className="text-gray-300">→</span>
                <span>Financial Statements</span>
              </div>
            </form>
          )}

          {formError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {formError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          {selectedCategory && (
            <button
              type="submit"
              form="create-account-form"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Saving…' : 'Save Account'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
