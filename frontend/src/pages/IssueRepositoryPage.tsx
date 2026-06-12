import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronRight, BookMarked, Loader } from 'lucide-react'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'
import { SeverityBadge } from '@/components/intelligence/SeverityBadge'
import { getIssueLibrary, type IssueLibraryEntry } from '@/api/accountingIntelligence'

const CATEGORY_LABELS: Record<string, string> = {
  accounts_receivable: 'Accounts Receivable',
  revenue_recognition: 'Revenue Recognition',
  inventory: 'Inventory',
  cash: 'Cash',
  payroll: 'Payroll',
  debt: 'Debt',
  working_capital: 'Working Capital',
  gross_margin: 'Gross Margin',
  equity: 'Equity',
  expense_fluctuation: 'Expense Fluctuation',
}

const THRESHOLD_TYPE_LABELS: Record<string, string> = {
  pct_change: '% Change',
  absolute:   'Absolute',
  ratio:      'Ratio',
  pp_change:  'Percentage Point Change',
}

interface IssueDetailPanelProps {
  issue: IssueLibraryEntry
}

function IssueDetailPanel({ issue }: IssueDetailPanelProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4" data-testid="issue-detail">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <SeverityBadge severity={issue.default_severity} size="xs" />
          <span className="text-[10px] font-mono text-slate-400">{issue.issue_code}</span>
        </div>
        <h3 className="text-sm font-semibold text-slate-800">{issue.name}</h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{issue.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 rounded p-3" data-testid="issue-threshold">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Default Threshold</p>
          <p className="text-sm font-semibold text-slate-700">{issue.default_threshold}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {THRESHOLD_TYPE_LABELS[issue.threshold_type] ?? issue.threshold_type}
          </p>
        </div>
        <div className="bg-slate-50 rounded p-3" data-testid="issue-category">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Category</p>
          <p className="text-sm font-semibold text-slate-700">
            {CATEGORY_LABELS[issue.category] ?? issue.category}
          </p>
        </div>
      </div>

      <div data-testid="issue-detection-logic">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Detection Logic</p>
        <div className="bg-amber-50 border border-amber-100 rounded p-3">
          <p className="text-xs text-amber-800">
            Engine compares current period versus comparison period. Triggers when the measured
            change ({THRESHOLD_TYPE_LABELS[issue.threshold_type] ?? issue.threshold_type}) exceeds
            the configured threshold ({issue.default_threshold}).
          </p>
        </div>
      </div>

      <div data-testid="issue-ai-architecture">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">AI Narrative — Future Integration</p>
        <div className="bg-slate-50 border border-slate-100 rounded p-3 space-y-1">
          {['Narrative Prompt', 'Narrative Output', 'AI Explanation', 'Management Questions'].map((field) => (
            <div key={field} className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">{field}</span>
              <span className="text-[10px] px-2 py-0.5 bg-slate-200 text-slate-400 rounded-full">Reserved</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function IssueRepositoryPage() {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<IssueLibraryEntry | null>(null)

  const { data: library, isLoading } = useQuery({
    queryKey: ['issue-library'],
    queryFn: getIssueLibrary,
    staleTime: Infinity,
  })

  const allIssues = library?.issues ?? []

  const categoryGroups = allIssues.reduce<Record<string, IssueLibraryEntry[]>>((acc, issue) => {
    const cat = issue.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(issue)
    return acc
  }, {})

  const categories = Object.keys(categoryGroups).sort((a, b) =>
    (CATEGORY_LABELS[a] ?? a).localeCompare(CATEGORY_LABELS[b] ?? b),
  )

  const filteredCategories = categories.filter((c) =>
    !search || (CATEGORY_LABELS[c] ?? c).toLowerCase().includes(search.toLowerCase()),
  )

  const issuesForCategory = selectedCategory ? (categoryGroups[selectedCategory] ?? []) : []

  return (
    <PageLayout
      title="Issue Repository"
      subtitle="Library of accounting issues, detection logic, and suggested procedures for advisory engagements"
      breadcrumb={
        <Breadcrumb items={[
          { label: 'Accounting Intelligence', href: '/intelligence/quarterly-review' },
          { label: 'Issue Repository' },
        ]} />
      }
      actions={<WorkspaceCrossLinks current="intelligence" />}
    >
      <div className="flex gap-4 min-h-0" data-testid="issue-repository-page">

        {/* Category sidebar */}
        <div className="w-56 flex-shrink-0 space-y-1" data-testid="category-list">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              data-testid="category-search"
              placeholder="Search categories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          {isLoading && (
            <div className="flex justify-center py-4">
              <Loader className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          )}
          {filteredCategories.map((cat) => {
            const count = categoryGroups[cat]?.length ?? 0
            return (
              <button
                key={cat}
                data-testid={`category-${cat}`}
                onClick={() => { setSelectedCategory(cat); setSelectedIssue(null) }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors ${
                  selectedCategory === cat
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{CATEGORY_LABELS[cat] ?? cat}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                    {count}
                  </span>
                  <ChevronRight className="w-3 h-3 opacity-40" />
                </div>
              </button>
            )
          })}
        </div>

        {/* Main area */}
        <div className="flex-1 min-w-0">
          {!selectedCategory ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16" data-testid="no-category-selected">
              <BookMarked className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-sm font-medium text-slate-500">Select a category to browse issues</p>
              <p className="text-xs text-slate-400 mt-1">
                {allIssues.length} issue rules across {categories.length} categories
              </p>
            </div>
          ) : selectedIssue ? (
            <div className="space-y-3">
              <button
                onClick={() => setSelectedIssue(null)}
                className="text-xs text-indigo-600 hover:underline"
              >
                ← Back to {CATEGORY_LABELS[selectedCategory] ?? selectedCategory}
              </button>
              <IssueDetailPanel issue={selectedIssue} />
            </div>
          ) : (
            <div className="space-y-2" data-testid="category-issues">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
                {CATEGORY_LABELS[selectedCategory] ?? selectedCategory} — {issuesForCategory.length} issue{issuesForCategory.length !== 1 ? 's' : ''}
              </p>
              {issuesForCategory.map((issue) => (
                <button
                  key={issue.issue_code}
                  data-testid={`issue-${issue.issue_code}`}
                  onClick={() => setSelectedIssue(issue)}
                  className="w-full text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <SeverityBadge severity={issue.default_severity} size="xs" />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{issue.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{issue.description}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1 group-hover:text-indigo-400 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </PageLayout>
  )
}
