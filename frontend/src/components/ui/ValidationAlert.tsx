import { AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { ValidationIssue, ValidationResponse } from '@/types'

interface ValidationAlertProps {
  result?: ValidationResponse | null
  /** Pass a flat list when you just have issues rather than a full ValidationResponse */
  issues?: ValidationIssue[]
  className?: string
}

const SEV_CONFIG = {
  ERROR: {
    icon: AlertCircle,
    bg: 'bg-red-50',
    border: 'border-red-300',
    text: 'text-red-800',
    iconColor: 'text-red-500',
  },
  WARNING: {
    icon: AlertTriangle,
    bg: 'bg-yellow-50',
    border: 'border-yellow-300',
    text: 'text-yellow-800',
    iconColor: 'text-yellow-500',
  },
  INFO: {
    icon: Info,
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-800',
    iconColor: 'text-blue-500',
  },
  SUCCESS: {
    icon: CheckCircle,
    bg: 'bg-green-50',
    border: 'border-green-300',
    text: 'text-green-800',
    iconColor: 'text-green-500',
  },
}

function IssueGroup({ label, items, severity }: { label: string; items: ValidationIssue[]; severity: keyof typeof SEV_CONFIG }) {
  if (items.length === 0) return null
  const cfg = SEV_CONFIG[severity]
  const Icon = cfg.icon
  return (
    <div className={cn('rounded-md border p-3', cfg.bg, cfg.border)}>
      <div className={cn('flex items-center gap-2 mb-2', cfg.text)}>
        <Icon className={cn('h-4 w-4 shrink-0', cfg.iconColor)} />
        <span className="text-xs font-semibold uppercase tracking-wide">{label} ({items.length})</span>
      </div>
      <ul className="space-y-1">
        {items.map((issue, i) => (
          <li key={i} className={cn('text-sm', cfg.text)}>
            <span className="font-mono text-xs opacity-70 mr-1">[{issue.code}]</span>
            {issue.message}
            {issue.suggested_resolution && (
              <span className="block text-xs opacity-70 mt-0.5">→ {issue.suggested_resolution}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ValidationAlert({ result, issues, className }: ValidationAlertProps) {
  const errors = result?.errors ?? issues?.filter(i => i.severity.toUpperCase() === 'ERROR') ?? []
  const warnings = result?.warnings ?? issues?.filter(i => i.severity.toUpperCase() === 'WARNING') ?? []
  const infos = result?.info ?? issues?.filter(i => i.severity.toUpperCase() === 'INFO') ?? []

  if (errors.length === 0 && warnings.length === 0 && infos.length === 0) return null

  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="validation-alert">
      <IssueGroup label="Errors" items={errors} severity="ERROR" />
      <IssueGroup label="Warnings" items={warnings} severity="WARNING" />
      <IssueGroup label="Info" items={infos} severity="INFO" />
    </div>
  )
}

/** Compact single-message error banner (for API errors) */
export function ErrorBanner({ message, className }: { message: string; className?: string }) {
  if (!message) return null
  const cfg = SEV_CONFIG.ERROR
  const Icon = cfg.icon
  return (
    <div
      className={cn('flex items-start gap-2 rounded-md border p-3', cfg.bg, cfg.border, className)}
      data-testid="error-banner"
      role="alert"
    >
      <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', cfg.iconColor)} />
      <p className={cn('text-sm', cfg.text)}>{message}</p>
    </div>
  )
}
