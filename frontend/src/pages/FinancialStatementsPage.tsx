import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { financialStatementsApi } from '@/api/financialStatements'
import { DrilldownPanel } from '@/components/reports/DrilldownPanel'
import { ReportParameterModal } from '@/components/reports/ReportParameterModal'
import type { CashFlowLine, CashFlowSection } from '@/types'

interface Params {
  entityId: string
  asOfDate: string
  periodStart: string
  scenarioIds: string
  statement: string
}

export function FinancialStatementsPage() {
  const [showModal, setShowModal] = useState(false)
  const [params, setParams] = useState<Params | null>(null)
  const [drilldownCode, setDrilldownCode] = useState<string | null>(null)

  const scenarioIds = params ? params.scenarioIds.split(',').map(Number).filter(Boolean) : []
  const entityId = params ? Number(params.entityId) : 0

  const { data: fsData } = useQuery({
    queryKey: ['fs-cf', entityId, params?.periodStart, params?.asOfDate, scenarioIds],
    queryFn: () =>
      financialStatementsApi
        .getCashFlow(entityId, params!.periodStart, params!.asOfDate, scenarioIds)
        .then((r) => r.data),
    enabled: !!params && params.statement === 'CF',
  })

  const { data: drilldown } = useQuery({
    queryKey: ['drilldown', entityId, params?.asOfDate, drilldownCode],
    queryFn: () =>
      financialStatementsApi
        .getDrilldown(entityId, params!.asOfDate, scenarioIds, drilldownCode!)
        .then((r) => r.data),
    enabled: !!drilldownCode && !!params,
  })

  const handleExport = () => {
    if (!params) return
    const url = financialStatementsApi.getClosePackageUrl(entityId, params.asOfDate, scenarioIds)
    window.open(url, '_blank')
  }

  function renderSection(section: CashFlowSection) {
    return (
      <div key={section.label}>
        <h4 className="text-sm font-semibold text-gray-600 mb-1">{section.label}</h4>
        <table className="w-full text-sm">
          <tbody>
            {section.lines.map((line: CashFlowLine, i: number) => (
              <tr key={i} className={line.is_subtotal ? 'font-semibold border-t' : ''}>
                <td className={`py-1 ${!line.is_subtotal ? 'pl-4' : ''}`}>{line.label}</td>
                <td className="py-1 text-right tabular-nums">
                  {parseFloat(line.amount).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Financial Statements</h1>
        <div className="flex gap-2">
          {params && (
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
            >
              Export Close Package
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {params ? 'Change Parameters' : 'Set Parameters'}
          </button>
        </div>
      </div>

      {!params && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">Set report parameters to view financial statements</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Get Started
          </button>
        </div>
      )}

      {params && params.statement === 'CF' && fsData && (
        <div className="space-y-4">
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-semibold mb-3">Statement of Cash Flows (Indirect Method)</h3>
            <div className="space-y-4">
              {[fsData.operating, fsData.investing, fsData.financing].map(renderSection)}
              <div className="border-t pt-2 font-semibold flex justify-between">
                <span>Net Change in Cash</span>
                <span className="tabular-nums">
                  {parseFloat(fsData.net_change).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                </span>
              </div>
            </div>
            {fsData.warnings.length === 0 && (
              <p className="text-xs text-green-600 mt-2">✓ Cash flow statement ties</p>
            )}
            {fsData.warnings.map((w: string, i: number) => (
              <p key={i} className="text-xs text-amber-600 mt-1">{w}</p>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <ReportParameterModal
          onSubmit={(p) => { setParams(p); setShowModal(false) }}
          onClose={() => setShowModal(false)}
        />
      )}

      {drilldownCode && (
        <DrilldownPanel
          drilldown={drilldown ?? null}
          onClose={() => setDrilldownCode(null)}
        />
      )}
    </div>
  )
}
