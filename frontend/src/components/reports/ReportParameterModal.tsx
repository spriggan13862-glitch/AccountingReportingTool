import { useState } from 'react'

interface Params {
  entityId: string
  asOfDate: string
  periodStart: string
  scenarioIds: string
  statement: string
}

interface Props {
  onSubmit: (params: Params) => void
  onClose: () => void
}

export function ReportParameterModal({ onSubmit, onClose }: Props) {
  const [params, setParams] = useState<Params>({
    entityId: '',
    asOfDate: new Date().toISOString().split('T')[0],
    periodStart: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    scenarioIds: '',
    statement: 'BS',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(params)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Report Parameters</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="rp-entity-id" className="block text-sm font-medium text-gray-700 mb-1">Entity ID</label>
            <input
              id="rp-entity-id"
              type="number"
              required
              className="w-full border rounded px-3 py-2 text-sm"
              value={params.entityId}
              onChange={(e) => setParams({ ...params, entityId: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="rp-as-of-date" className="block text-sm font-medium text-gray-700 mb-1">As of Date</label>
            <input
              id="rp-as-of-date"
              type="date"
              required
              className="w-full border rounded px-3 py-2 text-sm"
              value={params.asOfDate}
              onChange={(e) => setParams({ ...params, asOfDate: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="rp-period-start" className="block text-sm font-medium text-gray-700 mb-1">Period Start</label>
            <input
              id="rp-period-start"
              type="date"
              required
              className="w-full border rounded px-3 py-2 text-sm"
              value={params.periodStart}
              onChange={(e) => setParams({ ...params, periodStart: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="rp-scenario-ids" className="block text-sm font-medium text-gray-700 mb-1">Scenario IDs (comma-separated)</label>
            <input
              id="rp-scenario-ids"
              type="text"
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="1,2"
              value={params.scenarioIds}
              onChange={(e) => setParams({ ...params, scenarioIds: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="rp-statement" className="block text-sm font-medium text-gray-700 mb-1">Statement</label>
            <select
              id="rp-statement"
              className="w-full border rounded px-3 py-2 text-sm"
              value={params.statement}
              onChange={(e) => setParams({ ...params, statement: e.target.value })}
            >
              <option value="BS">Balance Sheet</option>
              <option value="IS">Income Statement</option>
              <option value="CF">Cash Flow</option>
              <option value="EQ">Equity Statement</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Run Report</button>
          </div>
        </form>
      </div>
    </div>
  )
}
