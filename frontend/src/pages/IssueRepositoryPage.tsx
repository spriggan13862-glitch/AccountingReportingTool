import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, BookMarked, ChevronRight, AlertTriangle, Info, Shield, Zap } from 'lucide-react'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'
import { SeverityBadge } from '@/components/intelligence/SeverityBadge'
import {
  listRepositoryCategories,
  listRepository,
  type IssueTemplate,
  type IssueRiskLevel,
  type IssueType,
} from '@/api/accountingIntelligence'

const CATEGORY_LABELS: Record<string, string> = {
  revenue_recognition: 'Revenue Recognition',
  accounts_receivable: 'Accounts Receivable',
  inventory: 'Inventory',
  cash_management: 'Cash Management',
  accounts_payable: 'Accounts Payable',
  accrued_liabilities: 'Accrued Liabilities',
  fixed_assets: 'Fixed Assets',
  intangible_assets: 'Intangible Assets',
  leases: 'Leases',
  debt_obligations: 'Debt Obligations',
  equity: 'Equity',
  income_tax: 'Income Tax',
  payroll: 'Payroll',
  working_capital: 'Working Capital',
  gross_margin: 'Gross Margin',
  operating_expenses: 'Operating Expenses',
  ebitda_quality: 'EBITDA Quality',
  quality_of_earnings: 'Quality of Earnings',
  sba_compliance: 'SBA Compliance',
  related_party: 'Related Party',
  cash_flow_statement: 'Cash Flow Statement',
  financial_reporting: 'Financial Reporting',
  disclosures: 'Disclosures',
  presentation: 'Presentation',
  fraud_indicators: 'Fraud Indicators',
  industry_specific: 'Industry Specific',
}

const ISSUE_TYPE_LABELS: Record<string, string> = {
  financial_analytics: 'Financial Analytics',
  balance_sheet: 'Balance Sheet',
  audit: 'Audit',
  qoe: 'Quality of Earnings',
  sba: 'SBA',
  fraud: 'Fraud',
  disclosure: 'Disclosure',
  presentation: 'Presentation',
}

const RISK_COLORS: Record<IssueRiskLevel, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  moderate: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
}

const TYPE_COLORS: Record<string, string> = {
  financial_analytics: 'bg-purple-100 text-purple-800',
  balance_sheet: 'bg-indigo-100 text-indigo-800',
  audit: 'bg-teal-100 text-teal-800',
  qoe: 'bg-green-100 text-green-800',
  sba: 'bg-cyan-100 text-cyan-800',
  fraud: 'bg-red-100 text-red-800',
  disclosure: 'bg-gray-100 text-gray-800',
  presentation: 'bg-slate-100 text-slate-800',
}

function RiskBadge({ level }: { level: IssueRiskLevel }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${RISK_COLORS[level]}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-700'}`}>
      {ISSUE_TYPE_LABELS[type] ?? type}
    </span>
  )
}

function TemplateDetail({ template }: { template: IssueTemplate }) {
  const [tab, setTab] = useState<'overview' | 'procedures' | 'ajes' | 'questions'>('overview')

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b bg-gray-50 flex-shrink-0">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-mono text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">{template.code}</span>
              <RiskBadge level={template.risk_level} />
              <TypeBadge type={template.issue_type} />
            </div>
            <h2 className="text-base font-semibold text-gray-900 leading-snug">{template.name}</h2>
            {template.subcategory && (
              <p className="text-xs text-gray-500 mt-0.5">{template.subcategory.replace(/_/g, ' ')}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex border-b bg-white flex-shrink-0">
        {(['overview', 'procedures', 'ajes', 'questions'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'overview' ? 'Overview' : t === 'procedures' ? 'Procedures' : t === 'ajes' ? 'AJEs' : 'Mgmt Questions'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {tab === 'overview' && (
          <>
            <div>
              <h3 className="font-semibold text-gray-700 mb-1">Description</h3>
              <p className="text-gray-600 leading-relaxed">{template.description}</p>
            </div>
            {template.detection_logic && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-1 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-yellow-500" />Detection Logic
                </h3>
                <p className="text-gray-600 bg-yellow-50 border border-yellow-200 rounded p-2">{template.detection_logic}</p>
              </div>
            )}
            {template.materiality_note && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-1 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-blue-500" />Materiality
                </h3>
                <p className="text-gray-600 bg-blue-50 border border-blue-200 rounded p-2">{template.materiality_note}</p>
              </div>
            )}
            {template.potential_causes.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-1">Potential Causes</h3>
                <ul className="list-disc pl-4 space-y-1 text-gray-600">
                  {template.potential_causes.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {template.affected_statements.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-1 text-xs uppercase tracking-wide">Affected Statements</h3>
                  <div className="flex flex-wrap gap-1">
                    {template.affected_statements.map(s => (
                      <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {template.audit_assertions.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-1 text-xs uppercase tracking-wide">Audit Assertions</h3>
                  <div className="flex flex-wrap gap-1">
                    {template.audit_assertions.map(a => (
                      <span key={a} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {template.references.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-1 text-xs uppercase tracking-wide">References</h3>
                <div className="flex flex-wrap gap-1">
                  {template.references.map(r => (
                    <span key={r} className="px-2 py-0.5 bg-gray-50 border border-gray-200 text-gray-600 rounded text-xs font-mono">{r}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'procedures' && (
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Suggested Audit Procedures</h3>
            {template.suggested_procedures.length > 0 ? (
              <ol className="list-decimal pl-4 space-y-2 text-gray-600">
                {template.suggested_procedures.map((p, i) => <li key={i}>{p}</li>)}
              </ol>
            ) : (
              <p className="text-gray-400 italic">No procedures defined for this template.</p>
            )}
          </div>
        )}

        {tab === 'ajes' && (
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Suggested Adjusting Journal Entries</h3>
            {template.suggested_ajes.length > 0 ? (
              <ul className="space-y-2">
                {template.suggested_ajes.map((a, i) => (
                  <li key={i} className="bg-green-50 border border-green-200 rounded p-2 font-mono text-xs text-green-900">{a}</li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400 italic">No AJEs defined for this template.</p>
            )}
          </div>
        )}

        {tab === 'questions' && (
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Management Questions</h3>
            {template.management_questions.length > 0 ? (
              <ul className="space-y-2">
                {template.management_questions.map((q, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-blue-500 font-semibold mt-0.5 flex-shrink-0">{i + 1}.</span>
                    <span className="text-gray-600">{q}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400 italic">No management questions defined.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function IssueRepositoryPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<IssueTemplate | null>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterRisk, setFilterRisk] = useState<string>('')

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ['repository-categories'],
    queryFn: listRepositoryCategories,
  })

  const { data: templates = [], isLoading: tmplLoading } = useQuery({
    queryKey: ['repository-templates', selectedCategory, search, filterType, filterRisk],
    queryFn: () => listRepository({
      category: selectedCategory ?? undefined,
      issue_type: filterType || undefined,
      risk_level: filterRisk || undefined,
      search: search || undefined,
    }),
  })

  const totalCount = categories.reduce((s, c) => s + c.count, 0)

  return (
    <PageLayout>
      <div className="p-4 pb-2">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Issue Repository' }]} />
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-blue-600" />
              Accounting Intelligence Repository
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{totalCount} issue templates across {categories.length} categories</p>
          </div>
          <WorkspaceCrossLinks current="repository" />
        </div>
      </div>

      <div className="flex h-[calc(100vh-140px)]">
        {/* Left: Category sidebar */}
        <div className="w-56 border-r bg-gray-50 flex flex-col flex-shrink-0">
          <div className="p-3 border-b">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Categories</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <button
              onClick={() => { setSelectedCategory(null); setSelectedTemplate(null) }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-100 transition-colors ${
                !selectedCategory ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
              }`}
            >
              <span>All Issues</span>
              <span className="text-xs text-gray-400">{totalCount}</span>
            </button>
            {categories.map(cat => (
              <button
                key={cat.category}
                onClick={() => { setSelectedCategory(cat.category); setSelectedTemplate(null) }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-100 transition-colors ${
                  selectedCategory === cat.category ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                }`}
              >
                <span className="truncate mr-2">{CATEGORY_LABELS[cat.category] ?? cat.category}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">{cat.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Middle: Issue list */}
        <div className="w-80 border-r flex flex-col flex-shrink-0">
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search issues..."
                value={search}
                onChange={e => { setSearch(e.target.value); setSelectedTemplate(null) }}
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="flex-1 text-xs border rounded px-2 py-1 bg-white"
              >
                <option value="">All Types</option>
                {Object.entries(ISSUE_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <select
                value={filterRisk}
                onChange={e => setFilterRisk(e.target.value)}
                className="flex-1 text-xs border rounded px-2 py-1 bg-white"
              >
                <option value="">All Risk</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="moderate">Moderate</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {tmplLoading ? (
              <div className="p-4 text-center text-sm text-gray-400">Loading...</div>
            ) : templates.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-400">No templates found</div>
            ) : (
              templates.map(tmpl => (
                <button
                  key={tmpl.code}
                  onClick={() => setSelectedTemplate(tmpl)}
                  className={`w-full text-left p-3 border-b hover:bg-gray-50 transition-colors ${
                    selectedTemplate?.code === tmpl.code ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-gray-400">{tmpl.code}</span>
                    <RiskBadge level={tmpl.risk_level} />
                  </div>
                  <p className="text-sm text-gray-800 leading-snug line-clamp-2">{tmpl.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{ISSUE_TYPE_LABELS[tmpl.issue_type] ?? tmpl.issue_type}</p>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t bg-gray-50 text-xs text-gray-400 text-center">
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Right: Detail panel */}
        <div className="flex-1 min-w-0">
          {selectedTemplate ? (
            <TemplateDetail template={selectedTemplate} />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <BookMarked className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select an issue template to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  )
}
