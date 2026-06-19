import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, CheckCircle, ChevronRight, RefreshCw, XCircle,
  Layers, Plus, Trash2, Building2, ArrowRight,
} from 'lucide-react'
import { consolidationApi, type ConsolidatedFsLine } from '@/api/consolidation'
import { entitiesApi } from '@/api/entities'
import { reportingTaxonomyApi } from '@/api/reportingTaxonomy'
import { PageLayout } from '@/components/ui/PageLayout'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { ScenarioMultiSelect } from '@/components/ui/ScenarioMultiSelect'
import { useFormatNumber } from '@/hooks/useFormatCurrency'
import type { TBRow, Entity } from '@/types'

// ---------------------------------------------------------------------------
// Consolidation Group — localStorage-persisted
// ---------------------------------------------------------------------------

interface ConsolidationGroup {
  id: string
  name: string
  parentEntityId: number
  memberEntityIds: number[]
}

const GROUPS_KEY = 'consolidation-groups-v1'

function loadGroups(): ConsolidationGroup[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveGroups(groups: ConsolidationGroup[]) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFmtNum(fmtNumber: (v: number | null | undefined) => string) {
  return (val: string | number | null | undefined) => {
    if (val == null) return '—'
    const n = typeof val === 'string' ? parseFloat(val) : val
    if (isNaN(n) || n === 0) return '—'
    return fmtNumber(n)
  }
}

type Tab = 'tb' | 'bs' | 'is' | 'entities' | 'taxonomy'

// ---------------------------------------------------------------------------
// ConsolidatedTB
// ---------------------------------------------------------------------------

function ConsolidatedTB({ rows }: { rows: TBRow[] }) {
  const fmtNumber = useFormatNumber()
  const fmt = makeFmtNum(fmtNumber)
  if (rows.length === 0)
    return <p className="py-8 text-center text-sm text-gray-400">No accounts in consolidated trial balance.</p>
  const totalDebit = rows.reduce((s, r) => s + parseFloat(r.total_debit ?? '0'), 0)
  const totalCredit = rows.reduce((s, r) => s + parseFloat(r.total_credit ?? '0'), 0)
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01

  return (
    <div className="overflow-x-auto">
      <div className={`mb-3 flex items-center gap-2 text-xs px-3 py-2 rounded border ${balanced ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
        {balanced
          ? <><CheckCircle className="w-3.5 h-3.5" /> Consolidated trial balance is in balance</>
          : <><XCircle className="w-3.5 h-3.5" /> Out of balance — debits and credits differ by {fmt(Math.abs(totalDebit - totalCredit))}</>}
      </div>
      <table className="w-full text-xs text-left">
        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
          <tr>
            <th className="px-3 py-2 font-semibold text-gray-600">Account #</th>
            <th className="px-3 py-2 font-semibold text-gray-600">Account Name</th>
            <th className="px-3 py-2 font-semibold text-gray-600">Type</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-600">Debit</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-600">Credit</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-600">Net Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.account_id} className="hover:bg-gray-50">
              <td className="px-3 py-1.5 font-mono text-gray-500">{r.account_number}</td>
              <td className="px-3 py-1.5 text-gray-800">{r.account_name}</td>
              <td className="px-3 py-1.5 text-gray-500 capitalize">{r.account_type}</td>
              <td className="px-3 py-1.5 text-right font-mono text-gray-700">{fmt(r.total_debit)}</td>
              <td className="px-3 py-1.5 text-right font-mono text-gray-700">{fmt(r.total_credit)}</td>
              <td className={`px-3 py-1.5 text-right font-mono font-semibold ${parseFloat(r.signed_balance ?? '0') < 0 ? 'text-rose-700' : 'text-gray-800'}`}>
                {fmt(r.signed_balance ?? r.net_debit ?? '0')}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
          <tr>
            <td colSpan={3} className="px-3 py-2 text-xs text-gray-600 uppercase tracking-wider">Total</td>
            <td className="px-3 py-2 text-right font-mono text-gray-800">{fmt(totalDebit)}</td>
            <td className="px-3 py-2 text-right font-mono text-gray-800">{fmt(totalCredit)}</td>
            <td className="px-3 py-2 text-right font-mono text-gray-800">{fmt(totalDebit - totalCredit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConsolidatedFS
// ---------------------------------------------------------------------------

function ConsolidatedFS({ rows }: { rows: ConsolidatedFsLine[] }) {
  const fmtNumber = useFormatNumber()
  const fmt = makeFmtNum(fmtNumber)
  if (rows.length === 0)
    return <p className="py-8 text-center text-sm text-gray-400">No taxonomy lines configured for this entity.</p>
  const sections = [...new Set(rows.map((r) => r.section))].filter(Boolean)
  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const sectionRows = rows.filter((r) => r.section === section)
        const subtotal = sectionRows.find((r) => r.is_subtotal)
        const lineRows = sectionRows.filter((r) => !r.is_subtotal)
        return (
          <div key={section}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 px-3">{section}</h3>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-gray-50">
                {lineRows.map((r) => (
                  <tr key={r.line_id} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-700" style={{ paddingLeft: r.parent_line_id ? '2rem' : '0.75rem' }}>{r.name}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-700">{fmt(r.display_balance)}</td>
                  </tr>
                ))}
                {subtotal && (
                  <tr className="border-t border-gray-300 bg-gray-50 font-semibold">
                    <td className="px-3 py-1.5 text-gray-800">{subtotal.name}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-800">{fmt(subtotal.display_balance)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ValidationBanner
// ---------------------------------------------------------------------------

function ValidationBanner({ issues }: { issues: Array<{ severity: string; message: string }> }) {
  if (issues.length === 0) return null
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  return (
    <div className="space-y-2">
      {errors.map((e, i) => (
        <div key={i} className="flex items-start gap-2 text-xs px-3 py-2 rounded border bg-rose-50 border-rose-200 text-rose-700">
          <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{e.message}
        </div>
      ))}
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 text-xs px-3 py-2 rounded border bg-amber-50 border-amber-200 text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{w.message}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Consolidation Groups Panel
// ---------------------------------------------------------------------------

function GroupsPanel({
  groups,
  entities,
  onSave,
  onDelete,
  onSelect,
}: {
  groups: ConsolidationGroup[]
  entities: Entity[]
  onSave: (g: ConsolidationGroup) => void
  onDelete: (id: string) => void
  onSelect: (g: ConsolidationGroup) => void
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<number | ''>('')
  const [memberIds, setMemberIds] = useState<Set<number>>(new Set())

  function toggleMember(id: number) {
    setMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCreate() {
    if (!name || !parentId) return
    const group: ConsolidationGroup = {
      id: crypto.randomUUID(),
      name,
      parentEntityId: parentId as number,
      memberEntityIds: [...memberIds],
    }
    onSave(group)
    setShowCreate(false)
    setName('')
    setParentId('')
    setMemberIds(new Set())
  }

  return (
    <div data-testid="groups-panel" className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Consolidation Groups</span>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          data-testid="new-group-btn"
        >
          <Plus className="w-3.5 h-3.5" /> New Group
        </button>
      </div>

      {showCreate && (
        <div className="border rounded p-3 space-y-2 bg-gray-50" data-testid="create-group-form">
          <input
            type="text"
            placeholder="Group name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-xs"
            data-testid="group-name-input"
          />
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Parent / Holding Entity</label>
            <EntitySelect value={parentId} onChange={setParentId} />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">Member Entities</label>
            <div className="max-h-36 overflow-y-auto border rounded bg-white divide-y">
              {entities.filter((e) => e.id !== parentId).map((e) => (
                <label key={e.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={memberIds.has(e.id)}
                    onChange={() => toggleMember(e.id)}
                    className="rounded"
                  />
                  <Building2 className="w-3 h-3 text-gray-400" />
                  {e.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!name || !parentId}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
              data-testid="save-group-btn"
            >
              Save Group
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 border text-xs rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {groups.length === 0 && !showCreate && (
          <p className="text-xs text-gray-400 py-2">No groups yet. Create one to save your consolidation setup.</p>
        )}
        {groups.map((g) => {
          const parent = entities.find((e) => e.id === g.parentEntityId)
          return (
            <div key={g.id} className="flex items-center justify-between px-3 py-2 border rounded hover:bg-gray-50" data-testid={`group-item-${g.id}`}>
              <div>
                <div className="text-sm font-medium text-gray-800">{g.name}</div>
                <div className="text-[10px] text-gray-400">
                  {parent?.name ?? '?'} + {g.memberEntityIds.length} member{g.memberEntityIds.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(g)}
                  className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                  data-testid={`select-group-${g.id}`}
                >
                  Use
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(g.id)}
                  className="p-1 text-gray-300 hover:text-rose-500 rounded"
                  data-testid={`delete-group-${g.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entity Summary Tab
// ---------------------------------------------------------------------------

function EntitySummaryTab({
  parentEntityId,
  memberEntityIds,
  entities,
}: {
  parentEntityId: number
  memberEntityIds: number[]
  entities: Entity[]
}) {
  const allEntityIds = [parentEntityId, ...memberEntityIds]
  const included = entities.filter((e) => allEntityIds.includes(e.id))
  const parent = entities.find((e) => e.id === parentEntityId)

  return (
    <div data-testid="entity-summary-tab" className="space-y-3">
      <p className="text-xs text-gray-500">
        This consolidation run includes {included.length} entit{included.length !== 1 ? 'ies' : 'y'}.
        The parent entity defines the consolidation taxonomy.
      </p>
      <div className="border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-600">Entity</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-600">Role</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-600">Type</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-600">Currency</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {included.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-800 flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-gray-400" />
                  {e.name}
                </td>
                <td className="px-3 py-2">
                  {e.id === parent?.id ? (
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-semibold">Parent</span>
                  ) : (
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">Subsidiary</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500 capitalize">{e.entity_type}</td>
                <td className="px-3 py-2 text-gray-500">{e.currency ?? 'USD'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Taxonomy Translation Tab
// ---------------------------------------------------------------------------

function TaxonomyTranslationTab({
  memberEntityIds,
  entities,
}: {
  memberEntityIds: number[]
  entities: Entity[]
}) {
  const { data: taxonomyLines = [] } = useQuery({
    queryKey: ['reporting-taxonomy'],
    queryFn: () => reportingTaxonomyApi.list(),
  })

  const members = entities.filter((e) => memberEntityIds.includes(e.id))
  const rootLines = taxonomyLines.filter((l) => !l.parent_id && !l.is_subtotal).slice(0, 20)

  return (
    <div data-testid="taxonomy-translation-tab" className="space-y-3">
      <div className="flex items-start gap-2 text-xs px-3 py-2 rounded border bg-blue-50 border-blue-200 text-blue-700">
        <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Each subsidiary entity's accounts must be mapped to the group's reporting taxonomy.
          Mappings are configured per-account in the Chart of Accounts. Entities using a different
          taxonomy can use Reporting Views to translate before consolidation.
        </span>
      </div>

      {members.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">No member entities added to this group.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-xs px-3 py-2 rounded border bg-amber-50 border-amber-200 text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Account-level taxonomy mappings must be verified in the Chart of Accounts for each entity.
              Navigate to <strong>Chart of Accounts → Taxonomy</strong> for each subsidiary and ensure all
              accounts are mapped to taxonomy lines before running consolidation.
            </span>
          </div>

          <div className="border rounded overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Taxonomy Line</th>
                  {members.map((e) => (
                    <th key={e.id} className="px-3 py-2 text-center font-semibold text-gray-600">{e.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rootLines.map((line) => (
                  <tr key={line.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700 font-medium">{line.name}</td>
                    {members.map((e) => (
                      <td key={e.id} className="px-3 py-2 text-center text-gray-400 text-[10px]">
                        verify →
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rootLines.length === 0 && (
              <div className="px-3 py-6 text-center text-gray-400 text-xs">No taxonomy lines configured.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ConsolidationsPage() {
  const [entityId, setEntityId] = useState<number | ''>('')
  const [memberEntityIds, setMemberEntityIds] = useState<number[]>([])
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10))
  const [opScenarioIds, setOpScenarioIds] = useState<number[]>([])
  const [elimScenarioIds, setElimScenarioIds] = useState<number[]>([])
  const [tab, setTab] = useState<Tab>('tb')
  const [submitted, setSubmitted] = useState(false)
  const [showGroups, setShowGroups] = useState(false)
  const [groups, setGroups] = useState<ConsolidationGroup[]>(loadGroups)

  const { data: entities = [] } = useQuery({
    queryKey: ['entities'],
    queryFn: () => entitiesApi.list(),
  })

  const enabled = submitted && entityId !== '' && !!asOfDate

  const tbQuery = useQuery({
    queryKey: ['consolidated-tb', entityId, asOfDate, opScenarioIds, elimScenarioIds],
    queryFn: () => consolidationApi.trialBalance(entityId as number, asOfDate, opScenarioIds, elimScenarioIds),
    enabled: enabled && tab === 'tb',
    retry: false,
  })

  const bsQuery = useQuery({
    queryKey: ['consolidated-bs', entityId, asOfDate, opScenarioIds, elimScenarioIds],
    queryFn: () => consolidationApi.balanceSheet(entityId as number, asOfDate, opScenarioIds, elimScenarioIds),
    enabled: enabled && tab === 'bs',
    retry: false,
  })

  const isQuery = useQuery({
    queryKey: ['consolidated-is', entityId, asOfDate, opScenarioIds, elimScenarioIds],
    queryFn: () => consolidationApi.incomeStatement(entityId as number, asOfDate, opScenarioIds, elimScenarioIds),
    enabled: enabled && tab === 'is',
    retry: false,
  })

  const activeQuery = tab === 'tb' ? tbQuery : tab === 'bs' ? bsQuery : isQuery
  const allValidationIssues = tbQuery.data
    ? [...tbQuery.data.validation.errors, ...tbQuery.data.validation.warnings]
    : []

  function applyGroup(g: ConsolidationGroup) {
    setEntityId(g.parentEntityId)
    setMemberEntityIds(g.memberEntityIds)
    setSubmitted(false)
  }

  function saveGroup(g: ConsolidationGroup) {
    const updated = [...groups, g]
    setGroups(updated)
    saveGroups(updated)
  }

  function deleteGroup(id: string) {
    const updated = groups.filter((g) => g.id !== id)
    setGroups(updated)
    saveGroups(updated)
  }

  const memberEntities = useMemo(
    () => entities.filter((e) => memberEntityIds.includes(e.id)),
    [entities, memberEntityIds]
  )

  const TABS: { id: Tab; label: string }[] = [
    { id: 'tb', label: 'Trial Balance' },
    { id: 'bs', label: 'Balance Sheet' },
    { id: 'is', label: 'Income Statement' },
    { id: 'entities', label: `Entities (${memberEntityIds.length + (entityId ? 1 : 0)})` },
    { id: 'taxonomy', label: 'Taxonomy Mapping' },
  ]

  return (
    <PageLayout
      title="Consolidations"
      subtitle="Aggregate trial balances across multiple entities with elimination entries"
    >
      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Consolidation Run</span>
          <button
            type="button"
            onClick={() => setShowGroups((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
            data-testid="toggle-groups-btn"
          >
            <Layers className="w-3.5 h-3.5" />
            {showGroups ? 'Hide Groups' : 'Manage Groups'}
          </button>
        </div>

        {showGroups && (
          <div className="border rounded p-4 bg-gray-50">
            <GroupsPanel
              groups={groups}
              entities={entities}
              onSave={saveGroup}
              onDelete={deleteGroup}
              onSelect={applyGroup}
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Parent / Holding Entity *</label>
            <EntitySelect value={entityId} onChange={(v) => { setEntityId(v); setSubmitted(false) }} />
            <p className="text-[10px] text-gray-400 mt-0.5">Defines consolidation taxonomy</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Member Entities</label>
            <div className="border rounded px-2 py-1.5 text-xs bg-white min-h-[32px] flex flex-wrap gap-1">
              {memberEntities.length === 0 ? (
                <span className="text-gray-400">None — add via Groups</span>
              ) : (
                memberEntities.map((e) => (
                  <span key={e.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                    {e.name}
                    <button onClick={() => setMemberEntityIds((ids) => ids.filter((id) => id !== e.id))} className="hover:text-blue-900">×</button>
                  </span>
                ))
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">As-of Date *</label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Operating Scenarios</label>
              <ScenarioMultiSelect value={opScenarioIds} onChange={setOpScenarioIds} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Elimination Scenarios</label>
            <ScenarioMultiSelect value={elimScenarioIds} onChange={setElimScenarioIds} />
          </div>
          <div className="flex justify-end pt-4">
            <button
              type="button"
              disabled={!entityId || !asOfDate}
              onClick={() => setSubmitted(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
              data-testid="run-consolidation-btn"
            >
              <ChevronRight className="w-4 h-4" /> Run Consolidation
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {submitted && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex border-b border-gray-200">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === id ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                data-testid={`tab-${id}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {(tab === 'tb' || tab === 'bs' || tab === 'is') && (
              <>
                {activeQuery.isFetching && (
                  <div className="py-10 flex items-center justify-center gap-2 text-gray-400 text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
                  </div>
                )}
                {activeQuery.error && (
                  <div className="py-4 text-sm text-rose-600 text-center">
                    Failed to load. Check that the entity is configured as a consolidation parent.
                  </div>
                )}
                {!activeQuery.isFetching && !activeQuery.error && (
                  <>
                    {allValidationIssues.length > 0 && <div className="mb-4"><ValidationBanner issues={allValidationIssues} /></div>}
                    {tab === 'tb' && tbQuery.data && <ConsolidatedTB rows={tbQuery.data.data} />}
                    {tab === 'bs' && bsQuery.data && <ConsolidatedFS rows={bsQuery.data.data} />}
                    {tab === 'is' && isQuery.data && <ConsolidatedFS rows={isQuery.data.data} />}
                  </>
                )}
              </>
            )}
            {tab === 'entities' && entityId !== '' && (
              <EntitySummaryTab
                parentEntityId={entityId as number}
                memberEntityIds={memberEntityIds}
                entities={entities}
              />
            )}
            {tab === 'taxonomy' && (
              <TaxonomyTranslationTab
                memberEntityIds={memberEntityIds}
                entities={entities}
              />
            )}
          </div>
        </div>
      )}

      {!submitted && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-10 text-center text-gray-400 text-sm">
          Select a parent entity and date, then click{' '}
          <span className="font-semibold">Run Consolidation</span>.
          Use <span className="font-semibold">Manage Groups</span> to save reusable entity configurations.
        </div>
      )}
    </PageLayout>
  )
}
