import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, BookOpen, CheckCircle, EyeOff, GitPullRequest,
  ClipboardList, TrendingUp, ChevronDown, ChevronRight, ExternalLink
} from 'lucide-react'
import { PageLayout } from '@/components/ui/PageLayout'

interface Guide {
  icon: React.ElementType
  title: string
  description: string
  route?: string
  steps: string[]
}

const guides: Guide[] = [
  {
    icon: Upload,
    title: 'How to import a Trial Balance',
    description: 'Upload a TB from CSV, Excel, or accounting system export.',
    route: '/import',
    steps: [
      'Navigate to Import Center from the sidebar.',
      'Click "Upload Trial Balance" and select your file (CSV, XLSX, QBO).',
      'Set the Entity ID, As-Of Date, and select a Scenario.',
      'Review parsed rows — unmapped accounts go to Mapping Workbench.',
      'Map all accounts to your Chart of Accounts.',
      'Validate the import (checks balance, completeness, duplicates).',
      'Post the import to create a Journal Entry in the ledger.',
    ],
  },
  {
    icon: BookOpen,
    title: 'How to create a Journal Entry',
    description: 'Post a manual JE with debit/credit lines.',
    route: '/journal-entries/new',
    steps: [
      'Navigate to Journal Entries → New Entry.',
      'Fill in JE number, entry date, entity, and scenario.',
      'Add at least 2 lines — each with an account, debit or credit amount.',
      'The total debits must equal total credits before posting.',
      'Save as Draft to review later, or Post immediately.',
      'Reversals can be created from the JE detail page.',
    ],
  },
  {
    icon: GitPullRequest,
    title: 'How to run reconciliations',
    description: 'Reconcile accounts against supporting documentation.',
    route: '/reconciliations',
    steps: [
      'Open Reconciliations from the sidebar.',
      'Create a reconciliation for an account and period.',
      'Enter the official ledger balance and supporting balance.',
      'Add reconciliation lines to explain any differences.',
      'Attach support documents and link source references.',
      'Submit for preparer review, then reviewer approval.',
    ],
  },
  {
    icon: ClipboardList,
    title: 'How to run a close workflow',
    description: 'Manage the month-end or period-end close process.',
    route: '/close',
    steps: [
      'Open Close Dashboard and create a new checklist.',
      'Select the close type (monthly, quarterly, annual).',
      'Add tasks for each close step — assign preparers and reviewers.',
      'Mark tasks in-progress, then prepared, then submit for review.',
      'Reviewer approves or rejects each task with comments.',
      'Run shadow-close validation to check accounting integrity.',
      'Hard-close the period when all tasks are complete.',
    ],
  },
  {
    icon: EyeOff,
    title: 'How draft overlays work',
    description: 'Model adjustments without affecting posted history.',
    route: '/draft-preview',
    steps: [
      'Draft overlays are Journal Entries with status "draft".',
      'They are grouped by overlay type (audit adjustment, topside, etc.).',
      'Navigate to Draft Preview to see financial statements with overlays applied.',
      'Switch between "Official" (posted only) and "Overlay" views.',
      'Post overlays when approved to make them part of the official record.',
    ],
  },
  {
    icon: TrendingUp,
    title: 'How to run comparative reporting',
    description: 'Compare period-over-period performance with variance analysis.',
    route: '/comparative-financials',
    steps: [
      'Navigate to Comparative Financials.',
      'Enter the entity, current period ID, and comparison period ID.',
      'Select Income Statement or Balance Sheet.',
      'Set a materiality threshold to highlight significant variances.',
      'Material variances (≥ threshold) are flagged in orange.',
      'Use Variance Analysis for shadow-close validation alongside lock controls.',
    ],
  },
]

const FAQ = [
  {
    q: 'Why does my import show unmapped accounts?',
    a: 'The parser found account numbers in your file that do not match any account in your Chart of Accounts. Use the Mapping Workbench to map them manually or create new accounts.',
  },
  {
    q: 'What is the difference between soft-close and hard-close?',
    a: 'Soft-close blocks new journal entry posting (end-of-month lock). Hard-close is a final audit lock — nothing can be posted. Both can be reopened under authorization, and all governance actions are recorded in the audit trail.',
  },
  {
    q: 'What does shadow-close validation check?',
    a: 'It checks: (1) trial balance is balanced (debits = credits), (2) balance sheet balances (Assets = Liabilities + Equity), (3) reconciliations are reviewed and in-tolerance, (4) no stale import batches, (5) all workpapers finalized.',
  },
  {
    q: 'How do I see the official vs overlay financial statements?',
    a: 'Use Draft Preview to compare official (posted-only) financials against overlays. Draft overlays are journal entries with status "draft" — they appear in preview but not in official reports.',
  },
  {
    q: 'What formats does the import support?',
    a: 'CSV, Excel (XLSX), QuickBooks (QBO), NetSuite, and Sage formats. The parser auto-detects account number/name columns and common balance column names. Combined "account number - name" columns are also supported.',
  },
  {
    q: 'How do rollforwards work?',
    a: 'Reconciliations can be rolled forward period-to-period, carrying the prior ending balance as the next period opening balance. The rollforward service supports cash, retained earnings, fixed assets, and debt schedules.',
  },
]

export function HelpCenterPage() {
  const navigate = useNavigate()
  const [expandedGuide, setExpandedGuide] = useState<number | null>(null)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  return (
    <PageLayout title="Help Center" subtitle="Guides, walkthroughs, and FAQs for accounting workflows">
      {/* Getting started banner */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
        <h2 className="text-sm font-semibold text-indigo-900 mb-1">Getting Started</h2>
        <p className="text-sm text-indigo-700 mb-3">
          Recommended first steps for shadow-close testing with real historical data:
        </p>
        <ol className="text-sm text-indigo-800 space-y-1 list-decimal list-inside">
          <li>Create your entity (Setup → Entities)</li>
          <li>Import a historical trial balance (Data Entry → Import Center)</li>
          <li>Map any unmapped accounts to your Chart of Accounts</li>
          <li>Validate the import and post</li>
          <li>Run comparative financials to review period-over-period</li>
          <li>Create a close checklist and run shadow-close validation</li>
        </ol>
      </div>

      {/* Guides */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Workflow Guides</h2>
        <div className="space-y-2">
          {guides.map((guide, i) => {
            const Icon = guide.icon
            const isOpen = expandedGuide === i
            return (
              <div key={i} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedGuide(isOpen ? null : i)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <Icon className="w-4 h-4 text-indigo-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{guide.title}</p>
                    <p className="text-xs text-gray-500">{guide.description}</p>
                  </div>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <ol className="mt-3 space-y-2">
                      {guide.steps.map((step, j) => (
                        <li key={j} className="flex gap-3 text-sm text-gray-700">
                          <span className="flex-shrink-0 w-5 h-5 bg-indigo-100 text-indigo-700 rounded-full text-xs flex items-center justify-center font-semibold">
                            {j + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                    {guide.route && (
                      <button
                        type="button"
                        onClick={() => navigate(guide.route!)}
                        className="mt-4 flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Go to {guide.title.split(' ').slice(-2).join(' ')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* FAQ */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Frequently Asked Questions</h2>
        <div className="space-y-2">
          {FAQ.map((item, i) => {
            const isOpen = expandedFaq === i
            return (
              <div key={i} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedFaq(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <p className="text-sm font-medium text-gray-800">{item.q}</p>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <p className="mt-3 text-sm text-gray-600">{item.a}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </PageLayout>
  )
}
