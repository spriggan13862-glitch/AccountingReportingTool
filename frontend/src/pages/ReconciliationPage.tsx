import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { reconciliationApi } from '@/api/reconciliation'
import { PageLayout } from '@/components/ui/PageLayout'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { ReconciliationTable } from '@/components/reconciliation/ReconciliationTable'
import { useOrg } from '@/providers/OrgProvider'
import type { ReconciliationCreate } from '@/types'

export function ReconciliationPage() {
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [apiError, setApiError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Form state
  const [entityId, setEntityId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [reconType, setReconType] = useState('manual')

  const { data: reconciliations, isLoading } = useQuery({
    queryKey: ['reconciliations', orgId],
    queryFn: () => reconciliationApi.list({ organization_id: orgId }),
    enabled: !!orgId,
  })

  const createMutation = useMutation({
    mutationFn: (body: ReconciliationCreate) => reconciliationApi.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliations', orgId] })
      setShowCreateForm(false)
      setEntityId('')
      setAccountId('')
      setApiError(null)
    },
    onError: (err: Error) => setApiError(err.message),
  })

  function handleCreate() {
    if (!entityId || !accountId) return
    createMutation.mutate({
      organization_id: orgId,
      entity_id: Number(entityId),
      account_id: Number(accountId),
      reconciliation_type: reconType,
    })
  }

  return (
    <PageLayout
      title="Reconciliations"
      subtitle="Account reconciliation dashboard — track variance, tie-out status, and rollforward"
      actions={
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          data-testid="create-recon-btn"
        >
          <Plus className="h-3.5 w-3.5" />
          New Reconciliation
        </button>
      }
    >
      <div className="space-y-4 max-w-6xl">
        {apiError && <ErrorBanner message={apiError} />}

        {showCreateForm && (
          <div
            className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3"
            data-testid="create-recon-form"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              New Reconciliation
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Entity ID</label>
                <input
                  type="number"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="1"
                  data-testid="entity-id-input"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Account ID</label>
                <input
                  type="number"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="1"
                  data-testid="account-id-input"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Type</label>
                <select
                  value={reconType}
                  onChange={(e) => setReconType(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  data-testid="recon-type-select"
                >
                  <option value="manual">Manual</option>
                  <option value="bank">Bank</option>
                  <option value="intercompany">Intercompany</option>
                  <option value="subledger">Subledger</option>
                  <option value="gl_to_sub">GL to Sub</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!entityId || !accountId || createMutation.isPending}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                data-testid="submit-create-recon"
              >
                {createMutation.isPending ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 py-12 text-center">
            <p className="text-sm text-gray-500">Loading reconciliations…</p>
          </div>
        ) : (
          <ReconciliationTable
            reconciliations={reconciliations ?? []}
            onSelect={(r) => navigate(`/reconciliations/${r.id}`)}
          />
        )}
      </div>
    </PageLayout>
  )
}
