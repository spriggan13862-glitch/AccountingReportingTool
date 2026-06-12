import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GitBranch,
  Plus,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  Pencil,
  BarChart2,
  ArrowLeftRight,
} from 'lucide-react'
import { reportingViewsApi } from '@/api/reportingViews'
import type {
  ViewAccountOverride,
  ViewImpactAccount,
  ViewComparisonRow,
} from '@/api/reportingViews'
import { reportingTaxonomyApi } from '@/api/reportingTaxonomy'
import { accountsApi } from '@/api/accounts'
import { entitiesApi } from '@/api/entities'
import type { ReportingTaxonomyView, ReportingTaxonomyLine, Account, Entity } from '@/types'

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function Badge({ children, color = 'blue' }: { children: React.ReactNode; color?: string }) {
  const cls: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    gray: 'bg-gray-100 text-gray-600',
    amber: 'bg-amber-100 text-amber-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls[color] ?? cls.blue}`}>
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Override Editor — account list with taxonomy line selector
// ---------------------------------------------------------------------------

function OverrideEditor({
  view,
  entityId,
  taxLines,
  accounts,
}: {
  view: ReportingTaxonomyView
  entityId: number
  taxLines: ReportingTaxonomyLine[]
  accounts: Account[]
}) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: overrides = [] } = useQuery({
    queryKey: ['view-overrides', view.id],
    queryFn: () => reportingViewsApi.listOverrides(view.id),
  })

  const overrideMap: Record<number, ViewAccountOverride> = {}
  for (const o of overrides) overrideMap[o.account_id] = o

  const setMutation = useMutation({
    mutationFn: ({ accountId, taxonomyLineId }: { accountId: number; taxonomyLineId: number | null }) =>
      reportingViewsApi.setOverride(view.id, accountId, { taxonomy_line_id: taxonomyLineId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['view-overrides', view.id] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (accountId: number) => reportingViewsApi.deleteOverride(view.id, accountId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['view-overrides', view.id] }),
  })

  const filtered = accounts.filter(
    (a) =>
      !search ||
      a.account_number?.toLowerCase().includes(search.toLowerCase()) ||
      a.account_name.toLowerCase().includes(search.toLowerCase())
  )

  const taxLineOptions = taxLines.filter((l) => !l.is_subtotal)

  return (
    <div data-testid="override-editor">
      <div className="flex items-center gap-3 mb-3">
        <input
          type="text"
          placeholder="Search accounts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-2 py-1 text-sm flex-1 max-w-xs"
          data-testid="override-search"
        />
        <span className="text-xs text-gray-500">
          {overrides.length} override{overrides.length !== 1 ? 's' : ''} active
        </span>
      </div>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm" data-testid="override-table">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Account</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Default Taxonomy</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">View Override</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.slice(0, 100).map((account) => {
              const ov = overrideMap[account.id]
              const defaultLine = taxLines.find((l) => l.id === account.reporting_taxonomy_line_id)
              return (
                <tr
                  key={account.id}
                  className={ov ? 'bg-blue-50' : 'hover:bg-gray-50'}
                  data-testid={`override-row-${account.id}`}
                >
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{account.account_number}</div>
                    <div className="text-xs text-gray-500">{account.account_name}</div>
                  </td>
                  <td className="px-3 py-1.5 text-gray-600 text-xs">
                    {defaultLine?.name ?? <span className="text-gray-400 italic">unmapped</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={ov?.taxonomy_line_id ?? ''}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null
                        setMutation.mutate({ accountId: account.id, taxonomyLineId: val })
                      }}
                      className="border rounded px-2 py-1 text-xs w-full max-w-xs"
                      data-testid={`override-select-${account.id}`}
                    >
                      <option value="">— use default —</option>
                      {taxLineOptions.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {ov && (
                      <button
                        onClick={() => deleteMutation.mutate(account.id)}
                        className="text-gray-400 hover:text-red-500"
                        title="Remove override"
                        data-testid={`delete-override-${account.id}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-sm">
                  No accounts match your search
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length > 100 && (
          <div className="px-3 py-2 text-xs text-gray-400 bg-gray-50 border-t">
            Showing first 100 of {filtered.length} accounts. Use search to narrow results.
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Impact Panel
// ---------------------------------------------------------------------------

function ImpactPanel({ viewId, entityId }: { viewId: number; entityId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['view-impact', viewId, entityId],
    queryFn: () => reportingViewsApi.impact(viewId, entityId),
    enabled: !!entityId,
  })

  if (isLoading) return <div className="text-sm text-gray-400 py-4">Loading impact…</div>
  if (!data) return null

  if (data.override_count === 0) {
    return (
      <div className="text-sm text-gray-500 py-4" data-testid="impact-empty">
        No account overrides configured for this view.
      </div>
    )
  }

  return (
    <div data-testid="impact-panel">
      <p className="text-sm text-gray-600 mb-3">
        {data.override_count} account{data.override_count !== 1 ? 's' : ''} are remapped under this view.
      </p>
      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Account</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Default</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">This View</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.accounts.map((a: ViewImpactAccount) => (
              <tr key={a.account_id} className="hover:bg-gray-50" data-testid={`impact-row-${a.account_id}`}>
                <td className="px-3 py-1.5">
                  <div className="font-medium">{a.account_code}</div>
                  <div className="text-xs text-gray-500">{a.account_name}</div>
                </td>
                <td className="px-3 py-1.5 text-xs text-gray-600">
                  {a.default_taxonomy_name ?? <span className="italic text-gray-400">unmapped</span>}
                </td>
                <td className="px-3 py-1.5 text-xs">
                  {a.override_taxonomy_name ? (
                    <span className="text-blue-700 font-medium">{a.override_taxonomy_name}</span>
                  ) : (
                    <span className="italic text-gray-400">excluded</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Comparison Panel
// ---------------------------------------------------------------------------

function ComparisonPanel({
  views,
  entityId,
  asOfDate,
}: {
  views: ReportingTaxonomyView[]
  entityId: number
  asOfDate: string
}) {
  const [view1Id, setView1Id] = useState<number | ''>('')
  const [view2Id, setView2Id] = useState<number | ''>('')
  const [stmtType, setStmtType] = useState('income_statement')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['view-compare', view1Id, view2Id, entityId, asOfDate, stmtType],
    queryFn: () =>
      reportingViewsApi.compare({
        view1_id: view1Id as number,
        view2_id: view2Id as number,
        entity_id: entityId,
        as_of_date: asOfDate,
        statement_type: stmtType,
      }),
    enabled: false,
  })

  const canRun = !!view1Id && !!view2Id && view1Id !== view2Id && !!entityId

  return (
    <div data-testid="comparison-panel">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={view1Id}
          onChange={(e) => setView1Id(e.target.value ? Number(e.target.value) : '')}
          className="border rounded px-2 py-1.5 text-sm"
          data-testid="compare-view1"
        >
          <option value="">Select view 1…</option>
          {views.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <ArrowLeftRight size={16} className="text-gray-400" />
        <select
          value={view2Id}
          onChange={(e) => setView2Id(e.target.value ? Number(e.target.value) : '')}
          className="border rounded px-2 py-1.5 text-sm"
          data-testid="compare-view2"
        >
          <option value="">Select view 2…</option>
          {views.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <select
          value={stmtType}
          onChange={(e) => setStmtType(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm"
          data-testid="compare-stmt-type"
        >
          <option value="income_statement">Income Statement</option>
          <option value="balance_sheet">Balance Sheet</option>
        </select>
        <button
          onClick={() => refetch()}
          disabled={!canRun || isLoading}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          data-testid="compare-run-btn"
        >
          {isLoading ? 'Loading…' : 'Compare'}
        </button>
      </div>

      {data && (
        <div data-testid="comparison-grid" className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Line</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">
                  {views.find((v) => v.id === view1Id)?.name ?? 'View 1'}
                </th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">
                  {views.find((v) => v.id === view2Id)?.name ?? 'View 2'}
                </th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.rows.map((row: ViewComparisonRow) => (
                <tr
                  key={row.taxonomy_id}
                  className={row.is_subtotal ? 'bg-gray-50 font-semibold' : 'hover:bg-gray-50'}
                  data-testid={`compare-row-${row.taxonomy_id}`}
                >
                  <td className="px-3 py-1.5" style={{ paddingLeft: `${12 + row.hierarchy_depth * 16}px` }}>
                    {row.name}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {row.view1_balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {row.view2_balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${row.delta !== 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                    {row.delta !== 0
                      ? row.delta.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!data && !isLoading && (
        <div className="text-sm text-gray-400 py-4 text-center" data-testid="comparison-empty">
          Select two views and click Compare to see differences.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// View Form (create / edit)
// ---------------------------------------------------------------------------

function ViewForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<{ code: string; name: string; description: string }>
  onSave: (data: { code: string; name: string; description: string }) => void
  onCancel: () => void
  saving: boolean
}) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')

  return (
    <div className="bg-white border rounded p-4 space-y-3" data-testid="view-form">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
            placeholder="GAAP"
            className="border rounded px-2 py-1.5 text-sm w-full"
            data-testid="view-form-code"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="GAAP Presentation"
            className="border rounded px-2 py-1.5 text-sm w-full"
            data-testid="view-form-name"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm w-full"
          data-testid="view-form-description"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSave({ code, name, description })}
          disabled={!code || !name || saving}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          data-testid="view-form-save"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="border px-3 py-1.5 rounded text-sm hover:bg-gray-50"
          data-testid="view-form-cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type ActiveTab = 'overrides' | 'impact' | 'compare'

export function ReportingViewWorkspacePage() {
  const qc = useQueryClient()
  const [selectedViewId, setSelectedViewId] = useState<number | null>(null)
  const [selectedEntityId, setSelectedEntityId] = useState<number | ''>('')
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [activeTab, setActiveTab] = useState<ActiveTab>('overrides')
  const [showCreateForm, setShowCreateForm] = useState(false)

  const { data: views = [], isLoading: viewsLoading } = useQuery({
    queryKey: ['reporting-views'],
    queryFn: () => reportingViewsApi.list(),
  })

  const { data: entities = [] } = useQuery<Entity[]>({
    queryKey: ['entities'],
    queryFn: () => entitiesApi.list(),
  })

  const { data: taxLines = [] } = useQuery({
    queryKey: ['taxonomy-lines'],
    queryFn: () => reportingTaxonomyApi.list(true),
  })

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', selectedEntityId],
    queryFn: () => accountsApi.list(selectedEntityId as number),
    enabled: !!selectedEntityId,
  })

  const createMutation = useMutation({
    mutationFn: (data: { code: string; name: string; description: string }) =>
      reportingViewsApi.create({ code: data.code, name: data.name, description: data.description || null }),
    onSuccess: (view) => {
      qc.invalidateQueries({ queryKey: ['reporting-views'] })
      setShowCreateForm(false)
      setSelectedViewId(view.id)
    },
  })

  const cloneMutation = useMutation({
    mutationFn: (id: number) => reportingViewsApi.clone(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reporting-views'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => reportingViewsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reporting-views'] })
      setSelectedViewId(null)
    },
  })

  const selectedView = views.find((v) => v.id === selectedViewId) ?? null

  const TABS: { id: ActiveTab; label: string }[] = [
    { id: 'overrides', label: 'Override Editor' },
    { id: 'impact', label: 'Impact Analysis' },
    { id: 'compare', label: 'Compare Views' },
  ]

  return (
    <div className="flex h-full" data-testid="reporting-view-workspace">
      {/* Sidebar — view list */}
      <aside className="w-64 border-r flex flex-col bg-white" data-testid="view-sidebar">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-blue-600" />
            <span className="font-semibold text-sm">Reporting Views</span>
          </div>
          <button
            onClick={() => setShowCreateForm((v) => !v)}
            className="text-blue-600 hover:text-blue-800"
            title="New view"
            data-testid="create-view-btn"
          >
            <Plus size={16} />
          </button>
        </div>

        {showCreateForm && (
          <div className="p-3 border-b">
            <ViewForm
              onSave={(data) => createMutation.mutate(data)}
              onCancel={() => setShowCreateForm(false)}
              saving={createMutation.isPending}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {viewsLoading && (
            <div className="p-3 text-sm text-gray-400">Loading…</div>
          )}
          {views.map((view) => (
            <div
              key={view.id}
              onClick={() => setSelectedViewId(view.id)}
              className={`px-3 py-2 cursor-pointer flex items-start justify-between gap-2 hover:bg-gray-50 ${
                selectedViewId === view.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''
              }`}
              data-testid={`view-item-${view.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{view.name}</div>
                <div className="text-xs text-gray-400">{view.code}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                {view.is_default && <Badge color="green">Default</Badge>}
                {view.is_system_defined && <Badge color="gray">System</Badge>}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {/* Context bar */}
        <div className="bg-white border-b px-4 py-2 flex items-center gap-4" data-testid="context-bar">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Entity</label>
            <select
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value ? Number(e.target.value) : '')}
              className="border rounded px-2 py-1 text-sm"
              data-testid="entity-select"
            >
              <option value="">— select entity —</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">As of</label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
              data-testid="as-of-date"
            />
          </div>
        </div>

        {!selectedView ? (
          <div className="flex-1 flex items-center justify-center" data-testid="no-view-selected">
            <div className="text-center text-gray-400">
              <GitBranch size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a reporting view from the sidebar</p>
              <p className="text-xs mt-1">or create a new one with the + button</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* View header */}
            <div className="bg-white border-b px-4 py-3 flex items-center justify-between" data-testid="view-header">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-gray-900">{selectedView.name}</h2>
                  {selectedView.is_default && <Badge color="green">Default</Badge>}
                  {selectedView.is_system_defined && <Badge color="gray">System</Badge>}
                </div>
                {selectedView.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{selectedView.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => cloneMutation.mutate(selectedView.id)}
                  disabled={cloneMutation.isPending}
                  className="border px-2.5 py-1.5 rounded text-sm hover:bg-gray-50 flex items-center gap-1"
                  title="Clone view"
                  data-testid="clone-view-btn"
                >
                  <Copy size={14} />
                  Clone
                </button>
                {!selectedView.is_system_defined && (
                  <button
                    onClick={() => {
                      if (confirm(`Delete view "${selectedView.name}"?`)) {
                        deleteMutation.mutate(selectedView.id)
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="border border-red-200 text-red-600 px-2.5 py-1.5 rounded text-sm hover:bg-red-50 flex items-center gap-1"
                    data-testid="delete-view-btn"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b px-4 flex gap-1" data-testid="view-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto p-4">
              {activeTab === 'overrides' && (
                <div data-testid="overrides-tab">
                  {!selectedEntityId ? (
                    <div className="text-sm text-gray-400 py-4" data-testid="overrides-no-entity">
                      Select an entity above to edit account overrides.
                    </div>
                  ) : (
                    <OverrideEditor
                      view={selectedView}
                      entityId={selectedEntityId as number}
                      taxLines={taxLines}
                      accounts={accounts as Account[]}
                    />
                  )}
                </div>
              )}

              {activeTab === 'impact' && (
                <div data-testid="impact-tab">
                  {!selectedEntityId ? (
                    <div className="text-sm text-gray-400 py-4">
                      Select an entity above to view impact analysis.
                    </div>
                  ) : (
                    <ImpactPanel viewId={selectedView.id} entityId={selectedEntityId as number} />
                  )}
                </div>
              )}

              {activeTab === 'compare' && (
                <div data-testid="compare-tab">
                  {!selectedEntityId ? (
                    <div className="text-sm text-gray-400 py-4">
                      Select an entity above to compare views.
                    </div>
                  ) : (
                    <ComparisonPanel
                      views={views}
                      entityId={selectedEntityId as number}
                      asOfDate={asOfDate}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
