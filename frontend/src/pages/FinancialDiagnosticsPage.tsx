import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, TrendingDown, Percent, Scale, AlertCircle, CheckCircle, Loader,
} from 'lucide-react'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'
import { EntitySelect } from '@/components/ui/EntitySelect'
import { PeriodSelect } from '@/components/ui/PeriodSelect'
import { getDiagnostics, type DiagnosticsResult } from '@/api/accountingIntelligence'

function fmtAmt(val: string | null | undefined): string {
  if (!val) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${n.toFixed(0)}`
}

function fmtRatio(val: string | null | undefined, decimals = 2): string {
  if (!val) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return n.toFixed(decimals) + 'x'
}

function fmtPct(val: string | null | undefined): string {
  if (!val) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return `${n.toFixed(1)}%`
}

interface MetricCardProps {
  label: string
  value: string
  subtext?: string
  status?: 'ok' | 'warn' | 'danger' | 'neutral'
}

function MetricCard({ label, value, subtext, status = 'neutral' }: MetricCardProps) {
  const statusClass: Record<string, string> = {
    ok:      'border-green-200 bg-green-50',
    warn:    'border-amber-200 bg-amber-50',
    danger:  'border-red-200 bg-red-50',
    neutral: 'border-slate-200 bg-white',
  }
  const valueClass: Record<string, string> = {
    ok:      'text-green-700',
    warn:    'text-amber-700',
    danger:  'text-red-700',
    neutral: 'text-slate-800',
  }
  return (
    <div className={`border rounded-lg p-3 ${statusClass[status]}`} data-testid={`metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-lg font-bold leading-none ${valueClass[status]}`}>{value}</p>
      {subtext && <p className="text-[10px] text-slate-400 mt-1">{subtext}</p>}
    </div>
  )
}

function RatioSection({ data }: { data: DiagnosticsResult }) {
  const cr = data.current_ratio ? parseFloat(data.current_ratio) : null
  const gm = data.gross_margin_pct ? parseFloat(data.gross_margin_pct) : null
  const de = data.debt_to_equity ? parseFloat(data.debt_to_equity) : null
  const roa = data.roa ? parseFloat(data.roa) : null

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4" data-testid="ratio-analysis">
      <div className="flex items-center gap-2 mb-3">
        <Percent className="w-4 h-4 text-indigo-500" />
        <h3 className="text-xs font-semibold text-slate-700">Ratio Analysis</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard
          label="Current Ratio"
          value={cr != null ? `${cr.toFixed(2)}x` : '—'}
          subtext="Current Assets / Current Liabilities"
          status={cr == null ? 'neutral' : cr >= 1.5 ? 'ok' : cr >= 1.0 ? 'warn' : 'danger'}
        />
        <MetricCard
          label="Gross Margin"
          value={fmtPct(data.gross_margin_pct)}
          subtext="Gross Profit / Revenue"
          status={gm == null ? 'neutral' : gm >= 40 ? 'ok' : gm >= 20 ? 'warn' : 'danger'}
        />
        <MetricCard
          label="Debt / Equity"
          value={de != null ? `${de.toFixed(2)}x` : '—'}
          subtext="Total Liabilities / Total Equity"
          status={de == null ? 'neutral' : de <= 1.0 ? 'ok' : de <= 3.0 ? 'warn' : 'danger'}
        />
        <MetricCard
          label="Return on Assets"
          value={fmtPct(data.roa)}
          subtext="Net Income / Total Assets"
          status={roa == null ? 'neutral' : roa >= 5 ? 'ok' : roa >= 0 ? 'warn' : 'danger'}
        />
      </div>
    </div>
  )
}

function IncomeSection({ data }: { data: DiagnosticsResult }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4" data-testid="income-analysis">
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className="w-4 h-4 text-indigo-500" />
        <h3 className="text-xs font-semibold text-slate-700">Income Statement Summary</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Revenue"        value={fmtAmt(data.revenue)} />
        <MetricCard label="Gross Profit"   value={fmtAmt(data.gross_profit)} />
        <MetricCard label="Total Expenses" value={fmtAmt(data.total_expenses)} />
        <MetricCard
          label="Net Income"
          value={fmtAmt(data.net_income)}
          status={parseFloat(data.net_income) >= 0 ? 'ok' : 'danger'}
        />
      </div>
    </div>
  )
}

function BalanceSheetSection({ data }: { data: DiagnosticsResult }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4" data-testid="balance-sheet-analysis">
      <div className="flex items-center gap-2 mb-3">
        <Scale className="w-4 h-4 text-indigo-500" />
        <h3 className="text-xs font-semibold text-slate-700">Balance Sheet Summary</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Total Assets"      value={fmtAmt(data.total_assets)} />
        <MetricCard label="Total Liabilities" value={fmtAmt(data.total_liabilities)} />
        <MetricCard label="Total Equity"      value={fmtAmt(data.total_equity)} />
        <MetricCard label="Working Capital"   value={fmtAmt(data.working_capital)}
          status={parseFloat(data.working_capital) >= 0 ? 'ok' : 'danger'}
        />
      </div>
    </div>
  )
}

function BalanceValidation({ data }: { data: DiagnosticsResult }) {
  const { balanced, assets, liabilities_plus_equity } = data.balance_check
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4" data-testid="balance-validation">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-4 h-4 text-indigo-500" />
        <h3 className="text-xs font-semibold text-slate-700">Balance Validation</h3>
      </div>
      <div className={`flex items-start gap-3 p-3 rounded-lg ${balanced ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        {balanced
          ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
          : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
        }
        <div>
          <p className={`text-xs font-semibold ${balanced ? 'text-green-700' : 'text-red-700'}`}>
            {balanced ? 'Assets = Liabilities + Equity' : 'Balance Sheet Out of Balance'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Assets: {fmtAmt(assets)} | Liabilities + Equity: {fmtAmt(liabilities_plus_equity)}
          </p>
        </div>
      </div>
    </div>
  )
}

export function FinancialDiagnosticsPage() {
  const [entityId, setEntityId] = useState<number | ''>('')
  const [periodId, setPeriodId] = useState<number | ''>('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['diagnostics', entityId, periodId],
    queryFn: () => getDiagnostics({ entity_id: entityId as number, current_period_id: periodId as number }),
    enabled: !!entityId && !!periodId,
  })

  return (
    <PageLayout
      title="Financial Diagnostics"
      subtitle="Ratio analysis, balance validation, and key metrics for the selected period"
      breadcrumb={
        <Breadcrumb items={[
          { label: 'Accounting Intelligence', href: '/intelligence/quarterly-review' },
          { label: 'Financial Diagnostics' },
        ]} />
      }
      actions={<WorkspaceCrossLinks current="intelligence" />}
    >
      <div className="space-y-4" data-testid="financial-diagnostics-page">

        {/* Selectors */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Entity</label>
              <EntitySelect value={entityId} onChange={(v) => setEntityId(v ?? '')} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Period</label>
              <PeriodSelect
                entityId={entityId || undefined}
                value={periodId}
                onChange={(v) => setPeriodId(v ?? '')}
              />
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader className="w-5 h-5 animate-spin text-indigo-400" />
          </div>
        )}

        {isError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            Failed to load diagnostics. Ensure there is financial data for the selected period.
          </div>
        )}

        {data && (
          <>
            <RatioSection data={data} />
            <IncomeSection data={data} />
            <BalanceSheetSection data={data} />
            <BalanceValidation data={data} />
          </>
        )}

        {!data && !isLoading && (
          <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg" data-testid="diagnostics-notice">
            <Activity className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <p className="text-xs text-indigo-700">
              Select an entity and period to compute financial diagnostics from the trial balance.
            </p>
          </div>
        )}

      </div>
    </PageLayout>
  )
}
