import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { workflowApi } from '@/api/workflow'
import { reportsApi } from '@/api/reports'
import { journalEntriesApi } from '@/api/journalEntries'
import { tbImportApi } from '@/api/tbImport'
import { useOrg } from '@/providers/OrgProvider'
import { useAuth } from '@/providers/AuthProvider'
import { PageLayout } from '@/components/ui/PageLayout'
import { StatusBadge, SeverityBadge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { SetupWizardPage } from '@/pages/SetupWizardPage'
import { AlertCircle, Clock, CheckCircle } from 'lucide-react'

function DashboardCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  )
}

const QUICK_LINKS = [
  { label: 'Journal Entries', to: '/journal-entries', description: 'Create and manage accounting entries' },
  { label: 'Trial Balance', to: '/reports', description: 'View trial balance and run reports' },
  { label: 'Financial Statements', to: '/financial-statements', description: 'Balance Sheet and Income Statement' },
  { label: 'Periods', to: '/periods', description: 'Manage accounting periods' },
  { label: 'Workflow', to: '/workflow', description: 'Review and approve pending tasks' },
  { label: 'Reconciliation', to: '/reconciliation', description: 'Account reconciliation status' },
]

function QuickLinks() {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
      <h2 className="mb-3 text-sm font-semibold text-blue-800 uppercase tracking-wide">Quick Links</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="rounded-md border border-blue-200 bg-white px-3 py-2 hover:bg-blue-50 transition-colors"
          >
            <div className="text-sm font-medium text-blue-700">{link.label}</div>
            <div className="mt-0.5 text-xs text-gray-500">{link.description}</div>
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

  if (!batches?.length) return null

  const pending = batches.filter((b) => ['mapping_required', 'validation_failed'].includes(b.status))
  const readyToPost = batches.filter((b) => b.status === 'ready_to_post')
  const totalUnmapped = batches.reduce((acc, b) => acc + (b.unmapped_row_count ?? 0), 0)

  if (!pending.length && !readyToPost.length) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      {pending.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/import')}
          className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-left hover:bg-yellow-100 transition-colors"
        >
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-yellow-800">{pending.length} import{pending.length > 1 ? 's' : ''} need attention</p>
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
            <p className="text-sm font-semibold text-green-800">{readyToPost.length} import{readyToPost.length > 1 ? 's' : ''} ready to post</p>
            <p className="text-xs text-green-600">Validated and awaiting posting</p>
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

  const reports = useQuery({
    queryKey: ['reports', orgId],
    queryFn: () => reportsApi.list(orgId),
    enabled: orgId > 0,
  })

  const jes = useQuery({
    queryKey: ['journal-entries'],
    queryFn: () => journalEntriesApi.list(),
    enabled: orgId > 0,
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

  return (
    <PageLayout title="Dashboard" subtitle={`Overview for ${org.name}`}>
      <div className="space-y-4">
        {/* Guided onboarding wizard (dismissible) */}
        <SetupWizardPage />

        {/* Operational status alerts */}
        <OperationalStatusCards orgId={orgId} />

        {/* Onboarding quick links */}
        <QuickLinks />

        {/* Welcome message for the logged-in user */}
        {user && (
          <p className="text-sm text-gray-500">
            Logged in as <span className="font-medium text-gray-700">{user.full_name}</span> ({user.email})
          </p>
        )}

        {/* Activity cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* Open Tasks */}
          <DashboardCard title="Open Tasks">
            {tasks.isLoading && <LoadingState message="Loading tasks…" />}
            {tasks.isError && <ErrorState message="Could not load tasks." />}
            {tasks.data && (
              tasks.data.length === 0
                ? <p className="text-xs text-gray-400">No open tasks.</p>
                : <ul className="space-y-2">
                    {tasks.data.slice(0, 5).map((t) => (
                      <li key={t.id} className="flex items-center justify-between text-sm">
                        <span className="truncate text-gray-700">{t.title}</span>
                        <StatusBadge status={t.status} />
                      </li>
                    ))}
                    {tasks.data.length > 5 && (
                      <p className="text-xs text-gray-400">+{tasks.data.length - 5} more</p>
                    )}
                  </ul>
            )}
          </DashboardCard>

          {/* Unresolved Issues */}
          <DashboardCard title="Unresolved Issues">
            {issues.isLoading && <LoadingState message="Loading issues…" />}
            {issues.isError && <ErrorState message="Could not load issues." />}
            {issues.data && (
              issues.data.length === 0
                ? <p className="text-xs text-gray-400">No open issues.</p>
                : <ul className="space-y-2">
                    {issues.data.slice(0, 5).map((i) => (
                      <li key={i.id} className="flex items-center justify-between text-sm">
                        <span className="truncate text-gray-700">{i.title}</span>
                        <SeverityBadge severity={i.severity} />
                      </li>
                    ))}
                    {issues.data.length > 5 && (
                      <p className="text-xs text-gray-400">+{issues.data.length - 5} more</p>
                    )}
                  </ul>
            )}
          </DashboardCard>

          {/* Recent Reports */}
          <DashboardCard title="Recent Reports">
            {reports.isLoading && <LoadingState message="Loading reports…" />}
            {reports.isError && <ErrorState message="Could not load reports." />}
            {reports.data && (
              reports.data.length === 0
                ? <p className="text-xs text-gray-400">No report runs yet.</p>
                : <ul className="space-y-2">
                    {reports.data.slice(0, 5).map((r) => (
                      <li key={r.id} className="flex items-center justify-between text-sm">
                        <span className="truncate text-gray-700">
                          {r.report_type.replace(/_/g, ' ')}
                        </span>
                        <StatusBadge status={r.status} />
                      </li>
                    ))}
                  </ul>
            )}
          </DashboardCard>

          {/* Recent JEs */}
          <DashboardCard title="Recent Journal Entries">
            {jes.isLoading && <LoadingState message="Loading entries…" />}
            {jes.isError && <ErrorState message="Could not load journal entries." />}
            {jes.data && (
              jes.data.length === 0
                ? <p className="text-xs text-gray-400">No journal entries.</p>
                : <ul className="space-y-2">
                    {jes.data.slice(0, 5).map((je) => (
                      <li key={je.id} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-gray-700">{je.je_number}</span>
                        <StatusBadge status={je.status} />
                      </li>
                    ))}
                  </ul>
            )}
          </DashboardCard>
        </div>
      </div>
    </PageLayout>
  )
}
