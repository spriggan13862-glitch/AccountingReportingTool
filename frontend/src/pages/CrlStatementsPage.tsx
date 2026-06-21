import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, BookOpen, AlertCircle, FileText } from 'lucide-react'
import { commonReportingLinesApi } from '@/api/commonReportingLines'
import type {
  CrlStatementResponse,
  CrlStatementRow,
  ReportingTemplate,
} from '@/api/commonReportingLines'
import { PageLayout } from '@/components/ui/PageLayout'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { useOrg } from '@/providers/OrgProvider'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { useFormatCurrencyCompact } from '@/hooks/useFormatCurrency'

type StatementTab = 'balance-sheet' | 'income-statement' | 'trial-balance' | 'cash-flow'

const TABS: { id: StatementTab; label: string }[] = [
  { id: 'balance-sheet', label: 'Balance Sheet' },
  { id: 'income-statement', label: 'Income Statement' },
  { id: 'cash-flow', label: 'Cash Flow' },
  { id: 'trial-balance', label: 'Trial Balance (all)' },
]

export function CrlStatementsPage() {
  const { org } = useOrg()
  const workspace = useWorkspace()
  const orgId = org?.id ?? null

  const [entityId, setEntityId] = useState<number | ''>(workspace?.activeEntity?.id ?? '')
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [tab, setTab] = useState<StatementTab>('balance-sheet')
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('')

  const { data: templates = [] } = useQuery<ReportingTemplate[]>({
    queryKey: ['crl-templates', orgId],
    queryFn: () => commonReportingLinesApi.listTemplates({
      organization_id: orgId ?? undefined,
    }),
    enabled: orgId !== null,
  })

  const fetcher = useMemo(() => {
    switch (tab) {
      case 'balance-sheet': return commonReportingLinesApi.balanceSheet
      case 'income-statement': return commonReportingLinesApi.incomeStatement
      case 'cash-flow': return commonReportingLinesApi.cashFlow
      case 'trial-balance': return commonReportingLinesApi.trialBalance
    }
  }, [tab])

  const enabled = entityId !== '' && Boolean(asOfDate)
  const { data, isLoading, error } = useQuery<CrlStatementResponse>({
    queryKey: ['crl-statement', tab, entityId, asOfDate, orgId, selectedTemplateId],
    queryFn: () => fetcher({
      entity_id: entityId as number,
      as_of_date: asOfDate,
      organization_id: orgId ?? undefined,
      template_id: selectedTemplateId !== '' ? (selectedTemplateId as number) : undefined,
    }),
    enabled,
  })

  return (
    <PageLayout
      title="Statements by Reporting Line"
      subtitle="Roll the trial balance up to the Common Reporting Line layer — the canonical reporting boundary"
    >
      <div className="space-y-4">
        {/* Controls */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <EntitySelect value={entityId} onChange={setEntityId} label="Entity" required />
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">As-of date</label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-full h-9 px-2 border border-gray-300 rounded text-sm"
              data-testid="crl-stmt-asof"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Reporting template (optional)</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : '')}
              className="w-full h-9 px-2 border border-gray-300 rounded text-sm"
              data-testid="crl-stmt-template"
            >
              <option value="">— No filter —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="text-[11px] text-gray-500 flex items-start gap-1.5">
            <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Reads through the CRL precedence chain: direct CRL → Sprint O → legacy taxonomy.</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200" data-testid="crl-stmt-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              data-testid={`crl-stmt-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        {!enabled ? (
          <div className="text-xs text-gray-500 p-4 border border-dashed border-gray-300 rounded">
            Pick an entity and as-of date to render the statement.
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-500 p-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-3">
            Failed to load: {(error as Error).message}
          </div>
        ) : data ? (
          <CrlStatementBody data={data} />
        ) : null}
      </div>
    </PageLayout>
  )
}


function CrlStatementBody({ data }: { data: CrlStatementResponse }) {
  const fmt = useFormatCurrencyCompact()
  const bySection = useMemo(() => {
    const out: Record<string, CrlStatementRow[]> = {}
    for (const r of data.rows) {
      if (!out[r.section]) out[r.section] = []
      out[r.section].push(r)
    }
    return out
  }, [data])

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div
        className={`rounded-lg border px-4 py-2.5 text-xs flex items-center gap-4 flex-wrap ${
          data.unclassified_accounts > 0
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}
        data-testid="crl-stmt-status"
      >
        <span className="font-semibold flex items-center gap-1.5">
          {data.unclassified_accounts > 0 ? <AlertCircle className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
          {data.classified_accounts} of {data.total_accounts} accounts classified
        </span>
        {data.unclassified_accounts > 0 && (
          <span>· {data.unclassified_accounts} unclassified</span>
        )}
        {data.needs_review_accounts > 0 && (
          <span>· {data.needs_review_accounts} needs review</span>
        )}
        {data.accounts_outside_template > 0 && (
          <span>· {data.accounts_outside_template} outside selected template</span>
        )}
      </div>

      {data.rows.length === 0 ? (
        <div className="text-xs text-gray-500 p-4 border border-dashed border-gray-300 rounded">
          No posted balances for this entity / date.
        </div>
      ) : (
        Object.entries(bySection).map(([section, rows]) => {
          const sectionTotal = rows
            .filter((r) => r.parent_crl_id === null)
            .reduce((sum, r) => sum + Number(r.display_balance || '0'), 0)
          return (
            <div key={section} className="border border-gray-200 rounded-lg overflow-hidden" data-testid={`crl-stmt-section-${section}`}>
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-800 uppercase tracking-wide">{section}</span>
                <span className="text-xs font-bold text-gray-700 tabular-nums">{fmt(sectionTotal)}</span>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-white border-b border-gray-100">
                  <tr className="text-left text-gray-500">
                    <th className="px-3 py-1.5 font-semibold">Reporting Line</th>
                    <th className="px-3 py-1.5 font-semibold w-20 text-right">Accounts</th>
                    <th className="px-3 py-1.5 font-semibold w-32 text-right">Own</th>
                    <th className="px-3 py-1.5 font-semibold w-32 text-right">Total (incl. children)</th>
                    <th className="px-3 py-1.5 font-semibold w-32 text-right">Display</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.crl_id} className="border-t border-gray-100" data-testid={`crl-stmt-row-${r.crl_code}`}>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5" style={{ paddingLeft: `${r.depth * 14}px` }}>
                          <span className={r.parent_crl_id === null ? 'font-semibold text-gray-800' : 'text-gray-700'}>
                            {r.crl_name}
                          </span>
                          <span className="font-mono text-[10px] text-gray-400">{r.crl_code}</span>
                          {r.is_mandatory && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Required</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 tabular-nums text-right text-gray-600">{r.account_count}</td>
                      <td className="px-3 py-1.5 tabular-nums text-right text-gray-600">{fmt(Number(r.own_signed_balance))}</td>
                      <td className="px-3 py-1.5 tabular-nums text-right text-gray-700">{fmt(Number(r.total_signed_balance))}</td>
                      <td className="px-3 py-1.5 tabular-nums text-right font-semibold text-gray-800">{fmt(Number(r.display_balance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })
      )}
    </div>
  )
}
