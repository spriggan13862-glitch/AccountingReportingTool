import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Link2,
  Unlink,
  RefreshCw,
  Upload,
  ChevronDown,
} from 'lucide-react'
import { quickbooksApi, type QBConnection } from '@/api/quickbooks'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { useOrg } from '@/providers/OrgProvider'
import { useToast } from '@/providers/ToastProvider'
import { PageLayout } from '@/components/ui/PageLayout'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const PULL_TYPES = [
  { id: 'coa', label: 'Chart of Accounts' },
  { id: 'trial_balance', label: 'Trial Balance' },
  { id: 'pl', label: 'Profit & Loss' },
  { id: 'bs', label: 'Balance Sheet' },
] as const

type PullTypeId = (typeof PULL_TYPES)[number]['id']

function statusBadge(status: string) {
  if (status === 'active') return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5"><CheckCircle className="h-3 w-3" />Connected</span>
  if (status === 'expired') return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><AlertTriangle className="h-3 w-3" />Token Expired</span>
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5"><XCircle className="h-3 w-3" />Disconnected</span>
}

function ConnectionCard({ conn, onDisconnect }: { conn: QBConnection; onDisconnect: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const { org } = useOrg()
  const toast = useToast()
  const qc = useQueryClient()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedPulls, setSelectedPulls] = useState<Set<PullTypeId>>(new Set(['coa', 'trial_balance']))

  const pullMutation = useMutation({
    mutationFn: async () => {
      const types = Array.from(selectedPulls) as PullTypeId[]
      if (types.length === 4) {
        return quickbooksApi.pull(conn.id, { pull_type: 'all', year, month })
      }
      const results = []
      for (const t of types) {
        results.push(await quickbooksApi.pull(conn.id, { pull_type: t, year, month }))
      }
      return results
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qb-connections'] })
      qc.invalidateQueries({ queryKey: ['import-batches'] })
      toast(`QuickBooks data pulled for ${MONTHS[month - 1]} ${year}`, 'success')
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const togglePull = (id: PullTypeId) => {
    setSelectedPulls((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {conn.company_name ?? `QuickBooks (realm ${conn.realm_id ?? conn.id})`}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {conn.connection_type === 'online' ? 'QuickBooks Online' : 'QuickBooks Desktop'}
            {conn.last_sync_at && ` · Last sync ${new Date(conn.last_sync_at).toLocaleDateString()}`}
          </p>
        </div>
        {statusBadge(conn.status)}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1 rounded hover:bg-gray-100 text-gray-400"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={onDisconnect}
          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
          title="Disconnect"
        >
          <Unlink className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Select period</p>
            <div className="flex gap-2">
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
              >
                {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">What to pull</p>
            <div className="flex flex-wrap gap-2">
              {PULL_TYPES.map(({ id, label }) => (
                <label key={id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPulls.has(id)}
                    onChange={() => togglePull(id)}
                    className="rounded"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={() => pullMutation.mutate()}
            disabled={pullMutation.isPending || selectedPulls.size === 0 || conn.status !== 'active'}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pullMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Pull Data
          </button>

          {pullMutation.isSuccess && (
            <p className="text-xs text-green-700">
              Pull complete — check Import for the new batch.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function DesktopUploadCard({ entityId, orgId }: { entityId: number; orgId: number }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const qc = useQueryClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Select a file first')
      return quickbooksApi.desktopUpload(file, { entity_id: entityId, organization_id: orgId, year, month })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['import-batches'] })
      toast('QuickBooks Desktop file imported — go to Import to review and post', 'success')
      setFile(null)
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-gray-400 shrink-0" />
        <p className="text-sm font-semibold text-gray-700">QuickBooks Desktop Upload</p>
      </div>
      <p className="text-xs text-gray-500">Upload a QBD IIF file or Excel export (.iif / .xlsx)</p>

      <div className="flex gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
        >
          {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          drag ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
      >
        <input ref={fileRef} type="file" accept=".iif,.xlsx,.xls" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? (
          <p className="text-xs text-blue-700 font-medium">{file.name}</p>
        ) : (
          <p className="text-xs text-gray-400">Drop .iif or .xlsx here, or click to select</p>
        )}
      </div>

      <button
        onClick={() => uploadMutation.mutate()}
        disabled={!file || uploadMutation.isPending}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Import File
      </button>
    </div>
  )
}

export function QuickBooksConnectPage() {
  const { activeEntity } = useWorkspace()
  const { org } = useOrg()
  const toast = useToast()
  const qc = useQueryClient()

  const entityId = activeEntity?.id
  const orgId = org?.id ?? 0

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['qb-connections', entityId],
    queryFn: () => quickbooksApi.listConnections(entityId),
    enabled: !!entityId,
  })

  const connectMutation = useMutation({
    mutationFn: () => {
      if (!entityId) throw new Error('Select an entity first')
      return quickbooksApi.getConnectUrl(entityId, orgId)
    },
    onSuccess: ({ oauth_url }) => {
      window.location.href = oauth_url
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const disconnectMutation = useMutation({
    mutationFn: (id: number) => quickbooksApi.disconnect(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qb-connections'] })
      toast('Disconnected', 'success')
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  return (
    <PageLayout title="QuickBooks" description="Connect to QuickBooks Online or import a Desktop export">
      <div className="max-w-2xl space-y-6">

        {!entityId && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">Select an entity in the context bar to connect QuickBooks.</p>
          </div>
        )}

        {/* Existing connections */}
        {entityId && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">QuickBooks Online</h2>
            {isLoading && <p className="text-xs text-gray-400">Loading…</p>}
            {!isLoading && connections.filter(c => c.connection_type === 'online').length === 0 && (
              <p className="text-xs text-gray-400 italic mb-3">No QuickBooks Online connection yet.</p>
            )}
            <div className="space-y-2">
              {connections
                .filter(c => c.connection_type === 'online')
                .map(conn => (
                  <ConnectionCard
                    key={conn.id}
                    conn={conn}
                    onDisconnect={() => disconnectMutation.mutate(conn.id)}
                  />
                ))}
            </div>
            <button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending || !entityId}
              className="mt-3 flex items-center gap-2 px-4 py-2 bg-[#2CA01C] text-white text-sm font-medium rounded hover:bg-[#238a17] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Connect QuickBooks Online
            </button>
          </div>
        )}

        {/* Desktop upload */}
        {entityId && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">QuickBooks Desktop</h2>
            <DesktopUploadCard entityId={entityId} orgId={orgId} />
          </div>
        )}
      </div>
    </PageLayout>
  )
}
