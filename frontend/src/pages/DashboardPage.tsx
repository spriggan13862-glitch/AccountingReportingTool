import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { workflowApi } from '@/api/workflow'
import { reportsApi } from '@/api/reports'
import { journalEntriesApi } from '@/api/journalEntries'
import { tbImportApi } from '@/api/tbImport'
import { importRegistryApi } from '@/api/importRegistry'
import api from '@/api/client'
import { useOrg } from '@/providers/OrgProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { PageLayout } from '@/components/ui/PageLayout'
import { StatusBadge, SeverityBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { SetupWizardPage } from '@/pages/SetupWizardPage'
import { AlertCircle, Clock, CheckCircle, ChevronRight, FileText, Trash2, FlaskConical, Download, Database, Zap, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

const PDF_INCOMPLETE_STATUSES = new Set(['uploaded', 'parsed', 'validation_failed', 'failed', 'error', 'awaiting mapping', 'mapping_required'])
const PDF_READY_STATUSES = new Set(['ready for review', 'ready_to_post'])


const QUICK_LINKS = [
  { label: 'Import Center', to: '/client-data/imports', description: 'upload trial balances, PDFs, and COAs' },
  { label: 'Chart of Accounts', to: '/client-data/chart-of-accounts', description: 'validate account classifications' },
  { label: 'Journal Entries', to: '/workbench/journal-entries', description: 'prepare Adjusting Journal Entries' },
  { label: 'Adjustment Bridge', to: '/workbench/adjustment-bridge', description: 'book vs. GAAP pro forma analysis' },
  { label: 'Financial Statements', to: '/financial-impact/statements', description: 'view draft-adjusted financials' },
  { label: 'Source Documents', to: '/client-data/documents', description: 'all uploaded files and import history' },
]

const WORKFLOW_PHASES = [
  { label: 'Client Books', description: 'Import & map data', to: '/client-data/imports' },
  { label: 'Adjustments', description: 'Draft & post JEs', to: '/workbench/adjustment-bridge' },
  { label: 'Financial Impact', description: 'Review statements', to: '/financial-impact/statements' },
  { label: 'Deliverables', description: 'Close & deliver', to: '/deliverables/close-package' },
]

function WorkflowStrip() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-1 overflow-x-auto" data-testid="workflow-strip">
      {WORKFLOW_PHASES.map((phase, i) => (
        <div key={phase.label} className="flex items-center gap-1 min-w-0">
          <Link
            to={phase.to}
            className="flex flex-col min-w-0 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors group"
          >
            <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-700 whitespace-nowrap">{phase.label}</span>
            <span className="text-[10px] text-slate-400 whitespace-nowrap">{phase.description}</span>
          </Link>
          {i < WORKFLOW_PHASES.length - 1 && (
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          )}
        </div>
      ))}
    </div>
  )
}

function QuickLinks() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <h2 className="mb-3 text-xs font-bold text-slate-450 uppercase tracking-wider">Operational Workbench Quick Links</h2>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 hover:border-amber-300 hover:bg-amber-50/5 transition-all shadow-sm flex flex-col justify-between"
          >
            <div className="text-xs font-bold text-slate-800">{link.label}</div>
            <div className="mt-1 text-[11px] text-slate-400 font-medium leading-normal">{link.description}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function OperationalStatusCards({ orgId }: { orgId: number }) {
  const navigate = useNavigate()
  const { data: batches } = useQuery({
    queryKey: ['import-batches', orgId],
    queryFn: () => tbImportApi.listBatches(orgId),
    enabled: !!orgId,
  })
  const { data: pdfBatches } = useQuery({
    queryKey: ['import-registry-pdf'],
    queryFn: () => importRegistryApi.list(),
    enabled: !!orgId,
    select: (entries) => entries.filter((e) => e.source_module === 'pdf_import'),
  })

  const pending = batches?.filter((b) => ['mapping_required', 'validation_failed'].includes(b.status)) ?? []
  const readyToPost = batches?.filter((b) => b.status === 'ready_to_post') ?? []
  const totalUnmapped = batches?.reduce((acc, b) => acc + (b.unmapped_row_count ?? 0), 0) ?? 0
  const pdfIncomplete = pdfBatches?.filter((e) => PDF_INCOMPLETE_STATUSES.has(e.status.toLowerCase())) ?? []
  const pdfReady = pdfBatches?.filter((e) => PDF_READY_STATUSES.has(e.status.toLowerCase())) ?? []

  if (!pending.length && !readyToPost.length && !pdfIncomplete.length && !pdfReady.length) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {pending.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/import')}
          className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-left hover:bg-yellow-100 transition-colors"
        >
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-yellow-800">{pending.length} TB import{pending.length > 1 ? 's' : ''} need attention</p>
            <p className="text-xs text-yellow-600">{totalUnmapped} unmapped accounts</p>
          </div>
        </button>
      )}
      {readyToPost.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/import')}
          className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-left hover:bg-green-100 transition-colors"
        >
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">{readyToPost.length} TB import{readyToPost.length > 1 ? 's' : ''} ready to post</p>
            <p className="text-xs text-green-600">Validated and awaiting posting</p>
          </div>
        </button>
      )}
      {pdfIncomplete.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/pdf-import')}
          className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-left hover:bg-orange-100 transition-colors"
        >
          <Clock className="w-5 h-5 text-orange-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-orange-800">{pdfIncomplete.length} PDF import{pdfIncomplete.length > 1 ? 's' : ''} incomplete</p>
            <p className="text-xs text-orange-600">Review or continue import</p>
          </div>
        </button>
      )}
      {pdfReady.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/documents')}
          className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-left hover:bg-emerald-100 transition-colors"
        >
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">{pdfReady.length} PDF import{pdfReady.length > 1 ? 's' : ''} ready to apply</p>
            <p className="text-xs text-emerald-600">Validated and awaiting apply</p>
          </div>
        </button>
      )}
    </div>
  )
}

export function DashboardPage() {
  const { org } = useOrg()
  const { user } = useAuth()
  const orgId = org?.id ?? 0
  const toast = useToast()
  const queryClient = useQueryClient()

  const { activeEntity } = useWorkspace()

  const resetMutation = useMutation({
    mutationFn: () => api.delete(`/dev/reset?org_id=${orgId}`).then((r) => r.data),
    onSuccess: (data: { deleted: Record<string, number> }) => {
      queryClient.invalidateQueries()
      const total = Object.values(data.deleted).reduce((s, n) => s + n, 0)
      toast(`Reset complete — ${total} records deleted.`, 'success')
    },
    onError: (err: Error) => toast(`Reset failed: ${err.message}`, 'error'),
  })

  const seedMutation = useMutation({
    mutationFn: () => api.post(`/dev/seed?org_id=${orgId}`).then((r) => r.data),
    onSuccess: (data: { entity_code: string; periods_created: number; accounts_created: number }) => {
      queryClient.invalidateQueries()
      toast(`Seeded ${data.entity_code} — ${data.periods_created} periods, ${data.accounts_created} accounts created.`, 'success')
    },
    onError: (err: Error) => toast(`Seed failed: ${err.message}`, 'error'),
  })

  const postAllMutation = useMutation({
    mutationFn: () => {
      if (!activeEntity?.id) throw new Error('Select an entity in the context bar first')
      return api.post(`/dev/post-all-ready?entity_id=${activeEntity.id}`).then((r) => r.data)
    },
    onSuccess: (data: { posted: number[]; errors: Array<{ batch_id: number; error: string }> }) => {
      queryClient.invalidateQueries()
      if (data.errors.length > 0) {
        toast(`Posted ${data.posted.length} batches, ${data.errors.length} errors`, 'error')
      } else {
        toast(`Posted ${data.posted.length} batch${data.posted.length !== 1 ? 'es' : ''} successfully`, 'success')
      }
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

  function downloadSnapshot() {
    window.open(`/api/v1/dev/snapshot?org_id=${orgId}`, '_blank')
  }

  const [showDevTools, setShowDevTools] = useState(false)

  const status = useQuery({
    queryKey: ['onboarding-status', orgId],
    queryFn: async () => {
      const res = await fetch('/api/v1/setup/onboarding-status')
      if (!res.ok) throw new Error('Failed to load onboarding status')
      return res.json() as Promise<{
        entity_count: number
        active_entity_count: number
        import_batch_count: number
        pending_imports: number
        posted_imports: number
        unmapped_line_count: number
        has_journal_entries: boolean
        coa_batch_count: number
        coa_applied_count: number
        setup_steps_complete: string[]
        setup_progress: number
      }>
    },
    enabled: orgId > 0,
  })

  const batches = useQuery({
    queryKey: ['import-batches', orgId],
    queryFn: () => tbImportApi.listBatches(orgId),
    enabled: orgId > 0,
  })

  const tasks = useQuery({
    queryKey: ['tasks', orgId],
    queryFn: () => workflowApi.listTasks(orgId, { status: 'open' }),
    enabled: orgId > 0,
  })

  const issues = useQuery({
    queryKey: ['issues', orgId],
    queryFn: () => workflowApi.listIssues(orgId, { status: 'open' }),
    enabled: orgId > 0,
  })

  const jes = useQuery({
    queryKey: ['journal-entries'],
    queryFn: () => journalEntriesApi.list(),
    enabled: orgId > 0,
  })

  const pdfRegistry = useQuery({
    queryKey: ['import-registry-pdf'],
    queryFn: () => importRegistryApi.list(),
    enabled: orgId > 0,
    select: (entries) => entries.filter((e) => e.source_module === 'pdf_import'),
  })

  if (!org) {
    return (
      <PageLayout title="Dashboard">
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          <p className="text-sm">No organization selected.</p>
          <p className="mt-1 text-xs text-gray-400">Use the organization switcher in the top nav to get started.</p>
        </div>
      </PageLayout>
    )
  }

  // Metric computations
  const pendingImportsCount = batches.data?.filter((b) => ['mapping_required', 'validation_failed', 'uploaded', 'parsed'].includes(b.status)).length ?? 0
  const pdfNeedsAttention = pdfRegistry.data?.filter((e) => PDF_INCOMPLETE_STATUSES.has(e.status.toLowerCase())).length ?? 0
  const pdfReadyToApply = pdfRegistry.data?.filter((e) => PDF_READY_STATUSES.has(e.status.toLowerCase())).length ?? 0
  const unmappedAccountsCount = status.data?.unmapped_line_count ?? 0
  const draftAJEs = jes.data?.filter((je) => je.status === 'draft') ?? []
  const draftAJEsCount = draftAJEs.length
  const draftAJEsTotalValue = draftAJEs.reduce((sum, je) => {
    return sum + je.lines.reduce((s, line) => s + parseFloat(line.debit || '0'), 0)
  }, 0)

  const outOfBalanceCount = batches.data?.filter((b) => {
    const db = parseFloat(b.total_debits || '0')
    const cr = parseFloat(b.total_credits || '0')
    return Math.abs(db - cr) > 0.005
  }).length ?? 0

  // Next Recommended Action logic
  let nextAction = {
    title: 'Review Adjusted Financial Reports',
    description: 'All trial balances are imported, mapped, and balanced. Analyze the adjustment bridge and view financial reports.',
    link: '/financial-statements',
    linkLabel: 'View Reports Preview →',
    severity: 'info'
  }

  if (outOfBalanceCount > 0) {
    nextAction = {
      title: 'Resolve Out-of-Balance Imports',
      description: 'One or more imported trial balances do not have debits matching credits.',
      link: '/import',
      linkLabel: 'Troubleshoot Imports →',
      severity: 'error'
    }
  } else if (pendingImportsCount > 0) {
    nextAction = {
      title: 'Post/Map Pending Trial Balance Imports',
      description: 'You have trial balance imports that require taxonomy mapping or are ready to be posted.',
      link: '/import',
      linkLabel: 'Go to Import Center →',
      severity: 'warning'
    }
  } else if (unmappedAccountsCount > 0) {
    nextAction = {
      title: 'Map Unassigned Chart of Accounts',
      description: 'There are accounts currently in your chart of accounts that have not been assigned to a taxonomy reporting line.',
      link: '/taxonomy-admin',
      linkLabel: 'Complete Taxonomy Mapping →',
      severity: 'warning'
    }
  } else if (draftAJEsCount > 0) {
    nextAction = {
      title: 'Review and Post Draft Adjusting Entries',
      description: 'You have draft Adjusting Journal Entries (AJEs) awaiting review, approval, and posting.',
      link: '/journal-entries',
      linkLabel: 'Manage Journal Entries →',
      severity: 'info'
    }
  }

  return (
    <PageLayout title="Dashboard" subtitle={`Overview for ${org.name}`}>
      <div className="space-y-6">
        {/* Guided onboarding wizard (dismissible) */}
        <SetupWizardPage />

        {/* Workflow phase navigation */}
        <WorkflowStrip />

        {/* Operational status alerts */}
        <OperationalStatusCards orgId={orgId} />

        {/* Next Recommended Action */}
        <div className={cn(
          "rounded-xl border p-4 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white",
          nextAction.severity === 'warning' ? "border-amber-200 bg-amber-50/5" :
          nextAction.severity === 'error' ? "border-rose-200 bg-rose-50/5" : "border-slate-200 bg-slate-50/5"
        )}>
          <div className="space-y-1">
            <span className={cn(
              "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
              nextAction.severity === 'warning' ? "bg-amber-100 text-amber-800" :
              nextAction.severity === 'error' ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-800"
            )}>
              Recommended Action
            </span>
            <h3 className="text-sm font-bold text-slate-900 mt-1">{nextAction.title}</h3>
            <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-2xl">{nextAction.description}</p>
          </div>
          <Link
            to={nextAction.link}
            className={cn(
              "shrink-0 text-xs font-bold px-3.5 py-2 rounded-lg border transition-all shadow-sm",
              nextAction.severity === 'warning' ? "border-amber-300 bg-amber-500 text-white hover:bg-amber-600 hover:border-amber-600" :
              nextAction.severity === 'error' ? "border-rose-300 bg-rose-500 text-white hover:bg-rose-600 hover:border-rose-600" :
              "border-slate-300 bg-slate-800 text-white hover:bg-slate-900 hover:border-slate-900"
            )}
          >
            {nextAction.linkLabel}
          </Link>
        </div>

        {/* Operational Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Pending Imports */}
          <div className="rounded-xl border border-yellow-200 bg-yellow-50/20 p-4 shadow-sm relative overflow-hidden flex flex-col justify-between h-32 hover:shadow transition-all duration-200">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-wider">Pending Imports</span>
              <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 text-[9px] font-bold">Action Needed</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{pendingImportsCount}</span>
              <span className="text-xs text-slate-500 font-medium">awaiting mapping/post</span>
            </div>
            <Link to="/import" className="text-xs text-yellow-750 hover:text-yellow-850 font-semibold inline-flex items-center gap-1 mt-2 hover:underline">
              Resolve in Import Center →
            </Link>
          </div>

          {/* Card 2: Taxonomy Exceptions */}
          <div className="rounded-xl border border-amber-250 bg-amber-50/20 p-4 shadow-sm relative overflow-hidden flex flex-col justify-between h-32 hover:shadow transition-all duration-200">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Taxonomy Exceptions</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">Unmapped</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{unmappedAccountsCount}</span>
              <span className="text-xs text-slate-500 font-medium">accounts unmapped</span>
            </div>
            <Link to="/taxonomy-admin" className="text-xs text-amber-700 hover:text-amber-850 font-semibold inline-flex items-center gap-1 mt-2 hover:underline">
              Review Map Exceptions →
            </Link>
          </div>

          {/* Card 3: Draft AJEs */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/20 p-4 shadow-sm relative overflow-hidden flex flex-col justify-between h-32 hover:shadow transition-all duration-200">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Draft AJEs</span>
              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-bold">Pro Forma</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{draftAJEsCount}</span>
              <span className="text-xs text-slate-500 font-medium">entries (${draftAJEsTotalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
            </div>
            <Link to="/journal-entries" className="text-xs text-blue-700 hover:text-blue-850 font-semibold inline-flex items-center gap-1 mt-2 hover:underline">
              Manage Journal Entries →
            </Link>
          </div>

          {/* Card 4: Out of Balance Batches */}
          <div className="rounded-xl border border-rose-200 bg-rose-50/20 p-4 shadow-sm relative overflow-hidden flex flex-col justify-between h-32 hover:shadow transition-all duration-200">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Out-of-Balance Imports</span>
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[9px] font-bold",
                outOfBalanceCount > 0 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
              )}>
                {outOfBalanceCount > 0 ? "Error" : "Balanced"}
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{outOfBalanceCount}</span>
              <span className="text-xs text-slate-500 font-medium">batches out of balance</span>
            </div>
            <Link to="/import" className="text-xs text-rose-700 hover:text-rose-850 font-semibold inline-flex items-center gap-1 mt-2 hover:underline">
              Validate TB Batches →
            </Link>
          </div>

          {/* Card 5: PDF Imports */}
          <div className={cn(
            "rounded-xl border p-4 shadow-sm relative overflow-hidden flex flex-col justify-between h-32 hover:shadow transition-all duration-200",
            pdfNeedsAttention > 0 ? "border-orange-200 bg-orange-50/20" : pdfReadyToApply > 0 ? "border-emerald-200 bg-emerald-50/20" : "border-slate-200 bg-slate-50/20"
          )}>
            <div className="flex justify-between items-start">
              <span className={cn("text-[10px] font-bold uppercase tracking-wider", pdfNeedsAttention > 0 ? "text-orange-600" : pdfReadyToApply > 0 ? "text-emerald-600" : "text-slate-500")}>
                PDF Imports
              </span>
              <FileText className={cn("w-3.5 h-3.5 mt-0.5", pdfNeedsAttention > 0 ? "text-orange-400" : pdfReadyToApply > 0 ? "text-emerald-400" : "text-slate-300")} />
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {pdfNeedsAttention > 0 ? pdfNeedsAttention : pdfReadyToApply > 0 ? pdfReadyToApply : pdfRegistry.data?.length ?? 0}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {pdfNeedsAttention > 0 ? 'need attention' : pdfReadyToApply > 0 ? 'ready to apply' : 'total batches'}
              </span>
            </div>
            <Link to="/pdf-import" className={cn("text-xs font-semibold inline-flex items-center gap-1 mt-2 hover:underline", pdfNeedsAttention > 0 ? "text-orange-700" : pdfReadyToApply > 0 ? "text-emerald-700" : "text-slate-500")}>
              {pdfNeedsAttention > 0 ? 'Continue PDF Imports →' : pdfReadyToApply > 0 ? 'Review & Apply →' : 'Open PDF Import →'}
            </Link>
          </div>
        </div>

        {/* Welcome message for the logged-in user */}
        {user && (
          <p className="text-xs text-slate-400 font-medium">
            Logged in as <span className="font-semibold text-slate-650">{user.full_name}</span> ({user.email})
          </p>
        )}

        {/* Dashboard Operational Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Columns: Reviews & Imports */}
          <div className="lg:col-span-2 space-y-6">
            {/* Reviews */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-bold text-slate-850 uppercase tracking-wider mb-4">
                Journal Entries Pending Review
              </h2>
              {jes.isLoading && <LoadingState message="Loading entries…" />}
              {jes.isError && <ErrorState message="Could not load journal entries." />}
              {jes.data && (
                jes.data.filter((je) => je.status === 'draft').length === 0 ? (
                  <p className="text-xs text-slate-450 font-medium py-6 text-center">
                    All journal entries have been finalized and posted! No items pending review.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-slate-700">
                      <thead>
                        <tr className="border-b text-slate-400 uppercase text-[9px] font-bold tracking-wider">
                          <th className="pb-2">JE Number</th>
                          <th className="pb-2">Description</th>
                          <th className="pb-2">Date</th>
                          <th className="pb-2 text-right">Value</th>
                          <th className="pb-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jes.data.filter((je) => je.status === 'draft').slice(0, 5).map((je) => {
                          const jeTotalAmt = je.lines.reduce((s, l) => s + parseFloat(l.debit || '0'), 0)
                          return (
                            <tr key={je.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                              <td className="py-2.5 font-mono font-bold text-slate-900">{je.je_number}</td>
                              <td className="py-2.5 text-slate-650 truncate max-w-[200px]" title={je.description}>
                                {je.description}
                              </td>
                              <td className="py-2.5 text-slate-400">{je.entry_date}</td>
                              <td className="py-2.5 text-right font-mono text-slate-800">${jeTotalAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td className="py-2.5 text-right">
                                <Link to="/journal-entries" className="text-amber-500 hover:text-amber-600 font-semibold hover:underline">
                                  Review
                                </Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* Pipeline status */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-bold text-slate-855 uppercase tracking-wider mb-4">
                Active Import Pipeline
              </h2>
              {batches.isLoading && <LoadingState message="Loading batches…" />}
              {batches.isError && <ErrorState message="Could not load batches." />}
              {batches.data && (
                batches.data.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium py-6 text-center">
                    No imports uploaded yet. Get started in the Import Center.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-slate-700">
                      <thead>
                        <tr className="border-b text-slate-400 uppercase text-[9px] font-bold tracking-wider">
                          <th className="pb-2">Filename</th>
                          <th className="pb-2">As-of Date</th>
                          <th className="pb-2">Status</th>
                          <th className="pb-2 text-right">Unmapped Rows</th>
                          <th className="pb-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batches.data.slice(0, 5).map((b) => (
                          <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="py-2.5 font-medium text-slate-900 truncate max-w-[200px]" title={b.filename}>{b.filename}</td>
                            <td className="py-2.5 text-slate-450">{b.as_of_date}</td>
                            <td className="py-2.5">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide",
                                b.status === 'posted' ? "bg-emerald-100 text-emerald-800" :
                                b.status === 'ready_to_post' ? "bg-blue-100 text-blue-800" : "bg-yellow-100 text-yellow-800"
                              )}>
                                {b.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-2.5 text-right font-mono text-slate-705 font-semibold">{b.unmapped_row_count ?? 0}</td>
                            <td className="py-2.5 text-right">
                              <Link to="/import" className="text-amber-500 hover:text-amber-600 font-semibold hover:underline">
                                Manage
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Right Column: Validation Alerts & Reports shortcuts */}
          <div className="lg:col-span-1 space-y-6">
            {/* Open Tasks */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-bold text-slate-855 uppercase tracking-wider mb-4">
                Open Tasks
              </h2>
              {tasks.isLoading && <LoadingState message="Loading tasks…" />}
              {tasks.isError && <ErrorState message="Could not load tasks." />}
              {tasks.data && (
                tasks.data.length === 0 ? (
                  <p className="text-xs text-slate-450 font-medium py-6 text-center">
                    No open tasks.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {tasks.data.slice(0, 5).map((t) => (
                      <li key={t.id} className="flex gap-2.5 items-start text-xs border-b border-slate-50 pb-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 truncate" title={t.title}>{t.title}</p>
                          <p className="text-[10px] text-slate-450 mt-0.5 leading-relaxed">{t.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>

            {/* Alerts */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-bold text-slate-855 uppercase tracking-wider mb-3">
                Validation & Control Alerts
              </h2>
              {issues.isLoading && <LoadingState message="Loading alerts…" />}
              {issues.isError && <ErrorState message="Could not load alerts." />}
              {issues.data && (
                issues.data.length === 0 ? (
                  <p className="text-xs text-emerald-600 font-semibold py-4 flex items-center gap-1.5">
                    ✓ All ledger controls operating normally.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {issues.data.slice(0, 5).map((i) => (
                      <li key={i.id} className="flex gap-2.5 items-start text-xs border-b border-slate-50 pb-2.5">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-slate-800 truncate" title={i.title}>{i.title}</p>
                          <p className="text-[10px] text-slate-450 mt-0.5 leading-relaxed">{i.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>

            {/* Reports shortcuts */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-bold text-slate-855 uppercase tracking-wider mb-4">
                Financial Reports
              </h2>
              <div className="space-y-2">
                <Link to="/financial-statements" className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-amber-200 hover:bg-amber-50/5 transition-all text-xs font-semibold text-slate-750">
                  <span>Balance Sheet</span>
                  <span className="text-amber-500 font-bold">→</span>
                </Link>
                <Link to="/financial-statements" className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-amber-200 hover:bg-amber-50/5 transition-all text-xs font-semibold text-slate-750">
                  <span>Income Statement</span>
                  <span className="text-amber-500 font-bold">→</span>
                </Link>
                <Link to="/financial-statements" className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-amber-200 hover:bg-amber-50/5 transition-all text-xs font-semibold text-slate-750">
                  <span>Statement of Cash Flows</span>
                  <span className="text-amber-500 font-bold">→</span>
                </Link>
                <Link to="/draft-preview" className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-amber-200 hover:bg-amber-50/5 transition-all text-xs font-semibold text-slate-750">
                  <span>Adjustment Bridge</span>
                  <span className="text-amber-500 font-bold">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Onboarding quick links (moved lower and made secondary) */}
        <div className="mt-6">
          <QuickLinks />
        </div>

        {/* Developer Tools Panel */}
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
            <ChevronDown className={cn("w-4 h-4 text-violet-400 transition-transform", showDevTools && "rotate-180")} />
          </button>

          {showDevTools && (
            <div className="border-t border-violet-100 px-4 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

              {/* 1 — Seed demo data */}
              <div className="rounded-lg border border-violet-200 bg-white p-3 flex flex-col gap-2">
                <div>
                  <p className="text-xs font-bold text-gray-800">Seed Demo Data</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Creates "Demo Corp" entity with 12 monthly periods and 21-account chart of accounts — ready to import into immediately.</p>
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

              {/* 2 — Sample TB CSV */}
              <div className="rounded-lg border border-violet-200 bg-white p-3 flex flex-col gap-2">
                <div>
                  <p className="text-xs font-bold text-gray-800">Download Sample Trial Balance</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">21-account Format A CSV with balanced debits and credits (∑Dr = ∑Cr = $887,500). Import directly into the Trial Balance importer.</p>
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

              {/* 3 — Export snapshot */}
              <div className="rounded-lg border border-violet-200 bg-white p-3 flex flex-col gap-2">
                <div>
                  <p className="text-xs font-bold text-gray-800">Export Data Snapshot</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Downloads a JSON snapshot of all entities, accounts, periods, import batches and journal entries for this org. Use as a backup before testing destructive operations.</p>
                </div>
                <button
                  type="button"
                  onClick={downloadSnapshot}
                  className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
                >
                  <Database className="w-3.5 h-3.5" />
                  Export JSON
                </button>
              </div>

              {/* 4 — Quick-post all ready */}
              <div className="rounded-lg border border-violet-200 bg-white p-3 flex flex-col gap-2">
                <div>
                  <p className="text-xs font-bold text-gray-800">Post All Ready Imports</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Posts every <code className="bg-gray-100 px-0.5 rounded text-[10px]">ready_to_post</code> trial balance batch for the entity selected in the context bar. Skips batches with errors.</p>
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

              {/* 5 — Reset all data */}
              <div className="rounded-lg border border-red-200 bg-white p-3 flex flex-col gap-2">
                <div>
                  <p className="text-xs font-bold text-red-700">Reset All Data</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Wipes all entities, accounts, periods, import batches (TB/PDF/COA) and journal entries for this org. <strong>Cannot be undone</strong> — export a snapshot first.</p>
                </div>
                <button
                  type="button"
                  disabled={resetMutation.isPending || !orgId}
                  onClick={() => {
                    if (window.confirm('DELETE ALL data for this org? This cannot be undone. Export a snapshot first if needed.')) {
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
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">What's New</h2>
          <div className="space-y-3">
            {[
              {
                version: 'v8 · Phase 8',
                date: '2026-06-14',
                items: [
                  'Removed duplicate entity/period selectors from top nav — use the context bar below it exclusively',
                  'Import center now syncs entity filter automatically from the context bar (no separate entity picker)',
                  'PDF import "View" now navigates directly to the specific batch, not the upload screen',
                  'Import cards redesigned — compact single-line layout, 7-column grid, no text wrapping',
                  'Downloadable CSV templates added for Format A, B, C, D in the format help section',
                ],
              },
              {
                version: 'v7 · Phase 7',
                date: '2026-06-13',
                items: [
                  'Delete button on all import types (TB, PDF, COA) — not just trial balance',
                  'Duplicate file detection: re-uploading the same file shows a banner with "Import anyway" option',
                  'Staging entity type added; entity quick-create link in context bar dropdown',
                  'TypeScript build errors resolved — clean npm run build across all 38 files',
                ],
              },
              {
                version: 'v6 · QuickBooks',
                date: '2026-06-12',
                items: [
                  'QuickBooks Online OAuth connect & token management',
                  'Pull Chart of Accounts, Trial Balance, P&L, Balance Sheet per month-end',
                  'QuickBooks Desktop IIF/Excel file upload',
                  'Auto-taxonomy mapping from QB AccountType → fs_statement / fs_section',
                ],
              },
            ].map(({ version, date, items }) => (
              <div key={version} className="flex gap-3">
                <div className="shrink-0 text-right w-28">
                  <span className="text-[10px] font-bold text-slate-700">{version}</span>
                  <p className="text-[9px] text-slate-400 mt-0.5">{date}</p>
                </div>
                <div className="border-l border-slate-200 pl-3 flex-1">
                  <ul className="space-y-0.5">
                    {items.map((item, i) => (
                      <li key={i} className="text-[11px] text-slate-600 flex gap-1.5 items-baseline">
                        <span className="text-slate-300 shrink-0">·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Version Indicator */}
        <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 font-medium">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-1">
            <div>
              <span className="font-bold text-slate-500">v8</span> · {import.meta.env.VITE_APP_GIT_TAG ? `${import.meta.env.VITE_APP_GIT_TAG} (${import.meta.env.VITE_APP_GIT_HASH})` : import.meta.env.VITE_APP_GIT_HASH || 'unknown'}
            </div>
            <div className="flex gap-4">
              <div>Built: {import.meta.env.VITE_APP_BUILD_TIME || 'unknown'}</div>
              <div>Env: local</div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
