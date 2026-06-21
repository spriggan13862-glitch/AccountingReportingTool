import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Check, X, AlertCircle, Lock } from 'lucide-react'
import { commonReportingLinesApi } from '@/api/commonReportingLines'
import type {
  CommonReportingLine,
  CrlCreatePayload,
} from '@/api/commonReportingLines'
import { useOrg } from '@/providers/OrgProvider'
import { useToast } from '@/providers/ToastProvider'

const STATEMENT_TYPES = [
  'Balance Sheet',
  'Income Statement',
  'Cash Flow',
  'KPI',
  'Disclosure',
]

const SECTIONS = [
  'Assets', 'Liabilities', 'Equity',
  'Revenue', 'Cost of Revenue', 'Operating Expenses',
  'Other Income / Expense', 'Income Taxes',
  'Operating Activities', 'Investing Activities', 'Financing Activities',
  'KPI', 'Disclosure', 'Sentinel',
]

export function ReportingLinesAdminPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const toast = useToast()
  const queryClient = useQueryClient()

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editSortOrder, setEditSortOrder] = useState<number>(0)
  const [showCreate, setShowCreate] = useState(false)
  const [sectionFilter, setSectionFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const { data: crls = [], isLoading } = useQuery<CommonReportingLine[]>({
    queryKey: ['admin-crls', orgId, showInactive],
    queryFn: () => commonReportingLinesApi.list({
      organization_id: orgId ?? undefined,
      include_inactive: showInactive,
    }),
  })

  const updateMut = useMutation({
    mutationFn: (vars: { id: number; name: string; sort_order: number }) =>
      commonReportingLinesApi.update(vars.id, {
        name: vars.name,
        sort_order: vars.sort_order,
        organization_id: orgId ?? undefined,
      }),
    onSuccess: () => {
      toast('Reporting line updated', 'success')
      queryClient.invalidateQueries({ queryKey: ['admin-crls'] })
      queryClient.invalidateQueries({ queryKey: ['common-reporting-lines'] })
      setEditingId(null)
    },
    onError: (e: Error) => toast(`Update failed: ${e.message}`, 'error'),
  })

  const toggleActiveMut = useMutation({
    mutationFn: (vars: { id: number; is_active: boolean }) =>
      commonReportingLinesApi.update(vars.id, {
        is_active: vars.is_active,
        organization_id: orgId ?? undefined,
      }),
    onSuccess: (_, vars) => {
      toast(`Reporting line ${vars.is_active ? 'activated' : 'deactivated'}`, 'success')
      queryClient.invalidateQueries({ queryKey: ['admin-crls'] })
      queryClient.invalidateQueries({ queryKey: ['common-reporting-lines'] })
    },
    onError: (e: Error) => toast(`Failed: ${e.message}`, 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => commonReportingLinesApi.delete(id),
    onSuccess: () => {
      toast('Reporting line deleted (soft)', 'success')
      queryClient.invalidateQueries({ queryKey: ['admin-crls'] })
    },
    onError: (e: Error) => toast(`Delete failed: ${e.message}`, 'error'),
  })

  const createMut = useMutation({
    mutationFn: (body: CrlCreatePayload) => commonReportingLinesApi.create(body),
    onSuccess: () => {
      toast('Custom reporting line created', 'success')
      queryClient.invalidateQueries({ queryKey: ['admin-crls'] })
      setShowCreate(false)
    },
    onError: (e: Error) => toast(`Create failed: ${e.message}`, 'error'),
  })

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return crls.filter((c) => {
      if (sectionFilter !== 'all' && c.section !== sectionFilter) return false
      if (term && !c.code.toLowerCase().includes(term) && !c.name.toLowerCase().includes(term)) return false
      return true
    })
  }, [crls, sectionFilter, search])

  const bySection = useMemo(() => {
    const out: Record<string, CommonReportingLine[]> = {}
    for (const c of filtered) {
      const key = c.section || '—'
      if (!out[key]) out[key] = []
      out[key].push(c)
    }
    for (const key of Object.keys(out)) {
      out[key].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
    }
    return out
  }, [filtered])

  function startEdit(c: CommonReportingLine) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditSortOrder(c.sort_order)
  }

  if (!orgId) {
    return (
      <div className="p-6 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded">
        Pick an organization to manage reporting lines.
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5" data-testid="reporting-lines-admin">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">FSLIs</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            The Financial Statement Line Item (FSLI) catalog drives every financial statement,
            consolidation, and KPI. System FSLIs are read-only — editing one creates an
            org-specific clone that shadows the system row. Codes are immutable; only display
            name and ordering are editable.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded"
          data-testid="create-crl-btn"
        >
          <Plus className="w-3.5 h-3.5" /> Custom FSLI
        </button>
      </div>

      {showCreate && (
        <CreateCrlForm
          orgId={orgId}
          onCancel={() => setShowCreate(false)}
          onSubmit={(body) => createMut.mutate(body)}
          submitting={createMut.isPending}
        />
      )}

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className="border border-gray-300 rounded h-7 px-2"
          data-testid="crl-section-filter"
        >
          <option value="all">All sections</option>
          {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search code or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded h-7 px-2 w-56"
          data-testid="crl-search"
        />
        <label className="ml-2 flex items-center gap-1 text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            data-testid="crl-show-inactive"
          />
          Show inactive
        </label>
        <span className="ml-auto text-gray-500">{filtered.length} of {crls.length}</span>
      </div>

      {isLoading ? (
        <div className="text-xs text-gray-500">Loading…</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(bySection).map(([section, rows]) => (
            <div key={section} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {section} <span className="text-gray-400 normal-case font-normal">· {rows.length}</span>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-white border-b border-gray-100">
                  <tr className="text-left text-gray-500">
                    <th className="px-3 py-1.5 font-semibold w-44">Code</th>
                    <th className="px-3 py-1.5 font-semibold">Display Name</th>
                    <th className="px-3 py-1.5 font-semibold w-20">Sort</th>
                    <th className="px-3 py-1.5 font-semibold w-24">Scope</th>
                    <th className="px-3 py-1.5 font-semibold w-20">Status</th>
                    <th className="px-3 py-1.5 font-semibold w-40 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const isEditing = editingId === c.id
                    const isOrgClone = c.organization_id != null
                    return (
                      <tr key={c.id} className="border-t border-gray-100" data-testid={`crl-row-${c.code}`}>
                        <td className="px-3 py-1.5 font-mono text-gray-700 flex items-center gap-1.5">
                          <Lock className="w-3 h-3 text-gray-400" />
                          {c.code}
                        </td>
                        <td className="px-3 py-1.5 text-gray-800">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="border border-gray-300 rounded h-6 px-1.5 w-full text-xs"
                              data-testid={`crl-edit-name-${c.code}`}
                            />
                          ) : c.name}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editSortOrder}
                              onChange={(e) => setEditSortOrder(Number(e.target.value))}
                              className="border border-gray-300 rounded h-6 px-1.5 w-16 text-xs"
                            />
                          ) : c.sort_order}
                        </td>
                        <td className="px-3 py-1.5">
                          {isOrgClone ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">Org</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">System</span>
                          )}
                          {c.is_mandatory && (
                            <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Required</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {c.is_active ? (
                            <span className="text-emerald-700 text-[10px] font-semibold">Active</span>
                          ) : (
                            <span className="text-gray-400 text-[10px] font-semibold">Inactive</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateMut.mutate({ id: c.id, name: editName, sort_order: editSortOrder })}
                                disabled={updateMut.isPending}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-semibold rounded"
                                data-testid={`crl-save-${c.code}`}
                              >
                                <Check className="w-3 h-3" /> Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-200 text-gray-700 text-[10px] font-semibold rounded"
                              >
                                <X className="w-3 h-3" /> Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(c)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-indigo-700 hover:bg-indigo-50 text-[10px] font-semibold rounded border border-indigo-200"
                                data-testid={`crl-edit-${c.code}`}
                                title={isOrgClone ? 'Edit org-specific clone' : 'Edit (will clone to org)'}
                              >
                                <Edit2 className="w-3 h-3" /> Edit
                              </button>
                              {isOrgClone && !c.is_mandatory && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => toggleActiveMut.mutate({ id: c.id, is_active: !c.is_active })}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-amber-700 hover:bg-amber-50 text-[10px] font-semibold rounded border border-amber-200"
                                    data-testid={`crl-toggle-${c.code}`}
                                  >
                                    {c.is_active ? 'Deactivate' : 'Activate'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm(`Delete ${c.code}? It will be soft-deleted (is_active=false).`)) {
                                        deleteMut.mutate(c.id)
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-rose-700 hover:bg-rose-50 text-[10px] font-semibold rounded border border-rose-200"
                                    data-testid={`crl-delete-${c.code}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function CreateCrlForm({
  orgId,
  onCancel,
  onSubmit,
  submitting,
}: {
  orgId: number
  onCancel: () => void
  onSubmit: (body: CrlCreatePayload) => void
  submitting: boolean
}) {
  const [codeSuffix, setCodeSuffix] = useState('')
  const [name, setName] = useState('')
  const [section, setSection] = useState(SECTIONS[0])
  const [statementType, setStatementType] = useState(STATEMENT_TYPES[0])
  const [normalBalance, setNormalBalance] = useState<'debit' | 'credit' | ''>('')
  const [sortOrder, setSortOrder] = useState<number>(900)

  // Internal code format requires a fixed prefix; we hide it from the user
  // and prepend on submit so the UI never shows the internal token.
  const CODE_PREFIX = 'CRL_'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      code: CODE_PREFIX + codeSuffix.trim().toUpperCase().replace(/^CRL_/, ''),
      name: name.trim(),
      section,
      statement_type: statementType,
      organization_id: orgId,
      normal_balance: normalBalance || null,
      sort_order: sortOrder,
    })
  }

  return (
    <form
      onSubmit={submit}
      className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-4 space-y-3"
      data-testid="create-crl-form"
    >
      <div className="flex items-start gap-2 text-xs text-indigo-800">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
        <span>Custom FSLIs are scoped to your organization. Codes are immutable once created.</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-gray-700">
          Code
          <input
            type="text"
            required
            value={codeSuffix}
            onChange={(e) => setCodeSuffix(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded h-8 px-2 text-xs font-mono"
            placeholder="ACME_FOUNDER_LOANS"
            data-testid="create-crl-code"
          />
        </label>
        <label className="text-xs font-semibold text-gray-700">
          Display Name
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded h-8 px-2 text-xs"
            data-testid="create-crl-name"
          />
        </label>
        <label className="text-xs font-semibold text-gray-700">
          Section
          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded h-8 px-2 text-xs"
          >
            {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-700">
          Statement Type
          <select
            value={statementType}
            onChange={(e) => setStatementType(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded h-8 px-2 text-xs"
          >
            {STATEMENT_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-700">
          Normal Balance
          <select
            value={normalBalance}
            onChange={(e) => setNormalBalance(e.target.value as 'debit' | 'credit' | '')}
            className="mt-1 w-full border border-gray-300 rounded h-8 px-2 text-xs"
          >
            <option value="">— None —</option>
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-700">
          Sort Order
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="mt-1 w-full border border-gray-300 rounded h-8 px-2 text-xs"
          />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-semibold rounded"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded disabled:opacity-50"
          data-testid="create-crl-submit"
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  )
}
