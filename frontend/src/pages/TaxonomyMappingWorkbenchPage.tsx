import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Lock, Unlock, Save, Search, Tags } from 'lucide-react'
import { fsliMappingsApi } from '@/api/fsliMappings'
import { accountsApi } from '@/api/accounts'
import { reportingTaxonomyApi } from '@/api/reportingTaxonomy'
import { reportingViewsApi } from '@/api/reportingViews'
import { PageLayout } from '@/components/ui/PageLayout'
import { useToast } from '@/providers/ToastProvider'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { AccountingDataGrid } from '@/components/data-grid'
import type { GridColumn, BatchAction } from '@/components/data-grid/types'
import type { FsliEffectiveMapping, ReportingTaxonomyLine, Account } from '@/types'

// ---------------------------------------------------------------------------
// Row shape used in the grid (merged account + effective mapping)
// ---------------------------------------------------------------------------

interface MappingRow {
  account_id: number
  account_number: string
  account_name: string
  account_type: string
  parent_account_id: number | null
  parent_account_number: string | null
  parent_account_name: string | null
  taxonomy_line_id: number | null
  taxonomy_line_name: string | null
  mapping_source: string
  inherited_from_account_id: number | null
  inherited_from_account_number: string | null
  locked: boolean
  // suggested FSLI from the accounts list (legacy field)
  suggested_taxonomy_line_id: number | null
}

// ---------------------------------------------------------------------------
// Copy-from-view modal
// ---------------------------------------------------------------------------

interface CopyFromViewModalProps {
  views: Array<{ id: number; name: string }>
  currentViewId: number
  entityId: number
  onClose: () => void
  onCopied: (count: number) => void
}

function CopyFromViewModal({ views, currentViewId, entityId, onClose, onCopied }: CopyFromViewModalProps) {
  const [sourceViewId, setSourceViewId] = useState<number | ''>('')
  const toast = useToast()

  const otherViews = views.filter((v) => v.id !== currentViewId)

  async function handleCopy() {
    if (!sourceViewId) return
    try {
      const result = await fsliMappingsApi.copyFromView(entityId, currentViewId, Number(sourceViewId))
      onCopied(result.copied)
      toast(`Copied ${result.copied} mapping${result.copied !== 1 ? 's' : ''} from ${views.find((v) => v.id === sourceViewId)?.name}`, 'success')
      onClose()
    } catch (err: any) {
      toast(err?.message ?? 'Copy failed', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full space-y-4 shadow-xl">
        <h3 className="text-base font-semibold text-gray-800">Copy Mappings From View</h3>
        <p className="text-xs text-gray-500">
          Copies all FSLI mappings from the selected view into the current view.
          Accounts already mapped in the current view are skipped.
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Source View</label>
          <select
            value={sourceViewId}
            onChange={(e) => setSourceViewId(e.target.value ? Number(e.target.value) : '')}
            className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          >
            <option value="">— Select source view —</option>
            {otherViews.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!sourceViewId}
            onClick={handleCopy}
            className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function TaxonomyMappingWorkbenchPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { activeEntity } = useWorkspace()
  const entityId = activeEntity?.id ?? 0

  const [activeViewId, setActiveViewId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [bulkFsliId, setBulkFsliId] = useState<number | ''>('')
  const [showCopyModal, setShowCopyModal] = useState(false)

  const { data: reportingViews = [] } = useQuery({
    queryKey: ['reporting-views'],
    queryFn: () => reportingViewsApi.list(),
  })

  const defaultView = reportingViews.find((v) => v.is_default) ?? reportingViews[0] ?? null
  const resolvedViewId = activeViewId ?? defaultView?.id ?? null

  const { data: taxonomyLines = [] } = useQuery({
    queryKey: ['reporting-taxonomy'],
    queryFn: () => reportingTaxonomyApi.list(),
  })

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts-all', entityId],
    queryFn: () => accountsApi.list(entityId),
    enabled: !!entityId,
  })

  const { data: effectiveMappings = [], isLoading: loadingMappings } = useQuery({
    queryKey: ['fsli-with-inheritance', entityId, resolvedViewId],
    queryFn: () => fsliMappingsApi.listWithInheritance(entityId, resolvedViewId!),
    enabled: !!entityId && !!resolvedViewId,
  })

  const accountArr: Account[] = Array.isArray(accounts) ? accounts : (accounts as any)?.items ?? []

  const accountMap = useMemo(() => {
    const m: Record<number, Account> = {}
    accountArr.forEach((a) => { m[a.id] = a })
    return m
  }, [accountArr])

  const rows: MappingRow[] = useMemo(() => {
    const effectiveByAccountId: Record<number, FsliEffectiveMapping> = {}
    effectiveMappings.forEach((em) => { effectiveByAccountId[em.account_id] = em })

    return accountArr.map((acct) => {
      const em = effectiveByAccountId[acct.id]
      const parentAcct = acct.parent_account_id ? accountMap[acct.parent_account_id] : null
      return {
        account_id: acct.id,
        account_number: acct.account_number,
        account_name: acct.account_name,
        account_type: acct.account_type,
        parent_account_id: acct.parent_account_id ?? null,
        parent_account_number: parentAcct?.account_number ?? null,
        parent_account_name: parentAcct?.account_name ?? null,
        taxonomy_line_id: em?.taxonomy_line_id ?? null,
        taxonomy_line_name: em?.taxonomy_line_name ?? null,
        mapping_source: em?.mapping_source ?? 'none',
        inherited_from_account_id: em?.inherited_from_account_id ?? null,
        inherited_from_account_number: em?.inherited_from_account_number ?? null,
        locked: em?.locked ?? false,
        suggested_taxonomy_line_id: acct.reporting_taxonomy_line_id ?? null,
      }
    })
  }, [accountArr, effectiveMappings, accountMap])

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(
      (r) =>
        r.account_number.toLowerCase().includes(q) ||
        r.account_name.toLowerCase().includes(q),
    )
  }, [rows, search])

  const totalCount = rows.length
  const mappedCount = rows.filter((r) => r.taxonomy_line_id !== null).length
  const mappedPct = totalCount > 0 ? Math.round((mappedCount / totalCount) * 100) : 0

  const upsertMutation = useMutation({
    mutationFn: ({
      accountId,
      taxonomyLineId,
    }: {
      accountId: number
      taxonomyLineId: number | null
    }) => {
      if (!resolvedViewId) return Promise.reject(new Error('No view selected'))
      return fsliMappingsApi.upsert(entityId, resolvedViewId, accountId, taxonomyLineId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fsli-with-inheritance', entityId, resolvedViewId] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const lockMutation = useMutation({
    mutationFn: ({ accountId, locked }: { accountId: number; locked: boolean }) => {
      if (!resolvedViewId) return Promise.reject(new Error('No view selected'))
      return fsliMappingsApi.toggleLock(entityId, resolvedViewId, accountId, locked)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fsli-with-inheritance', entityId, resolvedViewId] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense']

  const gridColumns: GridColumn<MappingRow>[] = [
    {
      key: 'account_number',
      header: 'Account #',
      sortable: true,
      filterable: true,
      sortValue: (r) => r.account_number,
      filterValue: (r) => r.account_number,
      render: (r) => (
        <span className="font-mono text-xs font-semibold text-gray-700">{r.account_number}</span>
      ),
      width: '120px',
    },
    {
      key: 'account_name',
      header: 'Account Name',
      sortable: true,
      filterable: true,
      sortValue: (r) => r.account_name,
      filterValue: (r) => r.account_name,
      render: (r) => <span className="text-xs text-gray-800">{r.account_name}</span>,
    },
    {
      key: 'account_type',
      header: 'Account Type',
      sortable: true,
      filterable: true,
      sortValue: (r) => r.account_type,
      filterValue: (r) => r.account_type,
      render: (r) => (
        <span className="text-xs capitalize text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
          {r.account_type}
        </span>
      ),
      width: '110px',
    },
    {
      key: 'parent_account',
      header: 'Parent Account',
      sortable: true,
      filterable: true,
      sortValue: (r) => r.parent_account_number ?? '',
      filterValue: (r) =>
        r.parent_account_number
          ? `${r.parent_account_number} ${r.parent_account_name ?? ''}`
          : '',
      render: (r) =>
        r.parent_account_number ? (
          <span className="text-xs text-gray-500">
            <span className="font-mono">{r.parent_account_number}</span>
            {r.parent_account_name && <span className="ml-1">{r.parent_account_name}</span>}
          </span>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        ),
    },
    {
      key: 'mapping_status',
      header: 'Mapping Status',
      sortable: true,
      filterable: true,
      sortValue: (r) => r.mapping_source,
      filterValue: (r) => {
        if (r.mapping_source === 'explicit') return 'Explicit'
        if (r.mapping_source === 'none') return 'Unmapped'
        return 'Inherited'
      },
      render: (r) => {
        if (r.mapping_source === 'explicit') {
          return (
            <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
              Explicit
            </span>
          )
        }
        if (r.mapping_source === 'none') {
          return (
            <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
              Unmapped
            </span>
          )
        }
        return (
          <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
            Inherited
          </span>
        )
      },
      width: '120px',
    },
    {
      key: 'current_fsli',
      header: 'Current FSLI',
      sortable: true,
      filterable: true,
      sortValue: (r) => r.taxonomy_line_name ?? '',
      filterValue: (r) => r.taxonomy_line_name ?? '',
      render: (r) => (
        <select
          value={r.taxonomy_line_id ?? ''}
          onChange={(e) => {
            const val = e.target.value ? Number(e.target.value) : null
            upsertMutation.mutate({ accountId: r.account_id, taxonomyLineId: val })
          }}
          className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-indigo-700 bg-indigo-50 focus:outline-none focus:ring-1 focus:ring-indigo-300 min-w-[140px] max-w-[200px]"
          onClick={(e) => e.stopPropagation()}
        >
          <option value="">— Select FSLI —</option>
          {(taxonomyLines as ReportingTaxonomyLine[]).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      ),
    },
    {
      key: 'suggested_fsli',
      header: 'Suggested FSLI',
      sortable: true,
      filterable: true,
      sortValue: (r) => {
        const line = (taxonomyLines as ReportingTaxonomyLine[]).find((t) => t.id === r.suggested_taxonomy_line_id)
        return line?.name ?? ''
      },
      filterValue: (r) => {
        const line = (taxonomyLines as ReportingTaxonomyLine[]).find((t) => t.id === r.suggested_taxonomy_line_id)
        return line?.name ?? ''
      },
      render: (r) => {
        const line = (taxonomyLines as ReportingTaxonomyLine[]).find((t) => t.id === r.suggested_taxonomy_line_id)
        if (!line) return <span className="text-gray-300 text-xs">—</span>
        return <span className="text-xs text-amber-700">{line.name}</span>
      },
    },
    {
      key: 'inherited_from',
      header: 'Inherited From',
      sortable: true,
      filterable: true,
      sortValue: (r) => r.inherited_from_account_number ?? '',
      filterValue: (r) => r.inherited_from_account_number ?? '',
      render: (r) =>
        r.inherited_from_account_number ? (
          <span className="font-mono text-xs text-blue-600">{r.inherited_from_account_number}</span>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        ),
      width: '130px',
    },
    {
      key: 'locked',
      header: 'Locked',
      sortable: true,
      filterable: true,
      sortValue: (r) => (r.locked ? 1 : 0),
      filterValue: (r) => (r.locked ? 'locked' : 'unlocked'),
      render: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            lockMutation.mutate({ accountId: r.account_id, locked: !r.locked })
          }}
          className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors ${
            r.locked
              ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
              : 'border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100'
          }`}
          title={r.locked ? 'Click to unlock' : 'Click to lock'}
        >
          {r.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>
      ),
      width: '70px',
    },
  ]

  const batchActions: BatchAction<MappingRow>[] = [
    {
      key: 'bulk_assign',
      label: 'Assign FSLI',
      icon: Tags,
      disabled: (rows) => rows.length === 0 || !bulkFsliId,
      onClick: async (selectedRows) => {
        if (!resolvedViewId || !bulkFsliId) return
        const accountIds = selectedRows.map((r) => r.account_id)
        try {
          const result = await fsliMappingsApi.bulkAssign(entityId, resolvedViewId, accountIds, Number(bulkFsliId))
          queryClient.invalidateQueries({ queryKey: ['fsli-with-inheritance', entityId, resolvedViewId] })
          toast(`Updated ${result.updated} account${result.updated !== 1 ? 's' : ''}`, 'success')
        } catch (err: any) {
          toast(err?.message ?? 'Bulk assign failed', 'error')
        }
      },
    },
  ]

  const isLoading = loadingAccounts || loadingMappings

  return (
    <PageLayout
      title="Advanced Taxonomy Override"
      subtitle="Power-user editor for per-view taxonomy overrides. Most users do mapping in Mapping Center."
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCopyModal(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 font-medium"
            data-testid="tmw-copy-from-view"
          >
            <Copy className="w-3.5 h-3.5" /> Copy from View
          </button>
          <button
            type="button"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['fsli-with-inheritance', entityId, resolvedViewId] })
              toast('Mappings refreshed', 'info')
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
            data-testid="tmw-save-btn"
          >
            <Save className="w-3.5 h-3.5" /> Save Mappings
          </button>
        </div>
      }
    >
      <div className="space-y-3" data-testid="taxonomy-mapping-workbench">
        <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-[11px] text-amber-900 flex items-start gap-2" data-testid="advanced-override-banner">
          <span className="font-semibold">Advanced editor.</span>
          <span>
            You're in the per-view taxonomy override editor. For normal account-to-FSLI mapping, use{' '}
            <a href="/mapping" className="underline font-semibold">Mapping Center</a>.
          </span>
        </div>
        {/* View selector + search + stats bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Reporting View:</label>
            <select
              value={resolvedViewId ?? ''}
              onChange={(e) => setActiveViewId(e.target.value ? Number(e.target.value) : null)}
              className="text-xs border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              data-testid="tmw-view-selector"
            >
              {reportingViews.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search account # or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-300 w-56"
              data-testid="tmw-search"
            />
          </div>

          <span
            className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full"
            data-testid="tmw-account-count"
          >
            {totalCount} accounts · {mappedCount} mapped ({mappedPct}%)
          </span>
        </div>

        {/* Bulk assign bar */}
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200">
          <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Bulk Assign FSLI:</span>
          <select
            value={bulkFsliId}
            onChange={(e) => setBulkFsliId(e.target.value ? Number(e.target.value) : '')}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 min-w-[180px]"
            data-testid="tmw-bulk-assign"
          >
            <option value="">— Select FSLI to assign —</option>
            {(taxonomyLines as ReportingTaxonomyLine[]).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">Select rows below, then use "Assign FSLI" batch action</span>
        </div>

        <AccountingDataGrid
          columns={gridColumns}
          data={filteredRows}
          rowKey={(r) => r.account_id}
          batchActions={batchActions}
          selectionEnabled={true}
          loading={isLoading}
          emptyMessage="No accounts found. Add accounts to this entity first."
          searchPlaceholder="Search account # or name…"
          exportFilename="taxonomy_mapping_workbench"
          pageSize={50}
          data-testid="tmw-grid"
        />
      </div>

      {showCopyModal && resolvedViewId && (
        <CopyFromViewModal
          views={reportingViews}
          currentViewId={resolvedViewId}
          entityId={entityId}
          onClose={() => setShowCopyModal(false)}
          onCopied={(count) => {
            queryClient.invalidateQueries({ queryKey: ['fsli-with-inheritance', entityId, resolvedViewId] })
          }}
        />
      )}
    </PageLayout>
  )
}
