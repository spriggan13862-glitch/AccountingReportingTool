/**
 * Phase C: IssuesPanel — extracted from the deprecated ImportReviewPage so the
 * wizard step 5 can render the same grouped-severity issue summary inline.
 *
 * Renders ERROR / WARNING / INFO buckets with collapse + a "Blocks posting"
 * badge on known blocking codes. Includes a CSV export of all issues.
 */
import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle, XCircle, EyeOff, Download } from 'lucide-react'
import type { ImportIssue } from '@/types'

const BLOCKING_CODES = new Set([
  'OUT_OF_BALANCE',
  'MISSING_ACCOUNT',
  'UNMAPPED_REQUIRED',
  'INVALID_AMOUNT',
])

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    ERROR: 'bg-red-100 text-red-700',
    WARNING: 'bg-yellow-100 text-yellow-800',
    INFO: 'bg-blue-100 text-blue-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[severity] ?? 'bg-gray-100 text-gray-600'}`}>
      {severity}
    </span>
  )
}

function IssueRow({ issue }: { issue: ImportIssue }) {
  const isBlocking = BLOCKING_CODES.has(issue.code)
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 border-b last:border-0">
      {issue.severity === 'ERROR' && <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
      {issue.severity === 'WARNING' && <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />}
      {issue.severity === 'INFO' && <CheckCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <SeverityBadge severity={issue.severity} />
          <span className="text-xs font-mono text-gray-400">{issue.code}</span>
          {isBlocking && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
              Blocks posting
            </span>
          )}
        </div>
        <p className="text-sm text-gray-700">{issue.message}</p>
        {issue.suggested_resolution && (
          <p className="text-xs text-gray-400 mt-0.5">Suggestion: {issue.suggested_resolution}</p>
        )}
      </div>
    </div>
  )
}

export function IssuesPanel({ batchId, issues }: { batchId: number; issues: ImportIssue[] | undefined }) {
  const [warningsOpen, setWarningsOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

  const grouped = useMemo(() => {
    const errors: ImportIssue[] = []
    const warnings: ImportIssue[] = []
    const infos: ImportIssue[] = []
    for (const i of issues ?? []) {
      if (i.severity === 'ERROR') errors.push(i)
      else if (i.severity === 'WARNING') warnings.push(i)
      else infos.push(i)
    }
    return { errors, warnings, infos }
  }, [issues])

  function exportCsv() {
    const rows = [
      ['Severity', 'Code', 'Message', 'Suggestion'],
      ...(issues ?? []).map((i) => [i.severity, i.code, i.message, i.suggested_resolution ?? '']),
    ]
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `import-${batchId}-issues.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!issues?.length) {
    return (
      <div
        className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        data-testid="issues-panel-empty"
      >
        <span className="inline-flex items-center gap-2 font-semibold">
          <CheckCircle className="w-4 h-4" /> No validation issues
        </span>
        <p className="mt-1 text-xs">All imported lines look clean. Continue to post.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white" data-testid="issues-panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-700">
          Validation issues ({issues.length})
        </span>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
          data-testid="export-issues-csv"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {/* Errors — always expanded */}
      {grouped.errors.length > 0 && (
        <div className="border-b border-gray-200 bg-red-50/30">
          <div className="px-4 py-2 text-xs font-bold text-red-700 uppercase">
            {grouped.errors.length} error{grouped.errors.length === 1 ? '' : 's'} · must resolve before posting
          </div>
          {grouped.errors.map((i, idx) => <IssueRow key={idx} issue={i} />)}
        </div>
      )}

      {/* Warnings — collapsed by default */}
      {grouped.warnings.length > 0 && (
        <div className="border-b border-gray-200">
          <button
            type="button"
            onClick={() => setWarningsOpen((p) => !p)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-wide text-yellow-700 bg-yellow-50/50 hover:bg-yellow-50"
          >
            <span>{grouped.warnings.length} warning{grouped.warnings.length === 1 ? '' : 's'} · non-blocking</span>
            <span>{warningsOpen ? '−' : '+'}</span>
          </button>
          {warningsOpen && grouped.warnings.map((i, idx) => <IssueRow key={idx} issue={i} />)}
        </div>
      )}

      {/* Info — collapsed by default */}
      {grouped.infos.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setInfoOpen((p) => !p)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-wide text-blue-700 bg-blue-50/50 hover:bg-blue-50"
          >
            <span>{grouped.infos.length} info note{grouped.infos.length === 1 ? '' : 's'}</span>
            <span>{infoOpen ? '−' : '+'}</span>
          </button>
          {infoOpen && grouped.infos.map((i, idx) => <IssueRow key={idx} issue={i} />)}
        </div>
      )}

      {grouped.errors.length === 0 && (
        <div className="px-4 py-2 text-xs text-gray-500 flex items-center gap-2 border-t border-gray-100">
          <EyeOff className="w-3.5 h-3.5" /> No blocking errors — ready to continue.
        </div>
      )}
    </div>
  )
}
