import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { reportingSettingsApi, type SettingsUpdate } from '@/api/reportingSettings'
import type { ReportingPresentationSettings } from '@/types'
import {
  Save,
  RotateCcw,
  DollarSign,
  Hash,
  Layout,
  Calendar,
  Eye,
  CheckSquare,
} from 'lucide-react'

const SCALING_OPTIONS = [
  { value: 'actual', label: 'Actual', example: '1,234,567' },
  { value: 'thousands', label: 'Thousands', example: '1,235' },
  { value: 'millions', label: 'Millions', example: '1.2' },
  { value: 'billions', label: 'Billions', example: '0.001' },
]

const DECIMAL_OPTIONS = [
  { value: 0, label: '0 decimals', example: '1,235' },
  { value: 1, label: '1 decimal', example: '1,234.6' },
  { value: 2, label: '2 decimals', example: '1,234.57' },
  { value: 4, label: '4 decimals', example: '1,234.5678' },
]

const NEGATIVE_FORMAT_OPTIONS = [
  { value: 'parentheses', label: '(100)', description: 'Accounting standard' },
  { value: 'minus', label: '−100', description: 'Mathematical notation' },
  { value: 'red', label: 'Red text', description: 'Color-coded' },
]

const DATE_FORMAT_OPTIONS = [
  { value: 'long', label: 'Dec 31, 2025', example: 'Long format' },
  { value: 'short', label: '12/31/25', example: 'Short format' },
  { value: 'iso', label: '2025-12-31', example: 'ISO 8601' },
]

const DEFAULTS: Omit<ReportingPresentationSettings, 'id' | 'org_id'> = {
  display_scaling: 'actual',
  decimal_places: 2,
  negative_format: 'parentheses',
  show_account_numbers: false,
  collapse_subtotals: false,
  show_hierarchy_indent: true,
  show_zero_balance: false,
  hide_inactive: true,
  date_format: 'long',
  currency_symbol: '$',
  bold_subtotals: true,
  underline_totals: true,
  alternate_row_shading: false,
  default_view_id: null,
}

function SectionCard({ icon: Icon, title, children }: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        <Icon className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function RadioCard({ selected, onClick, label, secondary }: {
  selected: boolean
  onClick: () => void
  label: string
  secondary?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start rounded-md border px-4 py-3 text-left transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <span className={`text-sm font-medium ${selected ? 'text-blue-700' : 'text-gray-800'}`}>
        {label}
      </span>
      {secondary && (
        <span className="mt-0.5 text-xs text-gray-500">{secondary}</span>
      )}
    </button>
  )
}

function ToggleRow({ checked, onChange, label, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <div>
        <span className="text-sm font-medium text-gray-800">{label}</span>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
    </label>
  )
}

function PreviewPanel({ settings }: { settings: Partial<ReportingPresentationSettings> }) {
  const scale = settings.display_scaling ?? 'actual'
  const decimals = settings.decimal_places ?? 2
  const negFmt = settings.negative_format ?? 'parentheses'
  const showAcct = settings.show_account_numbers ?? false
  const boldSub = settings.bold_subtotals ?? true
  const underline = settings.underline_totals ?? true
  const altShading = settings.alternate_row_shading ?? false

  const raw = 1234567.89
  const divisor = scale === 'thousands' ? 1000 : scale === 'millions' ? 1000000 : scale === 'billions' ? 1000000000 : 1
  const scaled = raw / divisor
  const formatted = scaled.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  const neg = -45678 / divisor
  const negFormatted = neg.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  const negDisplay =
    negFmt === 'parentheses'
      ? `(${Math.abs(neg).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })})`
      : negFmt === 'red'
      ? negFormatted
      : negFormatted

  const rows = [
    { code: '4000', label: 'Total Revenue', value: formatted, isSub: false, isTotal: false },
    { code: '5000', label: 'Total Cost of Revenue', value: negDisplay, isSub: false, isTotal: false, isNeg: negFmt === 'red' },
    { code: '', label: 'Gross Profit', value: formatted, isSub: true, isTotal: false },
    { code: '6000', label: 'Operating Expenses', value: negDisplay, isSub: false, isTotal: false, isNeg: negFmt === 'red' },
    { code: '', label: 'Net Income', value: formatted, isSub: false, isTotal: true },
  ]

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-800">Live Preview</h3>
        <p className="text-xs text-gray-500">Example income statement excerpt</p>
      </div>
      <div className="px-5 py-4">
        <div className="overflow-hidden rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {showAcct && <th className="px-3 py-2 text-left font-medium text-gray-500">Code</th>}
                <th className="px-3 py-2 text-left font-medium text-gray-500">Account</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b border-gray-100 last:border-0 ${
                    altShading && i % 2 === 1 ? 'bg-gray-50' : 'bg-white'
                  }`}
                >
                  {showAcct && (
                    <td className="px-3 py-1.5 text-gray-400">{row.code}</td>
                  )}
                  <td
                    className={`px-3 py-1.5 ${
                      row.isSub ? (boldSub ? 'font-semibold text-gray-800' : 'font-medium text-gray-700') : 'text-gray-700'
                    } ${row.isTotal ? (underline ? 'border-t-2 border-b-2 border-gray-400 font-bold text-gray-900' : 'font-bold text-gray-900') : ''}`}
                  >
                    {row.label}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right ${
                      (row as any).isNeg ? 'text-red-600' : 'text-gray-800'
                    } ${row.isSub ? (boldSub ? 'font-semibold' : 'font-medium') : ''} ${
                      row.isTotal ? (underline ? 'border-t-2 border-b-2 border-gray-400 font-bold' : 'font-bold') : ''
                    }`}
                  >
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {scale !== 'actual' && (
          <p className="mt-2 text-right text-[10px] text-gray-400">
            In {scale} of {settings.currency_symbol ?? '$'}
          </p>
        )}
      </div>
    </div>
  )
}

export function ReportingSettingsPage() {
  const qc = useQueryClient()

  const { data: saved, isLoading } = useQuery({
    queryKey: ['reporting-settings'],
    queryFn: () => reportingSettingsApi.get(),
  })

  const [draft, setDraft] = useState<Partial<ReportingPresentationSettings>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (saved && !dirty) {
      setDraft(saved)
    }
  }, [saved, dirty])

  const mutation = useMutation({
    mutationFn: (body: SettingsUpdate) => reportingSettingsApi.update(body),
    onSuccess: (data) => {
      qc.setQueryData(['reporting-settings'], data)
      setDraft(data)
      setDirty(false)
    },
  })

  function set<K extends keyof ReportingPresentationSettings>(key: K, value: ReportingPresentationSettings[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setDirty(true)
  }

  function handleReset() {
    setDraft(saved ?? {})
    setDirty(false)
  }

  function handleSave() {
    const { id: _id, org_id: _org, ...body } = draft as ReportingPresentationSettings
    mutation.mutate(body)
  }

  const effective = { ...DEFAULTS, ...draft }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-gray-500">Loading settings…</div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Reporting Settings</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Configure how financial statements are displayed and formatted
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
            )}
            <button
              onClick={handleReset}
              disabled={!dirty}
              className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || mutation.isPending}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
              {mutation.isPending ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 gap-6 overflow-auto p-6">
        <div className="flex-1 space-y-5 min-w-0">
          {/* Display Scaling */}
          <SectionCard icon={Hash} title="Display Scaling">
            <p className="mb-3 text-xs text-gray-500">
              Scale all monetary values for readability in reports
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SCALING_OPTIONS.map((opt) => (
                <RadioCard
                  key={opt.value}
                  selected={effective.display_scaling === opt.value}
                  onClick={() => set('display_scaling', opt.value as ReportingPresentationSettings['display_scaling'])}
                  label={opt.label}
                  secondary={opt.example}
                />
              ))}
            </div>
          </SectionCard>

          {/* Decimal Places */}
          <SectionCard icon={Hash} title="Decimal Precision">
            <p className="mb-3 text-xs text-gray-500">
              Number of decimal places shown on monetary amounts
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DECIMAL_OPTIONS.map((opt) => (
                <RadioCard
                  key={opt.value}
                  selected={effective.decimal_places === opt.value}
                  onClick={() => set('decimal_places', opt.value as ReportingPresentationSettings['decimal_places'])}
                  label={opt.label}
                  secondary={opt.example}
                />
              ))}
            </div>
          </SectionCard>

          {/* Negative Format */}
          <SectionCard icon={Layout} title="Negative Number Format">
            <p className="mb-3 text-xs text-gray-500">
              How negative values are displayed throughout reports
            </p>
            <div className="grid grid-cols-3 gap-2">
              {NEGATIVE_FORMAT_OPTIONS.map((opt) => (
                <RadioCard
                  key={opt.value}
                  selected={effective.negative_format === opt.value}
                  onClick={() => set('negative_format', opt.value as ReportingPresentationSettings['negative_format'])}
                  label={opt.label}
                  secondary={opt.description}
                />
              ))}
            </div>
          </SectionCard>

          {/* Date Format */}
          <SectionCard icon={Calendar} title="Date Formatting">
            <p className="mb-3 text-xs text-gray-500">
              Format for dates shown on report headers and period labels
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DATE_FORMAT_OPTIONS.map((opt) => (
                <RadioCard
                  key={opt.value}
                  selected={effective.date_format === opt.value}
                  onClick={() => set('date_format', opt.value as ReportingPresentationSettings['date_format'])}
                  label={opt.label}
                  secondary={opt.example}
                />
              ))}
            </div>
          </SectionCard>

          {/* Currency */}
          <SectionCard icon={DollarSign} title="Currency Settings">
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Currency Symbol</label>
                <input
                  type="text"
                  value={effective.currency_symbol ?? '$'}
                  onChange={(e) => set('currency_symbol', e.target.value)}
                  maxLength={4}
                  className="w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </SectionCard>

          {/* Statement Display */}
          <SectionCard icon={Eye} title="Statement Display">
            <div className="space-y-3">
              <ToggleRow
                checked={effective.show_account_numbers ?? false}
                onChange={(v) => set('show_account_numbers', v)}
                label="Show account numbers"
                description="Display account codes alongside account names"
              />
              <ToggleRow
                checked={effective.collapse_subtotals ?? false}
                onChange={(v) => set('collapse_subtotals', v)}
                label="Collapse subtotals by default"
                description="Start reports with detail rows hidden"
              />
              <ToggleRow
                checked={effective.show_hierarchy_indent ?? true}
                onChange={(v) => set('show_hierarchy_indent', v)}
                label="Show hierarchy indentation"
                description="Indent child accounts under parent groups"
              />
              <ToggleRow
                checked={effective.show_zero_balance ?? false}
                onChange={(v) => set('show_zero_balance', v)}
                label="Show zero-balance accounts"
                description="Include accounts with $0 balance in reports"
              />
              <ToggleRow
                checked={effective.hide_inactive ?? true}
                onChange={(v) => set('hide_inactive', v)}
                label="Hide inactive accounts"
                description="Exclude accounts marked inactive from reports"
              />
            </div>
          </SectionCard>

          {/* Report Presentation */}
          <SectionCard icon={CheckSquare} title="Report Presentation">
            <div className="space-y-3">
              <ToggleRow
                checked={effective.bold_subtotals ?? true}
                onChange={(v) => set('bold_subtotals', v)}
                label="Bold subtotal rows"
                description="Display subtotal lines in bold font"
              />
              <ToggleRow
                checked={effective.underline_totals ?? true}
                onChange={(v) => set('underline_totals', v)}
                label="Underline total rows"
                description="Add double underline to grand totals (accounting standard)"
              />
              <ToggleRow
                checked={effective.alternate_row_shading ?? false}
                onChange={(v) => set('alternate_row_shading', v)}
                label="Alternating row shading"
                description="Light gray background on every other row for readability"
              />
            </div>
          </SectionCard>
        </div>

        {/* Sticky preview panel */}
        <div className="w-72 shrink-0">
          <div className="sticky top-0">
            <PreviewPanel settings={effective} />
            {mutation.isError && (
              <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                Failed to save settings. Please try again.
              </div>
            )}
            {mutation.isSuccess && !dirty && (
              <div className="mt-3 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                Settings saved successfully.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
