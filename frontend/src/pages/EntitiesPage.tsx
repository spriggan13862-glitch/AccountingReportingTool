import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Building2, Pencil, Check } from 'lucide-react'
import { entitiesApi } from '@/api/entities'
import { PageLayout } from '@/components/ui/PageLayout'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Badge } from '@/components/ui/Badge'
import { ErrorBanner } from '@/components/ui/ValidationAlert'
import { useToast } from '@/providers/ToastProvider'
import type { Entity } from '@/types'

const ENTITY_TYPES = ['operating', 'consolidation', 'elimination', 'carveout']

const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'HKD', 'SGD',
  'SEK', 'NOK', 'DKK', 'NZD', 'MXN', 'BRL', 'INR', 'KRW', 'ZAR', 'RUB',
  'TRY', 'AED', 'SAR', 'PLN', 'THB', 'IDR', 'MYR', 'PHP', 'CZK', 'HUF',
]

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
]

const FY_CONVENTIONS = [
  { value: 'calendar', label: 'Calendar year (Jan–Dec)' },
  { value: '52-53-week', label: '52/53-week fiscal year' },
  { value: 'retail-454', label: 'Retail 4-5-4 calendar' },
]

interface EntityFormState {
  code: string
  name: string
  entity_type: string
  currency: string
  parent_id: string
  fiscal_year_end_month: string
  fiscal_year_convention: string
}

const emptyForm = (): EntityFormState => ({
  code: '', name: '', entity_type: 'operating', currency: 'USD', parent_id: '',
  fiscal_year_end_month: '', fiscal_year_convention: '',
})

export function EntitiesPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [apiError, setApiError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<EntityFormState>(emptyForm())

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['entities'],
    queryFn: () => entitiesApi.list(),
  })

  const entities: Entity[] = Array.isArray(data) ? data : (data as any)?.items ?? []

  const createMutation = useMutation({
    mutationFn: () => entitiesApi.create({
      code: form.code,
      name: form.name,
      entity_type: form.entity_type,
      currency: form.currency,
      parent_id: form.parent_id ? Number(form.parent_id) : null,
      fiscal_year_end_month: form.fiscal_year_end_month ? Number(form.fiscal_year_end_month) : null,
      fiscal_year_convention: form.fiscal_year_convention || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] })
      setShowCreate(false)
      setForm(emptyForm())
      setApiError(null)
      toast('Entity created successfully', 'success')
    },
    onError: (err: Error) => { setApiError(err.message); toast(err.message, 'error') },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<EntityFormState> }) =>
      entitiesApi.update(id, {
        name: body.name,
        entity_type: body.entity_type,
        currency: body.currency,
        active: true,
        fiscal_year_end_month: body.fiscal_year_end_month ? Number(body.fiscal_year_end_month) : null,
        fiscal_year_convention: body.fiscal_year_convention || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] })
      setEditingId(null)
      setApiError(null)
      toast('Entity updated', 'success')
    },
    onError: (err: Error) => { setApiError(err.message); toast(err.message, 'error') },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => entitiesApi.update(id, { active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] })
      toast('Entity deactivated', 'info')
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  function startEdit(entity: Entity) {
    setEditingId(entity.id)
    setForm({
      code: entity.code,
      name: entity.name,
      entity_type: entity.entity_type,
      currency: entity.currency,
      parent_id: entity.parent_id ? String(entity.parent_id) : '',
      fiscal_year_end_month: entity.fiscal_year_end_month ? String(entity.fiscal_year_end_month) : '',
      fiscal_year_convention: entity.fiscal_year_convention ?? '',
    })
  }

  return (
    <PageLayout
      title="Entities"
      subtitle="Manage reporting entities in this organization"
      actions={
        <button
          type="button"
          onClick={() => { setShowCreate((v) => !v); setForm(emptyForm()); setApiError(null) }}
          className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> New Entity
        </button>
      }
    >
      {apiError && <ErrorBanner message={apiError} />}

      {/* Create form */}
      {showCreate && (
        <div className="bg-white border border-indigo-200 rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Create Entity</h2>
          <EntityForm
            form={form}
            onChange={(f) => setForm(f)}
            onSubmit={() => createMutation.mutate()}
            onCancel={() => { setShowCreate(false); setApiError(null) }}
            isPending={createMutation.isPending}
            submitLabel="Create Entity"
          />
        </div>
      )}

      {isLoading && <LoadingState />}
      {isError && <ErrorState message={(error as Error).message} />}

      {!isLoading && !isError && entities.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-12 text-center">
          <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-gray-700 mb-1">No entities yet</h3>
          <p className="text-sm text-gray-400 mb-4">Create your first entity to begin posting journal entries and running close workflows.</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
          >
            Create First Entity
          </button>
        </div>
      )}

      {entities.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Code</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Currency</th>
                <th className="px-4 py-2 text-left">Fiscal Year End</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entities.map((entity) => (
                editingId === entity.id ? (
                  <tr key={entity.id} className="bg-indigo-50">
                    <td colSpan={6} className="px-4 py-3">
                      <EntityForm
                        form={form}
                        onChange={(f) => setForm(f)}
                        onSubmit={() => updateMutation.mutate({ id: entity.id, body: form })}
                        onCancel={() => setEditingId(null)}
                        isPending={updateMutation.isPending}
                        submitLabel="Save"
                        compact
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={entity.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-600">{entity.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{entity.name}</td>
                    <td className="px-4 py-3"><Badge>{entity.entity_type}</Badge></td>
                    <td className="px-4 py-3 text-gray-500">{entity.currency}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {entity.fiscal_year_end_month
                        ? MONTHS.find((m) => m.value === entity.fiscal_year_end_month)?.label ?? '—'
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={entity.active ? 'success' : 'default'}>
                        {entity.active ? 'active' : 'inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(entity)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 rounded"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {entity.active && (
                          <button
                            type="button"
                            onClick={() => deactivateMutation.mutate(entity.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded text-xs"
                            title="Deactivate"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageLayout>
  )
}

// ---------------------------------------------------------------------------

interface EntityFormProps {
  form: EntityFormState
  onChange: (f: EntityFormState) => void
  onSubmit: () => void
  onCancel: () => void
  isPending: boolean
  submitLabel: string
  compact?: boolean
}

function EntityForm({ form, onChange, onSubmit, onCancel, isPending, submitLabel, compact }: EntityFormProps) {
  const set = (k: keyof EntityFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...form, [k]: e.target.value })

  return (
    <div>
      <div className={`grid gap-3 mb-3 ${compact ? 'grid-cols-4' : 'grid-cols-2'}`}>
        <input
          type="text"
          value={form.code}
          onChange={set('code')}
          className="border border-gray-300 rounded px-3 py-2 text-sm"
          placeholder="Code (e.g. ACME-US) *"
          disabled={compact} // code not editable after creation
        />
        <input
          type="text"
          value={form.name}
          onChange={set('name')}
          className="border border-gray-300 rounded px-3 py-2 text-sm"
          placeholder="Legal name *"
        />
        <select value={form.entity_type} onChange={set('entity_type')}
          className="border border-gray-300 rounded px-3 py-2 text-sm">
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={form.currency} onChange={set('currency')}
          className="border border-gray-300 rounded px-3 py-2 text-sm">
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={form.fiscal_year_end_month} onChange={set('fiscal_year_end_month')}
          className="border border-gray-300 rounded px-3 py-2 text-sm">
          <option value="">Fiscal year-end month (optional)</option>
          {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select value={form.fiscal_year_convention} onChange={set('fiscal_year_convention')}
          className="border border-gray-300 rounded px-3 py-2 text-sm">
          <option value="">FY convention (optional)</option>
          {FY_CONVENTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!form.code || !form.name || isPending}
          onClick={onSubmit}
          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : <><Check className="w-3.5 h-3.5" /> {submitLabel}</>}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  )
}
