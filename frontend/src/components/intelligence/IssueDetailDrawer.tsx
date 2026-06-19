import { useState } from 'react'
import { X, AlertTriangle, ClipboardList, GitBranch, BarChart3, CheckCircle } from 'lucide-react'
import { useFormatCurrencyCompact } from '@/hooks/useFormatCurrency'
import type { DetectedIssue, IssueStatus } from '@/api/accountingIntelligence'
import { SeverityBadge } from './SeverityBadge'

interface Props {
  issue: DetectedIssue | null
  onClose: () => void
  onStatusChange?: (issueId: number, status: IssueStatus) => void
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-mono text-slate-800">{value}</span>
    </div>
  )
}

function formatMetricLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatMetricValue(key: string, val: string): string {
  const num = parseFloat(val)
  if (isNaN(num)) return val
  if (key.endsWith('_pct') || key.endsWith('_change_pct') || key === 'spread_pp') {
    return `${num >= 0 ? '+' : ''}${num.toFixed(1)}%`
  }
  if (Math.abs(num) >= 1000) {
    const fmt = useFormatCurrencyCompact()
    return fmt(num)
  }
  return num.toFixed(2)
}

const NEXT_STATUSES: Record<IssueStatus, { label: string; status: IssueStatus; className: string }[]> = {
  open: [
    { label: 'Acknowledge', status: 'acknowledged', className: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
    { label: 'Dismiss',     status: 'dismissed',    className: 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100' },
  ],
  acknowledged: [
    { label: 'Mark Resolved', status: 'resolved',  className: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' },
    { label: 'Dismiss',       status: 'dismissed', className: 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100' },
  ],
  resolved:  [],
  dismissed: [
    { label: 'Reopen', status: 'open', className: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' },
  ],
}

export function IssueDetailDrawer({ issue, onClose, onStatusChange }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'metrics' | 'procedures' | 'ajes'>('overview')

  if (!issue) return null

  const tabs = [
    { id: 'overview',   label: 'Overview',   icon: AlertTriangle },
    { id: 'metrics',    label: 'Metrics',    icon: BarChart3 },
    { id: 'procedures', label: 'Procedures', icon: ClipboardList },
    { id: 'ajes',       label: 'AJEs',       icon: GitBranch },
  ] as const

  const nextStatuses = NEXT_STATUSES[issue.status] ?? []

  return (
    <div className="fixed inset-0 z-40 flex" data-testid="issue-detail-drawer">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div className="w-[480px] bg-white border-l border-slate-200 flex flex-col shadow-xl h-full overflow-hidden">

        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <SeverityBadge severity={issue.severity} size="xs" />
              <span className="text-[10px] text-slate-400 font-mono">{issue.issue_code}</span>
            </div>
            <h2 className="text-sm font-semibold text-slate-800 leading-tight">{issue.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-4">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors -mb-px ${
                activeTab === id
                  ? 'border-indigo-500 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {activeTab === 'overview' && (
            <>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Description</p>
                <p className="text-xs text-slate-700 leading-relaxed">{issue.description}</p>
              </div>
              {issue.detection_trigger && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Detection Trigger</p>
                  <div className="bg-amber-50 border border-amber-100 rounded p-3">
                    <p className="text-xs text-amber-800 font-mono">{issue.detection_trigger}</p>
                  </div>
                </div>
              )}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">AI Narrative</p>
                <div className="bg-slate-50 border border-slate-100 rounded p-3">
                  <p className="text-xs text-slate-400 italic">
                    AI-generated narrative — architecture reserved for future integration.
                  </p>
                </div>
              </div>
            </>
          )}

          {activeTab === 'metrics' && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Supporting Metrics</p>
              {Object.keys(issue.supporting_metrics).length === 0 ? (
                <p className="text-xs text-slate-400 italic">No supporting metrics available.</p>
              ) : (
                <div className="bg-slate-50 rounded-lg px-3 py-1">
                  {Object.entries(issue.supporting_metrics).map(([k, v]) => (
                    <MetricRow key={k} label={formatMetricLabel(k)} value={formatMetricValue(k, v)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'procedures' && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Suggested Procedures</p>
              {issue.suggested_procedures ? (
                <div className="space-y-1.5">
                  {issue.suggested_procedures.split('\n').filter(Boolean).map((line, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
                      <CheckCircle className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
                      <span>{line.replace(/^\d+\.\s*/, '')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No suggested procedures.</p>
              )}
            </div>
          )}

          {activeTab === 'ajes' && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Suggested Adjusting Journal Entries</p>
              {issue.suggested_ajes ? (
                <div className="space-y-2">
                  {issue.suggested_ajes.split('\n').filter(Boolean).map((line, i) => (
                    <div key={i} className="bg-indigo-50 border border-indigo-100 rounded p-2.5">
                      <p className="text-xs text-indigo-800 leading-relaxed">
                        {line.replace(/^Consider:\s*/i, '')}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No suggested AJEs.</p>
              )}
            </div>
          )}

        </div>

        {/* Status actions */}
        {nextStatuses.length > 0 && onStatusChange && issue.id != null && (
          <div className="p-4 border-t border-slate-100 flex items-center gap-2">
            <span className="text-xs text-slate-500 mr-1">Action:</span>
            {nextStatuses.map(({ label, status, className }) => (
              <button
                key={status}
                onClick={() => onStatusChange(issue.id!, status)}
                className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${className}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
