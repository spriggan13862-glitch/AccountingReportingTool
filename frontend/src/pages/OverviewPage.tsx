import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  FileBarChart,
  Search,
  SlidersHorizontal,
  Upload,
  XCircle,
  FlaskConical,
  Zap,
  Download,
  Database,
  Trash2,
} from 'lucide-react'
import { reviewApi } from '@/api/review'
import { journalEntriesApi } from '@/api/journalEntries'
import api from '@/api/client'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { useOrg } from '@/providers/OrgProvider'
import { useToast } from '@/providers/ToastProvider'
import { LoadingState } from '@/components/ui/LoadingState'

const WORKSPACES = [
  { label: 'Import', description: 'Upload and map trial balances', to: '/client-data/imports', icon: Upload },
  { label: 'Review', description: 'Comparative statements and checks', to: '/review', icon: Search },
  { label: 'Adjustments', description: 'Draft and post journal entries', to: '/workbench/journal-entries', icon: SlidersHorizontal },
  { label: 'Financial Statements', description: 'View finalized output', to: '/financial-impact/statements', icon: FileBarChart },
]

const WHATS_NEW = [
  {
    version: 'v9 · Accounting Intelligence',
    date: '2026-06-14',
    items: [
      'Review → Analysis tab now powered by the full 10-rule Accounting Intelligence Engine',
      'Detected Issues: AR growth vs revenue, revenue spikes, inventory build-up, cash/earnings divergence, payroll vs revenue, debt increase, working capital deterioration, gross margin compression, equity surprises, expense fluctuation',
      'Each detected issue shows description, detection trigger, suggested procedures, and suggested AJEs (expandable)',
      'Critical data fixes: entity list scoped to org, rollback reversal now uses batch as-of-date (not today)',
      'Import post blocked when unmapped lines remain; cross-entity account validation on JE post',
      'JE post warnings surfaced as 8-second toasts (no longer lost on navigation)',
      'Adjustment Bridge auto-computes on first load; no manual "Compute" click required',
      'Review empty state shows actionable "Manage Entities" / "Manage Periods" buttons',
    ],
  },
  {
    version: 'v8 · Phase 8',
    date: '2026-06-14',
    items: [
      'Removed duplicate entity/period selectors from top nav — use the context bar exclusively',
      'Import center entity filter auto-syncs from context bar (no separate entity picker)',
      'PDF import "View" navigates directly to the specific batch, not the upload screen',
      'Import cards redesigned — compact 7-column grid, single-line text',
      'Downloadable CSV templates for Format A, B, C, D in the import format help section',
      'Developer Tools panel on this page (seed data, sample TB, snapshot, post-all, reset)',
    ],
  },
  {
    version: 'v7 · Phase 7',
    date: '2026-06-13',
    items: [
      'Delete button on all import types (TB, PDF, COA)',
      'Duplicate file detection with "Import anyway" banner',
      'Staging entity type; entity quick-create from context bar dropdown',
    ],
  },
  {
    version: 'v6 · QuickBooks',
    date: '2026-06-12',
    items: [
      'QuickBooks Online OAuth connect + Desktop IIF/Excel upload',
      'Pull COA, Trial Balance, P&L, Balance Sheet per month-end',
      'Auto-taxonomy mapping from QB AccountType',
    ],
  },
]

function ContextPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  )
}

function JeCountCard({ label, count, color, to }: { label: string; count: number; color: string; to: string }) {
  return (
    <Link to={to} className={`rounded-lg border bg-white px-4 py-3 hover:shadow-sm transition-shadow ${color}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-900">{count}</p>
    </Link>
  )
}

export function OverviewPage() {
  const { activeEntity, setActiveEntity, activePeriod, setActivePeriod, activeScenarioIds, dataView } = useWorkspace()
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const toast = useToast()
  const queryClient = useQueryClient()
  const [showDevTools, setShowDevTools] = useState(false)
  const [showWhatsNew, setShowWhatsNew] = useState(false)

  const hasContext = !!activeEntity && !!activePeriod

  const { data: reviewData, isLoading: reviewLoading } = useQuery({
    queryKey: ['overview-checks', activeEntity?.id, activePeriod?.end_date, activeScenarioIds, dataView],
    queryFn: () =>
      reviewApi.getStatements({
        entity_id: activeEntity!.id,
        as_of_date: activePeriod!.end_date,
        scenario_ids: activeScenarioIds,
        data_view: dataView,
        include_checks: true,
      }),
    enabled: hasContext,
    staleTime: 60_000,
  })

  const { data: draftJes } = useQuery({
    queryKey: ['je-count-draft', activeEntity?.id],
    queryFn: () => journalEntriesApi.list({ entity_id: activeEntity!.id, status: 'draft', page_size: 1 }),
    enabled: !!activeEntity,
    staleTime: 30_000,
    select: (items) => items.length,
  })

  const { data: postedJes } = useQuery({
    queryKey: ['je-count-posted', activeEntity?.id],
    queryFn: () => journalEntriesApi.list({ entity_id: activeEntity!.id, status: 'posted', page_size: 1 }),
    enabled: !!activeEntity,
    staleTime: 60_000,
    select: (items) => items.length,
  })

  const resetMutation = useMutation({
    mutationFn: () => api.delete(`/dev/reset?org_id=${orgId}`).then((r) => r.data),
    onSuccess: (data: { deleted: Record<string, number> }) => {
      // Clear workspace context — entities no longer exist after reset
      setActiveEntity(null)
      setActivePeriod(null)
      // Wipe entire query cache so no stale data shows anywhere
      queryClient.clear()
      const total = Object.values(data.deleted).reduce((s, n) => s + n, 0)
      toast(`Reset complete — ${total} records deleted.`, 'success')
    },
    onError: (err: Error) => toast(`Reset failed: ${err.message}`, 'error'),
  })

  const seedMutation = useMutation({
    mutationFn: () => api.post(`/dev/seed?org_id=${orgId}`).then((r) => r.data),
    onSuccess: (data: { entity_code: string; periods_created: number; accounts_created: number }) => {
      queryClient.invalidateQueries()
      toast(`Seeded ${data.entity_code} — ${data.periods_created} periods, ${data.accounts_created} accounts.`, 'success')
    },
    onError: (err: Error) => toast(`Seed failed: ${err.message}`, 'error'),
  })

  const clearImportsMutation = useMutation({
    mutationFn: () => api.delete(`/dev/clear-imports?org_id=${orgId}`).then((r) => r.data),
    onSuccess: (data: { total: number }) => {
      queryClient.clear()
      toast(`Import queue cleared — ${data.total} records deleted.`, 'success')
    },
    onError: (err: Error) => toast(`Clear failed: ${err.message}`, 'error'),
  })

  const postAllMutation = useMutation({
    mutationFn: () => {
      if (!activeEntity?.id) throw new Error('Select an entity in the context bar first')
      return api.post(`/dev/post-all-ready?entity_id=${activeEntity.id}`).then((r) => r.data)
    },
    onSuccess: (data: { posted: number[]; errors: Array<{ batch_id: number; error: string }> }) => {
      queryClient.invalidateQueries()
      toast(`Posted ${data.posted.length} batch${data.posted.length !== 1 ? 'es' : ''}${data.errors.length > 0 ? `, ${data.errors.length} errors` : ''}.`, data.errors.length > 0 ? 'error' : 'success')
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  function downloadSampleTB() {
    const rows = [
      'account_number,account_name,debit,credit',
      '1000,Cash and Cash Equivalents,125000.00,',
      '1100,Accounts Receivable,87500.00,',
      '1200,Inventory,43200.00,',
      '1300,Prepaid Expenses,6800.00,',
      '1500,Property Plant & Equipment,350000.00,',
      '1600,Accumulated Depreciation,,42000.00',
      '2000,Accounts Payable,,52000.00',
      '2100,Accrued Liabilities,,18500.00',
      '2200,Short-Term Debt,,30000.00',
      '2500,Long-Term Debt,,200000.00',
      '3000,Common Stock,,100000.00',
      '3100,Retained Earnings,,120000.00',
      '4000,Revenue,,280000.00',
      '4100,Service Revenue,,45000.00',
      '5000,Cost of Goods Sold,98000.00,',
      '6000,Salaries and Wages,72000.00,',
      '6100,Rent Expense,24000.00,',
      '6200,Utilities Expense,8400.00,',
      '6300,Depreciation Expense,14000.00,',
      '6400,Interest Expense,9600.00,',
      '6900,Other Operating Expenses,49000.00,',
    ].join('\n')
    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sample_trial_balance.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const checks = reviewData?.checks ?? []
  const failedChecks = checks.filter((c) => !c.passed)
  const passedChecks = checks.filter((c) => c.passed)

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">Active engagement context and status</p>
        </div>
        <span className="shrink-0 text-[10px] font-mono text-gray-400 bg-gray-100 border border-gray-200 rounded px-2 py-1 mt-1">
          v8 · {import.meta.env.VITE_APP_GIT_HASH?.slice(0, 7) ?? 'dev'}
        </span>
      </div>

      {/* Context cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ContextPill label="Entity" value={activeEntity ? `${activeEntity.code} — ${activeEntity.name}` : 'None selected'} />
        <ContextPill label="Period" value={activePeriod?.period_name ?? 'None selected'} />
        <ContextPill label="Scenarios" value={activeScenarioIds.length > 0 ? `${activeScenarioIds.length} selected` : 'All'} />
        <ContextPill label="Data View" value={{ as_reported: 'As Reported', adjusted: 'Adjusted', pro_forma: 'Pro Forma' }[dataView]} />
      </div>

      {/* JE counts */}
      {activeEntity && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-2">Journal Entries</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <JeCountCard label="Draft" count={draftJes ?? 0} color="border-amber-200" to="/workbench/journal-entries?status=draft" />
            <JeCountCard label="Posted" count={postedJes ?? 0} color="border-green-200" to="/workbench/journal-entries?status=posted" />
            <Link
              to="/workbench/journal-entries/new"
              className="rounded-lg border border-dashed border-blue-300 bg-blue-50 px-4 py-3 flex items-center gap-2 hover:bg-blue-100 transition-colors"
            >
              <BookOpen className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="text-sm font-medium text-blue-700">New Journal Entry</span>
            </Link>
          </div>
        </div>
      )}

      {/* Checks panel */}
      {hasContext && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-2">
            Automated Checks
            {reviewLoading && <span className="ml-2 text-xs text-gray-400 font-normal">Loading…</span>}
          </h2>
          {reviewLoading ? (
            <LoadingState />
          ) : (
            <div className="space-y-2">
              {failedChecks.map((check) => (
                <div key={check.name} className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                  <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-red-800">{check.name}</p>
                    <p className="text-xs text-red-600 mt-0.5">{check.detail}</p>
                  </div>
                </div>
              ))}
              {passedChecks.map((check) => (
                <div key={check.name} className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-green-700">{check.name}</p>
                </div>
              ))}
              {checks.length === 0 && <p className="text-xs text-gray-400 italic">No checks available</p>}
            </div>
          )}
        </div>
      )}

      {!hasContext && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Context not set</p>
            <p className="text-xs text-amber-600 mt-0.5">Select an entity and period in the context bar above to load checks and balances.</p>
          </div>
        </div>
      )}

      {/* Workspace quick links */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 mb-2">Workspaces</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {WORKSPACES.map(({ label, description, to, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 hover:shadow-sm hover:border-gray-300 transition-all"
            >
              <Icon className="h-5 w-5 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-500">{description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* Developer Tools */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/30 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDevTools((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-violet-50/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-violet-600" />
            <span className="text-xs font-bold text-violet-700">Developer Tools</span>
            <span className="text-[9px] font-semibold uppercase tracking-wide bg-violet-100 text-violet-500 px-1.5 py-0.5 rounded">dev only</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-violet-400 transition-transform ${showDevTools ? 'rotate-180' : ''}`} />
        </button>

        {showDevTools && (
          <div className="border-t border-violet-100 px-4 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

            <div className="rounded-lg border border-violet-200 bg-white p-3 flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold text-gray-800">Seed Demo Data</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Creates "Demo Corp" entity with 12 monthly periods and 21-account chart of accounts.</p>
              </div>
              <button
                type="button"
                disabled={seedMutation.isPending || !orgId}
                onClick={() => seedMutation.mutate()}
                className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                {seedMutation.isPending ? 'Seeding…' : 'Seed Demo Data'}
              </button>
            </div>

            <div className="rounded-lg border border-violet-200 bg-white p-3 flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold text-gray-800">Download Sample Trial Balance</p>
                <p className="text-[11px] text-gray-500 mt-0.5">21-account Format A CSV, balanced at $887,500 Dr = $887,500 Cr. Drop into the TB importer.</p>
              </div>
              <button
                type="button"
                onClick={downloadSampleTB}
                className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </button>
            </div>

            <div className="rounded-lg border border-violet-200 bg-white p-3 flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold text-gray-800">Export Data Snapshot</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Downloads all entities, accounts, periods, batches and JEs as JSON. Take a backup before destructive ops.</p>
              </div>
              <button
                type="button"
                onClick={() => window.open(`/api/v1/dev/snapshot?org_id=${orgId}`, '_blank')}
                className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                <Database className="w-3.5 h-3.5" />
                Export JSON
              </button>
            </div>

            <div className="rounded-lg border border-violet-200 bg-white p-3 flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold text-gray-800">Post All Ready Imports</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Posts every <code className="bg-gray-100 px-0.5 rounded text-[10px]">ready_to_post</code> TB batch for the entity in the context bar.</p>
              </div>
              <button
                type="button"
                disabled={postAllMutation.isPending || !activeEntity}
                onClick={() => postAllMutation.mutate()}
                className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {postAllMutation.isPending ? 'Posting…' : `Post All Ready${activeEntity ? ` (${activeEntity.code})` : ''}`}
              </button>
            </div>

            <div className="rounded-lg border border-orange-200 bg-white p-3 flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold text-orange-700">Clear Import Queue</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Deletes all TB, PDF, and COA import batches for this org. Keeps entities, accounts, periods, and JEs intact.</p>
              </div>
              <button
                type="button"
                disabled={clearImportsMutation.isPending || !orgId}
                onClick={() => {
                  if (window.confirm('Delete all import batches for this org?')) {
                    clearImportsMutation.mutate()
                  }
                }}
                className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {clearImportsMutation.isPending ? 'Clearing…' : 'Clear Import Queue'}
              </button>
            </div>

            <div className="rounded-lg border border-red-200 bg-white p-3 flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold text-red-700">Reset All Data</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Wipes all entities, accounts, periods, import batches and journal entries. <strong>Cannot be undone.</strong></p>
              </div>
              <button
                type="button"
                disabled={resetMutation.isPending || !orgId}
                onClick={() => {
                  if (window.confirm('DELETE ALL data for this org? Export a snapshot first if needed. Cannot be undone.')) {
                    resetMutation.mutate()
                  }
                }}
                className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {resetMutation.isPending ? 'Resetting…' : 'Reset All Data'}
              </button>
            </div>

          </div>
        )}
      </div>

      {/* What's New */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setShowWhatsNew((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
        >
          <span className="text-xs font-bold text-gray-700">What's New</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showWhatsNew ? 'rotate-180' : ''}`} />
        </button>
        {showWhatsNew && (
          <div className="border-t border-gray-100 px-4 py-4 space-y-4">
            {WHATS_NEW.map(({ version, date, items }) => (
              <div key={version} className="flex gap-3">
                <div className="shrink-0 text-right w-28">
                  <span className="text-[10px] font-bold text-gray-700">{version}</span>
                  <p className="text-[9px] text-gray-400 mt-0.5">{date}</p>
                </div>
                <div className="border-l border-gray-200 pl-3 flex-1">
                  <ul className="space-y-0.5">
                    {items.map((item, i) => (
                      <li key={i} className="text-[11px] text-gray-600 flex gap-1.5 items-baseline">
                        <span className="text-gray-300 shrink-0">·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
