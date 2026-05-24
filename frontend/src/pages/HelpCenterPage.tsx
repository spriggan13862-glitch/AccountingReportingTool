import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, BookOpen, CheckCircle, EyeOff, GitPullRequest,
  ClipboardList, TrendingUp, ChevronDown, ChevronRight, ExternalLink,
  Map, BarChart2, FileSpreadsheet, Download, Building2, ArrowRight, Sparkles, HelpCircle,
} from 'lucide-react'
import { PageLayout } from '@/components/ui/PageLayout'
import { cn } from '@/utils/cn'

interface Guide {
  icon: React.ElementType
  title: string
  description: string
  route?: string
  steps: string[]
}

const guides: Guide[] = [
  {
    icon: Building2,
    title: 'Setting up your first entity',
    description: 'Create entities representing legal entities, cost centers, or reporting units.',
    route: '/entities',
    steps: [
      'Navigate to Entities from the sidebar.',
      'Click "New Entity" and enter a unique code and display name.',
      'Set the entity type (operating, holding, elimination, etc.) and base currency.',
      'Optionally set the fiscal year end month and FY convention (calendar, 52/53-week).',
      'Save the entity — it is now available for imports and journal entries.',
      'Create additional entities for each legal entity or reporting unit you consolidate.',
    ],
  },
  {
    icon: Upload,
    title: 'How to import a trial balance',
    description: 'Upload a TB from CSV, Excel, or accounting system export.',
    route: '/import/new',
    steps: [
      'Navigate to Import Center and click "New Import Wizard".',
      'Drag & drop or browse for your CSV or XLSX file.',
      'Select the entity and as-of date for this trial balance.',
      'For XLSX files, select the correct worksheet containing the trial balance.',
      'Confirm column mapping — the system auto-detects account number, name, debit/credit.',
      'Review the data preview and proceed to upload.',
      'Unmapped accounts automatically go to the Mapping Workbench.',
    ],
  },
  {
    icon: Map,
    title: 'Mapping accounts in the Mapping Workbench',
    description: 'Resolve unmapped GL accounts to your Chart of Accounts.',
    route: '/import',
    steps: [
      'After uploading, click "Mapping Workbench" on the import review page.',
      'Unmapped lines are shown with their raw account number and name.',
      'AI-suggested matches appear as chips — click "Accept" to apply.',
      'For manual mapping, type in the search box to find an account by number or name.',
      'Use "Accept All Suggestions" to bulk-apply all AI matches at once.',
      'Tab between rows for keyboard-driven mapping flow.',
      'Export your completed mapping to CSV as a template for future imports.',
      'Clicking a mapped account lets you manually edit it.',
    ],
  },
  {
    icon: BookOpen,
    title: 'How to create a journal entry',
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
  {
    icon: BarChart2,
    title: 'How to build custom reports',
    description: 'Configure report layouts and section hierarchies.',
    route: '/report-builder',
    steps: [
      'Navigate to Report Builder.',
      'Create a new report template and select the report type.',
      'Add sections and map account ranges to each section.',
      'Configure subtotals, headers, and formatting.',
      'Run the report to preview output with live data.',
      'Save the template for recurring use.',
    ],
  },
  {
    icon: FileSpreadsheet,
    title: 'Working with workpapers',
    description: 'Attach and manage close workpapers and supporting schedules.',
    route: '/close/workpapers',
    steps: [
      'Navigate to Close → Workpapers from the sidebar.',
      'Create a workpaper and link it to a close task or reconciliation.',
      'Attach a file (PDF, XLSX) or describe the supporting schedule.',
      'Set the status (draft, in-review, finalized).',
      'Reviewers can mark workpapers finalized during shadow-close.',
      'Finalized workpapers are required for hard-close validation.',
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
  {
    q: 'How do I apply a mapping template from a prior import?',
    a: 'After uploading, the system auto-detects your accounting system format (QuickBooks, NetSuite, Sage) and pre-fills the column mapping. You can also export a completed mapping from any import and re-upload it to pre-map a new import.',
  },
  {
    q: 'What currencies are supported?',
    a: 'Entities can be assigned any of 30 supported currencies including USD, EUR, GBP, JPY, CAD, AUD, CHF, and major emerging market currencies. All reporting and reconciliation amounts are stored in the entity\'s base currency.',
  },
]

interface Template {
  name: string
  description: string
  filename: string
  generate: () => string
}

const TEMPLATES: Template[] = [
  {
    name: 'Trial Balance Import (CSV)',
    description: 'Standard CSV format with account number, name, debit and credit columns.',
    filename: 'tb_import_template.csv',
    generate: () => [
      'Account Number,Account Name,Debit,Credit',
      '1000,Cash,50000.00,',
      '1100,Accounts Receivable,25000.00,',
      '1200,Prepaid Expenses,5000.00,',
      '1500,Property Plant Equipment,200000.00,',
      '2000,Accounts Payable,,30000.00',
      '2100,Accrued Liabilities,,10000.00',
      '2500,Long-Term Debt,,150000.00',
      '3000,Common Stock,,50000.00',
      '3100,Retained Earnings,,40000.00',
    ].join('\n'),
  },
  {
    name: 'Trial Balance — Net Balance Format (CSV)',
    description: 'Single signed balance column — positive for debit-normal, negative for credit-normal.',
    filename: 'tb_net_balance_template.csv',
    generate: () => [
      'Account Number,Account Name,Balance',
      '1000,Cash,50000.00',
      '1100,Accounts Receivable,25000.00',
      '2000,Accounts Payable,-30000.00',
      '3000,Common Stock,-50000.00',
      '4000,Revenue,-100000.00',
      '5000,Cost of Goods Sold,60000.00',
      '6000,Operating Expenses,45000.05',
    ].join('\n'),
  },
  {
    name: 'Journal Entry Import (CSV)',
    description: 'Batch journal entry import with multiple lines per JE.',
    filename: 'je_import_template.csv',
    generate: () => [
      'JE Number,Entry Date,Description,Account Number,Account Name,Debit,Credit,Memo',
      'JE-001,2024-12-31,Dec Accruals,6100,Salaries Expense,15000.00,,Accrued salary',
      'JE-001,2024-12-31,Dec Accruals,2100,Accrued Liabilities,,15000.00,Payroll payable',
      'JE-002,2024-12-31,Depreciation,6200,Depreciation Expense,5000.00,,Monthly depreciation',
      'JE-002,2024-12-31,Depreciation,1510,Accumulated Depreciation,,5000.00,PP&E depreciation',
    ].join('\n'),
  },
  {
    name: 'Chart of Accounts (CSV)',
    description: 'Import or seed your chart of accounts with this template.',
    filename: 'chart_of_accounts_template.csv',
    generate: () => [
      'Account Number,Account Name,Account Type,Normal Balance,Parent Account Number',
      '1000,Current Assets,asset,debit,',
      '1001,Cash and Cash Equivalents,asset,debit,1000',
      '1100,Accounts Receivable,asset,debit,1000',
      '1200,Inventories,asset,debit,1000',
      '2000,Current Liabilities,liability,credit,',
      '2001,Accounts Payable,liability,credit,2000',
      '2100,Accrued Liabilities,liability,credit,2000',
      '3000,Equity,equity,credit,',
      '3001,Common Stock,equity,credit,3000',
      '3100,Retained Earnings,equity,credit,3000',
      '4000,Revenue,revenue,credit,',
      '5000,Cost of Revenue,expense,debit,',
      '6000,Operating Expenses,expense,debit,',
    ].join('\n'),
  },
]

function downloadCsv(template: Template) {
  const csv = template.generate()
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = template.filename
  a.click()
  URL.revokeObjectURL(url)
}

export function HelpCenterPage() {
  const navigate = useNavigate()
  const [expandedGuide, setExpandedGuide] = useState<number | null>(null)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  return (
    <PageLayout title="Help Center" subtitle="Guides, walkthroughs, templates, and FAQs">
      <div className="space-y-6 max-w-5xl">
        {/* Getting Started Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm transition-all duration-300">
          <h2 className="text-sm font-bold text-slate-850 mb-1.5 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            Getting Started
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Recommended first steps for a new deployment:
          </p>
          <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside bg-white p-3 rounded-lg border border-slate-100 font-medium">
            <li>Create your entity (Entities page)</li>
            <li>Upload a historical trial balance (Import Wizard)</li>
            <li>Map any unmapped accounts to your Chart of Accounts</li>
            <li>Validate and post the import</li>
            <li>Run comparative financials to review period-over-period data</li>
            <li>Create a close checklist and run shadow-close validation</li>
          </ol>
          <button
            type="button"
            onClick={() => navigate('/entities')}
            className="mt-4 flex items-center gap-1.5 text-xs text-indigo-650 font-bold hover:text-indigo-800 transition-colors"
          >
            Start with Entities <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Downloadable Templates */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
            Downloadable Templates
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TEMPLATES.map((tmpl, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3 shadow-sm hover:border-slate-350 transition-all">
                <FileSpreadsheet className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800">{tmpl.name}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{tmpl.description}</p>
                  <button
                    type="button"
                    onClick={() => downloadCsv(tmpl)}
                    className="mt-3 flex items-center gap-1 text-[11px] text-indigo-650 hover:text-indigo-850 font-bold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download {tmpl.filename}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Workflow Guides */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <ClipboardList className="w-4 h-4 text-slate-400" />
            Workflow Guides
          </h2>
          <div className="space-y-3">
            {guides.map((guide, i) => {
              const Icon = guide.icon
              const isOpen = expandedGuide === i
              return (
                <div key={i} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:border-slate-300 transition-all">
                  <button
                    type="button"
                    onClick={() => setExpandedGuide(isOpen ? null : i)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/50 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-indigo-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800">{guide.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{guide.description}</p>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-slate-100 bg-slate-50/30">
                      <ol className="mt-4 space-y-3">
                        {guide.steps.map((step, j) => (
                          <li key={j} className="flex gap-3 text-xs text-slate-650 font-medium leading-relaxed">
                            <span className="flex-shrink-0 w-5 h-5 bg-indigo-50 text-indigo-650 rounded-full text-[10px] flex items-center justify-center font-bold border border-indigo-100">
                              {j + 1}
                            </span>
                            <span className="flex-1 pt-0.5">{step}</span>
                          </li>
                        ))}
                      </ol>
                      {guide.route && (
                        <button
                          type="button"
                          onClick={() => navigate(guide.route!)}
                          className="mt-4 flex items-center gap-1.5 text-xs text-indigo-650 font-bold hover:text-indigo-850 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Open {guide.title.split(' ').pop()}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-slate-400" />
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {FAQ.map((item, i) => {
              const isOpen = expandedFaq === i
              return (
                <div key={i} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:border-slate-305 transition-all">
                  <button
                    type="button"
                    onClick={() => setExpandedFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50/50 transition-colors"
                  >
                    <p className="text-xs font-bold text-slate-800">{item.q}</p>
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 border-t border-slate-100 bg-slate-50/30">
                      <p className="mt-3 text-xs text-slate-600 leading-relaxed font-medium">{item.a}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </PageLayout>
  )
}
