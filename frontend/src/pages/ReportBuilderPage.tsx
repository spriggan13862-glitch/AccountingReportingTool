import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { financialStatementsApi } from '@/api/financialStatements'
import type { ReportDefinitionCreate } from '@/types'

export function ReportBuilderPage() {
  const qc = useQueryClient()
  const [orgId] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ReportDefinitionCreate>({
    name: '',
    report_type: 'BS',
    description: '',
    is_template: false,
  })

  const { data: definitions } = useQuery({
    queryKey: ['report-definitions', orgId],
    queryFn: () => financialStatementsApi.getDefinitions(orgId).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: ReportDefinitionCreate) =>
      financialStatementsApi.createDefinition({ ...data, organization_id: orgId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-definitions', orgId] })
      setShowForm(false)
      setForm({ name: '', report_type: 'BS', description: '', is_template: false })
    },
  })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Report Builder</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          New Report Definition
        </button>
      </div>

      {showForm && (
        <div className="bg-white border rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-3">New Report Definition</h2>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Report name"
              className="w-full border rounded px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={form.report_type}
              onChange={(e) => setForm({ ...form, report_type: e.target.value })}
            >
              <option value="BS">Balance Sheet</option>
              <option value="IS">Income Statement</option>
              <option value="CF">Cash Flow</option>
              <option value="EQ">Equity Statement</option>
              <option value="TB">Trial Balance</option>
              <option value="CUSTOM">Custom</option>
            </select>
            <input
              type="text"
              placeholder="Description (optional)"
              className="w-full border rounded px-3 py-2 text-sm"
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_template ?? false}
                onChange={(e) => setForm({ ...form, is_template: e.target.checked })}
              />
              Is template
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.name || createMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {definitions?.map((def) => (
          <div key={def.id} className="bg-white border rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <span className="font-medium text-sm">{def.name}</span>
              <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{def.report_type}</span>
              {def.is_template && <span className="ml-1 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Template</span>}
            </div>
            {def.description && <p className="text-xs text-gray-500">{def.description}</p>}
          </div>
        ))}
        {!definitions?.length && (
          <p className="text-center py-8 text-gray-400 text-sm">No report definitions yet</p>
        )}
      </div>
    </div>
  )
}
