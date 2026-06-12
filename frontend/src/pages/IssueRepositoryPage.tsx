import { useState } from 'react'
import { Search, ChevronRight, BookMarked } from 'lucide-react'
import { PageLayout } from '@/components/ui/PageLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { WorkspaceCrossLinks } from '@/components/ui/WorkspaceCrossLinks'

export interface IssueCategory {
  id: string
  label: string
  count: number
}

export const ISSUE_CATEGORIES: IssueCategory[] = [
  { id: 'revenue-recognition', label: 'Revenue Recognition', count: 0 },
  { id: 'accounts-receivable', label: 'Accounts Receivable', count: 0 },
  { id: 'inventory', label: 'Inventory', count: 0 },
  { id: 'fixed-assets', label: 'Fixed Assets', count: 0 },
  { id: 'leases', label: 'Leases', count: 0 },
  { id: 'payroll', label: 'Payroll', count: 0 },
  { id: 'debt', label: 'Debt', count: 0 },
  { id: 'equity', label: 'Equity', count: 0 },
  { id: 'taxes', label: 'Taxes', count: 0 },
  { id: 'related-parties', label: 'Related Parties', count: 0 },
  { id: 'cash-flow', label: 'Cash Flow', count: 0 },
  { id: 'working-capital', label: 'Working Capital', count: 0 },
  { id: 'ebitda-addbacks', label: 'EBITDA Addbacks', count: 0 },
  { id: 'qoe-adjustments', label: 'QoE Adjustments', count: 0 },
  { id: 'sba-adjustments', label: 'SBA Adjustments', count: 0 },
]

interface IssueTemplate {
  id: string
  category_id: string
  name: string
  description: string
  detection_logic: string | null
  suggested_procedures: string | null
  suggested_ajes: string | null
}

export function IssueRepositoryPage() {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedIssue] = useState<IssueTemplate | null>(null)

  const filteredCategories = ISSUE_CATEGORIES.filter((c) =>
    !search || c.label.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <PageLayout
      title="Issue Repository"
      subtitle="Library of accounting issues, detection patterns, and suggested procedures for advisory engagements"
      breadcrumb={
        <Breadcrumb items={[
          { label: 'Accounting Intelligence', href: '/intelligence/quarterly-review' },
          { label: 'Issue Repository' },
        ]} />
      }
      actions={<WorkspaceCrossLinks current="intelligence" />}
    >
      <div className="flex gap-4 min-h-0" data-testid="issue-repository-page">

        {/* Category list */}
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
          {filteredCategories.map((cat) => (
            <button
              key={cat.id}
              data-testid={`category-${cat.id}`}
              onClick={() => setSelectedCategory(cat.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>{cat.label}</span>
              <ChevronRight className="w-3 h-3 opacity-40" />
            </button>
          ))}
        </div>

        {/* Issue detail / placeholder */}
        <div className="flex-1 min-w-0">
          {!selectedCategory ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16" data-testid="no-category-selected">
              <BookMarked className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-sm font-medium text-slate-500">Select a category to browse issues</p>
              <p className="text-xs text-slate-400 mt-1">{ISSUE_CATEGORIES.length} categories · Issue templates coming soon</p>
            </div>
          ) : selectedIssue ? (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4" data-testid="issue-detail">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">{selectedIssue.name}</h3>
                <p className="text-xs text-slate-500 mt-1">{selectedIssue.description}</p>
              </div>
              <div data-testid="issue-detection-logic">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Detection Logic</p>
                <div className="bg-slate-50 rounded p-3 text-xs text-slate-400 italic">
                  {selectedIssue.detection_logic ?? 'Detection logic — Intelligence Engine coming soon'}
                </div>
              </div>
              <div data-testid="issue-suggested-procedures">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Suggested Procedures</p>
                <div className="bg-slate-50 rounded p-3 text-xs text-slate-400 italic">
                  {selectedIssue.suggested_procedures ?? 'Suggested procedures — coming soon'}
                </div>
              </div>
              <div data-testid="issue-suggested-ajes">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Suggested AJEs</p>
                <div className="bg-slate-50 rounded p-3 text-xs text-slate-400 italic">
                  {selectedIssue.suggested_ajes ?? 'Suggested adjusting journal entries — coming soon'}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-dashed border-slate-300 rounded-lg p-6 text-center" data-testid="category-empty">
              <p className="text-sm font-medium text-slate-600">
                {ISSUE_CATEGORIES.find((c) => c.id === selectedCategory)?.label}
              </p>
              <p className="text-xs text-slate-400 mt-1">Issue templates for this category are being built.</p>
              <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full uppercase tracking-wide">
                Intelligence Engine — Coming Soon
              </span>
            </div>
          )}
        </div>

      </div>
    </PageLayout>
  )
}
