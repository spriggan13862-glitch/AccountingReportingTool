import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle, ChevronRight, RefreshCw, XCircle } from 'lucide-react'
import { consolidationApi, type ConsolidatedFsLine } from '@/api/consolidation'
import { PageLayout } from '@/components/ui/PageLayout'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { ScenarioMultiSelect } from '@/components/ui/ScenarioMultiSelect'
import type { TBRow } from '@/types'

const fmt = (val: string | number) => {
  const n = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(n) || n === 0) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type Tab = 'tb' | 'bs' | 'is'

// ---------------------------------------------------------------------------
// Consolidated Trial Balance
// ---------------------------------------------------------------------------

function ConsolidatedTB({ rows }: { rows: TBRow[] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">No accounts in consolidated trial balance.</p>
  }
  const totalDebit = rows.reduce((s, r) => s + parseFloat(r.total_debit ?? '0'), 0)
  const totalCredit = rows.reduce((s, r) => s + parseFloat(r.total_credit ?? '0'), 0)
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01

  return (
    <div className="overflow-x-auto">
      <div className={`mb-3 flex items-center gap-2 text-xs px-3 py-2 rounded border ${balanced ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
        {balanced
          ? <><CheckCircle className="w-3.5 h-3.5" /> Consolidated trial balance is in balance</>
          : <><XCircle className="w-3.5 h-3.5" /> Out of balance — debits and credits differ by {fmt(Math.abs(totalDebit - totalCredit))}</>
        }
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
// Consolidated FS (Balance Sheet or Income Statement)
// ---------------------------------------------------------------------------

function ConsolidatedFS({ rows }: { rows: ConsolidatedFsLine[] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">No taxonomy lines configured for this entity.</p>
  }

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
                  <tr key={r.line_id} className={`hover:bg-gray-50 ${r.parent_line_id ? 'pl-4' : ''}`}>
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
// Validation Issues
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
// Main Page
// ---------------------------------------------------------------------------

export function ConsolidationsPage() {
  const [entityId, setEntityId] = useState<number | ''>('')
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10))
  const [opScenarioIds, setOpScenarioIds] = useState<number[]>([])
  const [elimScenarioIds, setElimScenarioIds] = useState<number[]>([])
  const [tab, setTab] = useState<Tab>('tb')
  const [submitted, setSubmitted] = useState(false)

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

  return (
    <PageLayout
      title="Consolidations"
      subtitle="Aggregate trial balances across multiple entities with elimination entries"
    >
      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Consolidation Entity *</label>
            <EntitySelect value={entityId} onChange={setEntityId} />
            <p className="text-[10px] text-gray-400 mt-0.5">Parent or holding entity that owns the subsidiaries</p>
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
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Operating Scenarios</label>
            <ScenarioMultiSelect value={opScenarioIds} onChange={setOpScenarioIds} placeholder="All scenarios" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Elimination Scenarios</label>
            <ScenarioMultiSelect value={elimScenarioIds} onChange={setElimScenarioIds} placeholder="None" />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!entityId || !asOfDate}
            onClick={() => setSubmitted(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" /> Run Consolidation
          </button>
        </div>
      </div>

      {/* Results */}
      {submitted && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200">
            {([['tb', 'Consolidated Trial Balance'], ['bs', 'Balance Sheet'], ['is', 'Income Statement']] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-5">
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
          </div>
        </div>
      )}

      {!submitted && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-10 text-center text-gray-400 text-sm">
          Select a consolidation entity and date, then click <span className="font-semibold">Run Consolidation</span>.
        </div>
      )}
    </PageLayout>
  )
}
