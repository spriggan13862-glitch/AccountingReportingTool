import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  FileBarChart,
  Search,
  SlidersHorizontal,
  Upload,
  XCircle,
  FlaskConical,
  Zap,
  Download,
  Database,
  Trash2,
} from 'lucide-react'
import { reviewApi } from '@/api/review'
import { journalEntriesApi } from '@/api/journalEntries'
import { scenariosApi } from '@/api/scenarios'
import api from '@/api/client'
import { useWorkspace } from '@/providers/WorkspaceProvider'
import { useOrg } from '@/providers/OrgProvider'
import { useToast } from '@/providers/ToastProvider'
import { LoadingState } from '@/components/ui/LoadingState'

const WORKSPACES = [
  { label: 'Import', description: 'Upload and map trial balances', to: '/client-data/imports', icon: Upload },
  { label: 'Review', description: 'Comparative statements and checks', to: '/review', icon: Search },
  { label: 'Adjustments', description: 'Draft and post journal entries', to: '/adjustments', icon: SlidersHorizontal },
  { label: 'Deliverables', description: 'Packages, workpapers, reports', to: '/deliverables/workspace', icon: FileBarChart },
]

const WHATS_NEW = [
  {
    version: 'Sprint O · Default Taxonomy Foundation',
    date: '2026-06-20',
    items: [
      'New Taxonomy Library at /taxonomy/library — 11 system taxonomies seeded (US GAAP, IFRS, Management, SaaS, Healthcare, Manufacturing, Construction, Real Estate, Financial Services, Nonprofit, SPAC/Public) totaling 1,762 nodes',
      'Multi-taxonomy mapping: any account can map to many taxonomies simultaneously (GAAP + IFRS + Management + Industry)',
      'Taxonomy downloads: export any taxonomy as CSV, Excel, or JSON',
      'Clone system taxonomy: create user-editable copies with preserved lineage (e.g. "US GAAP - Acme Corp")',
      'System taxonomies are immutable — direct edits are rejected; users prompted to clone',
      'Auto-Map Taxonomies in Mapping Workbench: rule engine suggests mappings using keyword + number-range + account-type matching with color-coded confidence chips',
      'Chart of Accounts detail panel: new Multi-Taxonomy Mappings section shows + edits all of an account’s mappings across taxonomies',
    ],
  },
  {
    version: 'Sprint M · Consolidation Model Update',
    date: '2026-06-19',
    items: [
      'Consolidation now uses per-entity FSLI view mappings (Sprint A ViewAccountOverride)',
      'Multi-entity selector: pick any combination of entities for consolidation',
      'Elimination entities automatically netted in consolidated column',
      'Results table: entity | eliminations | consolidated per taxonomy line',
    ],
  },
  {
    version: 'Sprint L · Chart of Accounts Management',
    date: '2026-06-19',
    items: [
      'Account detail panel: click any account to view balance summary, children, and FSLI assignment',
      'Edit account inline: rename, retype, reassign parent, update FSLI',
      'Deactivate account: blocked if non-zero balance; reactivate at any time',
      'Delete safety: blocked if account has posted JE lines or child accounts',
      'Hierarchy tree view: toggle flat list to parent→children nested tree',
    ],
  },
  {
    version: 'Sprint K · Adjustment & Bridge Integration',
    date: '2026-06-19',
    items: [
      'AJE NI and BS impact now computed from actual JE lines using the balance engine — no hardcoded maps',
      'Revenue credit → positive NI impact; Expense debit → negative NI impact',
      'Bridge view: columnar format showing As Reported / AJE-1 / AJE-2 / Total AJEs / Adjusted per FSLI line',
      'New GET /journal-entries/{id}/impact endpoint returns live JE impact computation',
      'Adjustment Workbench: grand total row impact derived from live JE line computation',
    ],
  },
  {
    version: 'Sprint I · Import Review & Mapping Workflow',
    date: '2026-06-19',
    items: [
      'Import review: auto-detect total/header rows with one-click bulk exclude',
      'Batch actions: exclude multiple lines, assign parent account, assign FSLI in bulk',
      'Validation severity: only blocking errors (OUT_OF_BALANCE, MISSING_ACCOUNT, UNMAPPED_REQUIRED, INVALID_AMOUNT) prevent posting; warnings grouped separately',
      'Import table: vertical scroll with sticky column headers',
      'Batch parent account assignment: select lines and assign parent in one step',
      'Bulk FSLI assignment from import review: map multiple accounts to taxonomy line',
    ],
  },
  {
    version: 'Sprint H · Taxonomy Mapping Workbench Rebuild',
    date: '2026-06-19',
    items: [
      'New standalone Taxonomy Mapping Workbench at /taxonomy/mapping',
      'Full table with Excel-style filters on every column: Account #, Name, Type, Status, FSLI',
      'Per-reporting-view: switch between GAAP, Tax, Management views with isolated mappings',
      'Bulk FSLI assignment: select multiple accounts and assign FSLI in one action',
      'Copy from view: copy all mappings from one reporting view to another',
      'Account lock: lock specific accounts to prevent bulk overwrites',
    ],
  },
  {
    version: 'Sprint G · Parent/Subaccount FSLI Inheritance',
    date: '2026-06-19',
    items: [
      'FSLI mapping now supports parent account inheritance: map 1000 Cash → all children inherit automatically',
      'Inheritance chain: explicit override → parent account → grandparent → legacy account field',
      'New "Inherited From" column in Mapping Workbench shows whether mapping is explicit or inherited',
      'Propagate button: assign FSLI to all unmapped children of a parent account',
      'Reporting view isolation preserved: inheritance only within the same entity + view',
    ],
  },
  {
    version: 'Sprint F · Financial Statement Presentation View',
    date: '2026-06-19',
    items: [
      'New Financial Statement Presentation tab: client-ready output with all amounts positive',
      'Income Statement: Revenue, COGS, Gross Profit, Expenses, Operating Income, Net Income',
      'Balance Sheet: Assets, Liabilities, Equity with total verification (Assets = L + E)',
      'Dot leaders and bold subtotals for professional presentation',
      'Print button for direct client delivery',
      'Toggle between Working View (accounting signs) and Financial Statements (presentation)',
    ],
  },
  {
    version: 'Sprint E · Accounting Working View',
    date: '2026-06-19',
    items: [
      'New Accounting Working View on Financial Statements page: accountant/advisor hierarchy',
      'FSLI lines expand to show underlying COA accounts with debit-normal signs',
      'Revenue shows as negative in AWV (credit balance), expenses positive',
      'Accounts expand to show journal entries affecting each account',
      'Create AJE button directly from account line in AWV',
      'Toggle between Accounting View and Financial Statement Presentation',
    ],
  },
  {
    version: 'Sprint D · Accounting Balance Engine',
    date: '2026-06-19',
    items: [
      'New definitive balance engine: single source of truth for all signed balance computations',
      'Accounting Working View: debit-normal signs — assets/expenses positive, revenue shows negative (credit balance in debit-dominant view)',
      'Financial Statement Presentation: revenue/expenses/COGS shown positive, conventional FS format',
      'View toggle on Financial Statements page: switch between Accounting View and FS Presentation',
      'Balance engine applied consistently across Financial Statements, Trial Balance, and Adjustments',
      'Net Income = Revenue − COGS − Expenses (all positive in FSP)',
    ],
  },
  {
    version: 'Sprint C · Account Parsing & Matching Engine',
    date: '2026-06-19',
    items: [
      'New account label parser: handles 1000 Cash, 1000 - Cash, 1000: Cash, 1000.Cash, 1000 · Cash, 1000 — Cash, subaccounts (1000-01)',
      'Account matching engine: detects conflicts (AR number matching Inventory) instead of silent mis-match',
      'Conflict status shown in Mapping Workbench with red warning chip and reason',
      'New Conflicts filter tab in Mapping Workbench for quick review of flagged lines',
      'Parent/subaccount relationship detection during matching',
    ],
  },
  {
    version: 'Sprint B · Import Source Logic & Readiness Matrix',
    date: '2026-06-19',
    items: [
      'Import system now understands COA, TB, GL, and Financial Statement imports as distinct source types with different behaviors',
      'COA import: creates accounts and hierarchy, no balances required',
      'Trial Balance import: creates accounts and period balances, suggests FSLI',
      'GL import: imports transactions, derives period activity, requires opening balances',
      'Financial Statement import: maps presentation-line items to taxonomy, no account-level detail',
      'New Import Readiness Matrix: shows COA/TB/GL/FS availability and readiness for Accounting View, FS Presentation, Bridge, and Drilldown',
    ],
  },
  {
    version: 'Sprint A · Domain Model Correction',
    date: '2026-06-19',
    items: [
      'Account identity (COA) is now separated from financial statement presentation (FSLI/taxonomy)',
      'FSLI mappings are now per-entity and per-reporting-view: same account can map to different taxonomy lines in GAAP vs Tax vs Management',
      'New FSLI Mapping API: entity_id + view_id + account_id → taxonomy_line_id replaces global account field',
      'Mapping Workbench shows active reporting view and saves mappings to that view specifically',
      'Taxonomy lines can now be view-specific (reporting_view_id) or shared across all views',
      'Migration endpoint available to back-populate view-specific mappings from legacy account field',
    ],
  },
  {
    version: 'v20 · Import UX + Global Column Filters + Validation Clarity',
    date: '2026-06-19',
    items: [
      'Import Step 3 preview: table now scrolls both vertically (max 480px) and horizontally with sticky headers — supports 200+ row files',
      'Global column filters: Excel-style filter popover on all AccountingDataGrid columns — sort asc/desc, text contains, blank/non-blank, numeric min/max',
      'Mapping Workbench: replaced "No match — will create" with specific status labels — "Will create new COA account", "Awaiting parent assignment", "Total/header row — exclude"',
      'Mapping Workbench: total/header row auto-detection — blank account rows with large amounts flagged for exclusion',
      'Mapping Workbench: "Exclude — Total/Header Row" row action added alongside existing "Skip Line"',
      'Mapping Workbench: DR, CR, Balance columns now support numeric min/max range filter',
      'Validation warnings: grouped by severity (Errors always expanded, Warnings and Info collapsed by default) — blocking codes clearly marked',
      'Number formatting: removed stale raw formatCurrencyCompact import from TrialBalanceImportPage — all screens use global reporting formatter hook',
    ],
  },
  {
    version: 'v19 · Build Stabilization',
    date: '2026-06-19',
    items: [
      'Build stabilization: fixed TypeScript build blockers after formatter hook and import type refactors',
    ],
  },
  {
    version: 'v18 · Import Mapping Logic + Sign Convention',
    date: '2026-06-19',
    items: [
      'COA matching: account number match now requires compatible account names — 1200 AR no longer auto-matches to 1200 Inventory; conflict flagged as unmapped with CONFLICT note',
      'Import mapping: DR/CR/Balance amounts now use full reporting format ($1,000 not $1K)',
      'Import mapping: FSLI / Reporting Line column is now an editable dropdown — select any taxonomy line and it saves immediately to the account',
      'Import mapping: per-column filter bar added — text filter for source account, status dropdown, FSLI text filter',
      'Import mapping: "Map to Account" column renamed to "COA Match / Override"',
      'New centralized accounting sign convention: getNormalBalance(), getAccountingSignedBalance(), getFinancialStatementAmount() in frontend/src/lib/accounting.ts and app/services/accounting_engine.py',
    ],
  },
  {
    version: 'v17 · Trial Balance Account Identity Fix',
    date: '2026-06-19',
    items: [
      'TB Import: column mapping from wizard step 2 (column letters A/B/C OR header text) is now sent to the backend on upload — source account labels no longer show "—" in Import Review',
      'TB Import: backend now accepts column letters (B, C…) as valid column identifiers alongside header text — user-corrected mappings are honored instead of silently dropped',
      'TB Import: _COMBINED_PATTERN regex updated to support hyphenated subaccount numbers (1000-01 · FHB - MLI Operating → num=1000-01, name=FHB - MLI Operating)',
      'TB Import: Step 3 Verification grid now shows parsed raw_account_number and raw_account_name (from getRawPreview) instead of blank raw spreadsheet rows',
      'TB Import: Step 3 Verification grid adds a Status column (mapped / unmapped) with color coding',
    ],
  },
  {
    version: 'v16 · Import Pipeline Fixes + Taxonomy Table Redesign',
    date: '2026-06-19',
    items: [
      'Import: column mapping from wizard step 2 is now sent to the backend on upload — source account labels no longer blank after column correction',
      'Import: _COMBINED_PATTERN regex fixed so "1000 Cash" (single space, no separator) is correctly split into account number + name',
      'Import: Mapping Workbench now shows "Matched COA" column (resolved account number/name, or "No match — will create") and "Suggested FSLI" column (taxonomy line from matched account)',
      'Import Center: Import Readiness Matrix now shown on the Import Center page (not just the wizard) when an entity is selected',
      'Taxonomy Admin: account mapping section redesigned as a compact filterable table — columns: Account #, Account Name, Type, Status, Current Mapping, Suggested Mapping, Actions',
      'Taxonomy Admin: account type filter chips (All / Asset / Liability / Equity / Revenue / Expense) added to account mapping toolbar',
      'Taxonomy Admin: mapping status dropdown (All / Mapped / Unmapped) replaces checkbox; inline taxonomy select + Save button per row replaces drag-drop cards',
    ],
  },
  {
    version: 'v15 · Import Architecture + JE Detail + Account Label Parser',
    date: '2026-06-18',
    items: [
      'Import: TB-only import now auto-creates COA accounts from imported rows — no pre-existing chart of accounts required',
      'Import: combined account field parser expanded to handle colon (6100: Cash) and middle-dot (6100 · Cash) separators',
      'Import: Import Readiness Matrix shown on step 1 after selecting entity — displays COA, balances, GL detail, taxonomy %, and three readiness gates (Statements / Bridge / Drilldown)',
      'Import: contextual warning banners for mismatched state (TB without COA, COA without TB, GL without opening balance)',
      'Import: new GET /tb-imports/readiness/{entity_id} API endpoint',
      'JE Detail: account number and account name now shown on each line (not raw database ID)',
      'JE Detail: ← Back button added; amounts formatted via global reporting settings (symbol, decimal places, negative format)',
      'JE Detail: Acct # and Account Name column headers; Difference row in totals footer',
      'Adjustment Workbench: expanded JE line rows align under Account #, Account Name, Debit, Credit, NI Impact column headers',
      'Adjustment Workbench: Totals row in expanded block shows summed Debit and Credit',
      'parseAccountLabel utility (frontend): splits "NNNN Name" / "NNNN - Name" / "NNNN: Name" into {account_number, account_name}',
      'Import wizard step 3 preview: scrollable container (overflow-auto) for wide column mapping tables',
    ],
  },
  {
    version: 'v14 · Sprint 4.0 UX Audit',
    date: '2026-06-18',
    items: [
      'Bridge: optional Variance column (toggle on/off) showing difference between As Reported and Adjusted Balance',
      'Bridge: individual AJE columns, Total AJEs column, Adjusted Balance updates with AJE total',
      'Financial Statements: drilldown entries sorted Date ASC then JE# ASC; Running Balance column; ASC/DESC sort toggle',
      'Financial Statements: Cash Flow from_date now uses period start (was same day as to_date — incorrect)',
      'Financial Statements: period start respects fiscal year (was hardcoded Jan 1 for all entities)',
      'Financial Statements: taxonomy rollup no longer double-counts intermediate nodes in multi-level trees',
      'Reporting Views: new view creation clones from an existing view (default GAAP) — copies full taxonomy structure',
      'Chart of Accounts: mapping badges now horizontal; AI-suggested taxonomy shown inline; Mapped/Unmapped filter chips',
      'Adjustment Workbench: Net Impact column per JE line; sortable column headers on all main table columns',
      'Consolidations: Consolidation Groups workflow (save/load named entity sets); Entities tab; Taxonomy Mapping tab',
    ],
  },
  {
    version: 'v13 · CPA Bridge Engine Rebuild (Phase 11)',
    date: '2026-06-17',
    items: [
      'Bridge: sign convention engine — debit-normal and credit-normal accounts shown with correct positive balance (assets, expenses positive; liabilities, equity, revenue positive)',
      'Bridge: As Reported column now reads actual imported GL balances, not hardcoded zeros',
      'Bridge: hierarchical layout — Assets / Liabilities / Equity / Revenue / Expenses section headers with subtotals, collapsible',
      'Bridge: Adjusted and Pro Forma reporting basis selector — toggle between posted-only and posted + draft AJEs',
      'Bridge: click any AJE column header to open a JE summary panel (description, date, status, Total Dr/Cr)',
      'Bridge: click any account row to open an account drilldown panel showing per-AJE impact breakdown',
      'Bridge: account search/filter bar and Export CSV button',
      'Bridge: no longer requires /compute — computes directly from JEs on every page load',
      'Financial Statements: currency formatting (symbol, decimal places, negative format) now driven by Reporting Settings instead of hardcoded 2-decimal locale format',
      'Financial Statements: same reporting basis concept (As Reported / Adjusted / Pro Forma) available via the Official Only and Include Draft Adjustments toggles',
      'Adjustment Workbench: reporting settings-driven formatting already applied in Phase 10A — consistent across Workbench, Bridge, and Financial Statements',
    ],
  },
  {
    version: 'v12 · Adjustment Workbench + Bridge UX Fixes (Phase 10A)',
    date: '2026-06-17',
    items: [
      'Adjustment Workbench: Total Debit and Total Credit now shown as separate columns on every JE summary row',
      'Adjustment Workbench: JE line detail (Acct #, Account Name, Debit, Credit) visible inline — no sidebar required',
      'Adjustment Workbench: approval UI removed; statuses are Draft, Posted, Reversed only',
      'Bridge: each posted AJE now has a sequence number prefix (1 AJE-001, 2 AJE-002, …)',
      'Bridge: accounts sorted by statement order (Assets → Liabilities → Equity → Revenue → Expenses), then account number',
      'Reporting settings (decimal places, currency symbol, negative format) now applied globally via useFormatCurrency hook',
    ],
  },
  {
    version: 'v11 · Intelligence QA + UX Polish (Phase 9A)',
    date: '2026-06-15',
    items: [
      'Intelligence engine: Run Review no longer multiplies findings on repeated runs — shows latest run only',
      'Intelligence engine: 200-rule repository management questions now persisted and visible in finding detail',
      'Intelligence engine: warning banner when running without a comparison period (trend rules not applied)',
      'Intelligence engine: detection path failures now surfaced as warnings instead of silently swallowed',
      'Intelligence engine: materiality floor and EBITDA proxy clearly labeled when applicable',
      'Journal Entry create form now opens with 6 default lines; blank lines ignored on save',
      'Global formatCurrency / formatNumber / formatPercent utilities created (src/lib/format.ts)',
    ],
  },
  {
    version: 'v10 · Workflow Stabilization (Phase 8)',
    date: '2026-06-14',
    items: [
      'React Hooks violation in ContextBar fixed — no more "rendered more hooks" crash when switching screens',
      'Default scenarios (As Reported, Adjusted, Pro Forma) now seeded automatically via Seed Demo Data',
      'Reset All Data now requires typing "RESET" in a confirmation modal',
      'Import wizard: period picker auto-fills as-of date from accounting period end date',
      'Import duplicate detection with "View Existing" / "Import Anyway" options',
      'Single-sheet XLSX now auto-skips the sheet selection step',
    ],
  },
  {
    version: 'v9 · Accounting Intelligence Engine (Phase 9)',
    date: '2026-06-14',
    items: [
      'Deterministic accounting intelligence engine — 200+ rules across 26 categories, no LLM required',
      '200-rule repository (Phase 9 Sprint 3.13) wired into Run Review production endpoint',
      'Three detection paths: 10 hardcoded comparison rules + 200 repository rules + single-period account checks',
      'Intelligence page: findings grouped by severity (Critical / High / Moderate / Low / Informational)',
      'Each finding shows: detection trigger, suggested procedures, suggested AJEs, management questions',
      'Materiality framework (AICPA blended benchmark) and Trend Analysis (14 metrics, 10 concern rules)',
      'Adjustment Analysis tab: classification breakdown by overlay group with materiality flags',
    ],
  },
  {
    version: 'v8 · Deliverables Platform (Phase 7)',
    date: '2026-06-13',
    items: [
      'Deliverables workspace: close packages, workpapers, and report builder',
      'Cash Flow workpaper (Phase 6) — indirect method from posted JEs',
      'Consolidation workspace (Phase 5) — multi-entity aggregation and eliminations',
      'Financial Statement workspace (Phase 4) — drill into accounts from any FS line',
      'Global Reporting Basis and Bridge foundation (Phase 3)',
      '5-section intent-driven navigation (Phase 2): Import · Review · Adjustments · Deliverables · Setup',
    ],
  },
]

function ContextPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  )
}

function JeCountCard({ label, count, color, to }: { label: string; count: number; color: string; to: string }) {
  return (
    <Link to={to} className={`rounded-lg border bg-white px-4 py-3 hover:shadow-sm transition-shadow ${color}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-900">{count}</p>
    </Link>
  )
}

export function OverviewPage() {
  const { activeEntity, setActiveEntity, activePeriod, setActivePeriod, activeScenarioIds, dataView } = useWorkspace()
  const { org } = useOrg()
  const orgId = org?.id ?? 0
  const toast = useToast()
  const queryClient = useQueryClient()
  const [showDevTools, setShowDevTools] = useState(false)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [showResetModal, setShowResetModal] = useState(false)

  const hasContext = !!activeEntity && !!activePeriod

  const { data: reviewData, isLoading: reviewLoading } = useQuery({
    queryKey: ['overview-checks', activeEntity?.id, activePeriod?.end_date, activeScenarioIds, dataView],
    queryFn: () =>
      reviewApi.getStatements({
        entity_id: activeEntity!.id,
        as_of_date: activePeriod!.end_date,
        scenario_ids: activeScenarioIds,
        data_view: dataView,
        include_checks: true,
      }),
    enabled: hasContext,
    staleTime: 60_000,
  })

  const { data: draftJes } = useQuery({
    queryKey: ['je-count-draft', activeEntity?.id],
    queryFn: () => journalEntriesApi.list({ entity_id: activeEntity!.id, status: 'draft', page_size: 1 }),
    enabled: !!activeEntity,
    staleTime: 30_000,
    select: (items) => items.length,
  })

  const { data: postedJes } = useQuery({
    queryKey: ['je-count-posted', activeEntity?.id],
    queryFn: () => journalEntriesApi.list({ entity_id: activeEntity!.id, status: 'posted', page_size: 1 }),
    enabled: !!activeEntity,
    staleTime: 60_000,
    select: (items) => items.length,
  })

  const resetMutation = useMutation({
    mutationFn: () => api.delete(`/dev/reset?org_id=${orgId}`).then((r) => r.data),
    onSuccess: (data: { deleted: Record<string, number> }) => {
      setActiveEntity(null)
      setActivePeriod(null)
      setShowResetModal(false)
      setResetConfirmText('')
      const total = Object.values(data.deleted).reduce((s, n) => s + n, 0)
      toast(`Reset complete — ${total} records deleted.`, 'success')
      // Force a full page reload so all cached query data is cleared and
      // any in-memory import history is gone from every mounted component.
      setTimeout(() => window.location.reload(), 1000)
    },
    onError: (err: Error) => toast(`Reset failed: ${err.message}`, 'error'),
  })

  const seedMutation = useMutation({
    mutationFn: () => api.post(`/dev/seed?org_id=${orgId}`).then((r) => r.data),
    onSuccess: (data: { entity_code: string; periods_created: number; accounts_created: number; scenarios_created: number }) => {
      queryClient.invalidateQueries()
      toast(`Seeded ${data.entity_code} — ${data.periods_created} periods, ${data.accounts_created} accounts, ${data.scenarios_created} scenarios.`, 'success')
    },
    onError: (err: Error) => toast(`Seed failed: ${err.message}`, 'error'),
  })

  const seedScenariosMutation = useMutation({
    mutationFn: () => scenariosApi.ensureDefaults(orgId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scenarios-list'] })
      if (data.length === 0) {
        toast('Default scenarios already exist.', 'success')
      } else {
        toast(`Created ${data.length} default scenario${data.length !== 1 ? 's' : ''}: ${data.map((s) => s.code).join(', ')}.`, 'success')
      }
    },
    onError: (err: Error) => toast(`Scenario seed failed: ${err.message}`, 'error'),
  })

  const clearImportsMutation = useMutation({
    mutationFn: () => api.delete(`/dev/clear-imports?org_id=${orgId}`).then((r) => r.data),
    onSuccess: (data: { total: number }) => {
      queryClient.clear()
      toast(`Import queue cleared — ${data.total} records deleted.`, 'success')
    },
    onError: (err: Error) => toast(`Clear failed: ${err.message}`, 'error'),
  })

  const postAllMutation = useMutation({
    mutationFn: () => {
      if (!activeEntity?.id) throw new Error('Select an entity in the context bar first')
      return api.post(`/dev/post-all-ready?entity_id=${activeEntity.id}`).then((r) => r.data)
    },
    onSuccess: (data: { posted: number[]; errors: Array<{ batch_id: number; error: string }> }) => {
      queryClient.invalidateQueries()
      toast(`Posted ${data.posted.length} batch${data.posted.length !== 1 ? 'es' : ''}${data.errors.length > 0 ? `, ${data.errors.length} errors` : ''}.`, data.errors.length > 0 ? 'error' : 'success')
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  function downloadSampleTB() {
    const rows = [
      'account_number,account_name,debit,credit',
      '1000,Cash and Cash Equivalents,125000.00,',
      '1100,Accounts Receivable,87500.00,',
      '1200,Inventory,43200.00,',
      '1300,Prepaid Expenses,6800.00,',
      '1500,Property Plant & Equipment,350000.00,',
      '1600,Accumulated Depreciation,,42000.00',
      '2000,Accounts Payable,,52000.00',
      '2100,Accrued Liabilities,,18500.00',
      '2200,Short-Term Debt,,30000.00',
      '2500,Long-Term Debt,,200000.00',
      '3000,Common Stock,,100000.00',
      '3100,Retained Earnings,,120000.00',
      '4000,Revenue,,280000.00',
      '4100,Service Revenue,,45000.00',
      '5000,Cost of Goods Sold,98000.00,',
      '6000,Salaries and Wages,72000.00,',
      '6100,Rent Expense,24000.00,',
      '6200,Utilities Expense,8400.00,',
      '6300,Depreciation Expense,14000.00,',
      '6400,Interest Expense,9600.00,',
      '6900,Other Operating Expenses,49000.00,',
    ].join('\n')
    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sample_trial_balance.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const checks = reviewData?.checks ?? []
  const failedChecks = checks.filter((c) => !c.passed)
  const passedChecks = checks.filter((c) => c.passed)

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">Active engagement context and status</p>
        </div>
        <span className="shrink-0 text-[10px] font-mono text-gray-400 bg-gray-100 border border-gray-200 rounded px-2 py-1 mt-1">
          v10 · {import.meta.env.VITE_APP_GIT_HASH?.slice(0, 7) ?? 'dev'}
        </span>
      </div>

      {/* Context cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ContextPill label="Entity" value={activeEntity ? `${activeEntity.code} — ${activeEntity.name}` : 'None selected'} />
        <ContextPill label="Period" value={activePeriod?.period_name ?? 'None selected'} />
        <ContextPill label="Scenarios" value={activeScenarioIds.length > 0 ? `${activeScenarioIds.length} selected` : 'All'} />
        <ContextPill label="Data View" value={{ as_reported: 'As Reported', adjusted: 'Adjusted', pro_forma: 'Pro Forma' }[dataView]} />
      </div>

      {/* JE counts */}
      {activeEntity && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-2">Journal Entries</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <JeCountCard label="Draft" count={draftJes ?? 0} color="border-amber-200" to="/adjustments/journal-entries?status=draft" />
            <JeCountCard label="Posted" count={postedJes ?? 0} color="border-green-200" to="/adjustments/journal-entries?status=posted" />
            <Link
              to="/adjustments/journal-entries/new"
              className="rounded-lg border border-dashed border-blue-300 bg-blue-50 px-4 py-3 flex items-center gap-2 hover:bg-blue-100 transition-colors"
            >
              <BookOpen className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="text-sm font-medium text-blue-700">New Journal Entry</span>
            </Link>
          </div>
        </div>
      )}

      {/* Checks panel */}
      {hasContext && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-2">
            Automated Checks
            {reviewLoading && <span className="ml-2 text-xs text-gray-400 font-normal">Loading…</span>}
          </h2>
          {reviewLoading ? (
            <LoadingState />
          ) : (
            <div className="space-y-2">
              {failedChecks.map((check) => (
                <div key={check.name} className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                  <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-red-800">{check.name}</p>
                    <p className="text-xs text-red-600 mt-0.5">{check.detail}</p>
                  </div>
                </div>
              ))}
              {passedChecks.map((check) => (
                <div key={check.name} className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-green-700">{check.name}</p>
                </div>
              ))}
              {checks.length === 0 && <p className="text-xs text-gray-400 italic">No checks available</p>}
            </div>
          )}
        </div>
      )}

      {!hasContext && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Context not set</p>
            <p className="text-xs text-amber-600 mt-0.5">Select an entity and period in the context bar above to load checks and balances.</p>
          </div>
        </div>
      )}

      {/* Workspace quick links */}
      <div>
        <h2 className="text-sm font-semibold text-gray-600 mb-2">Workspaces</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {WORKSPACES.map(({ label, description, to, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 hover:shadow-sm hover:border-gray-300 transition-all"
            >
              <Icon className="h-5 w-5 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-500">{description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* Developer Tools */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/30 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDevTools((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-violet-50/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-violet-600" />
            <span className="text-xs font-bold text-violet-700">Developer Tools</span>
            <span className="text-[9px] font-semibold uppercase tracking-wide bg-violet-100 text-violet-500 px-1.5 py-0.5 rounded">dev only</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-violet-400 transition-transform ${showDevTools ? 'rotate-180' : ''}`} />
        </button>

        {showDevTools && (
          <div className="border-t border-violet-100 px-4 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

            <div className="rounded-lg border border-violet-200 bg-white p-3 flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold text-gray-800">Seed Demo Data</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Creates "Demo Corp" entity with 12 monthly periods and 21-account chart of accounts.</p>
              </div>
              <button
                type="button"
                disabled={seedMutation.isPending || !orgId}
                onClick={() => seedMutation.mutate()}
                className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                {seedMutation.isPending ? 'Seeding…' : 'Seed Demo Data'}
              </button>
            </div>

            <div className="rounded-lg border border-violet-200 bg-white p-3 flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold text-gray-800">Download Sample Trial Balance</p>
                <p className="text-[11px] text-gray-500 mt-0.5">21-account Format A CSV, balanced at $887,500 Dr = $887,500 Cr. Drop into the TB importer.</p>
              </div>
              <button
                type="button"
                onClick={downloadSampleTB}
                className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </button>
            </div>

            <div className="rounded-lg border border-violet-200 bg-white p-3 flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold text-gray-800">Export Data Snapshot</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Downloads all entities, accounts, periods, batches and JEs as JSON. Take a backup before destructive ops.</p>
              </div>
              <button
                type="button"
                onClick={() => window.open(`/api/v1/dev/snapshot?org_id=${orgId}`, '_blank')}
                className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                <Database className="w-3.5 h-3.5" />
                Export JSON
              </button>
            </div>

            <div className="rounded-lg border border-violet-200 bg-white p-3 flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold text-gray-800">Post All Ready Imports</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Posts every <code className="bg-gray-100 px-0.5 rounded text-[10px]">ready_to_post</code> TB batch for the entity in the context bar.</p>
              </div>
              <button
                type="button"
                disabled={postAllMutation.isPending || !activeEntity}
                onClick={() => postAllMutation.mutate()}
                className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {postAllMutation.isPending ? 'Posting…' : `Post All Ready${activeEntity ? ` (${activeEntity.code})` : ''}`}
              </button>
            </div>

            <div className="rounded-lg border border-violet-200 bg-white p-3 flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold text-gray-800">Seed Default Scenarios</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Creates ACT (As Reported), ADJ (Adjusted), and PF (Pro Forma) scenarios for this org. Safe to run multiple times.</p>
              </div>
              <button
                type="button"
                disabled={seedScenariosMutation.isPending || !orgId}
                onClick={() => seedScenariosMutation.mutate()}
                className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                {seedScenariosMutation.isPending ? 'Creating…' : 'Seed Scenarios'}
              </button>
            </div>

            <div className="rounded-lg border border-orange-200 bg-white p-3 flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold text-orange-700">Clear Import Queue</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Deletes all TB, PDF, and COA import batches for this org. Keeps entities, accounts, periods, and JEs intact.</p>
              </div>
              <button
                type="button"
                disabled={clearImportsMutation.isPending || !orgId}
                onClick={() => clearImportsMutation.mutate()}
                className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {clearImportsMutation.isPending ? 'Clearing…' : 'Clear Import Queue'}
              </button>
            </div>

            <div className="rounded-lg border border-red-200 bg-white p-3 flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold text-red-700">Reset All Data</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Wipes all entities, accounts, periods, import batches and journal entries. <strong>Cannot be undone.</strong></p>
              </div>
              <button
                type="button"
                disabled={resetMutation.isPending || !orgId}
                onClick={() => { setResetConfirmText(''); setShowResetModal(true) }}
                className="mt-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {resetMutation.isPending ? 'Resetting…' : 'Reset All Data'}
              </button>
            </div>

          </div>
        )}
      </div>

      {/* What's New */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setShowWhatsNew((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
        >
          <span className="text-xs font-bold text-gray-700">What's New</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showWhatsNew ? 'rotate-180' : ''}`} />
        </button>
        {showWhatsNew && (
          <div className="border-t border-gray-100 px-4 py-4 space-y-4">
            {WHATS_NEW.map(({ version, date, items }) => (
              <div key={version} className="flex gap-3">
                <div className="shrink-0 text-right w-28">
                  <span className="text-[10px] font-bold text-gray-700">{version}</span>
                  <p className="text-[9px] text-gray-400 mt-0.5">{date}</p>
                </div>
                <div className="border-l border-gray-200 pl-3 flex-1">
                  <ul className="space-y-0.5">
                    {items.map((item, i) => (
                      <li key={i} className="text-[11px] text-gray-600 flex gap-1.5 items-baseline">
                        <span className="text-gray-300 shrink-0">·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reset confirmation modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl border border-red-200">
            <h3 className="text-sm font-bold text-red-700 mb-1">Reset All Data</h3>
            <p className="text-xs text-gray-600 mb-4">
              This will permanently delete all entities, accounts, periods, import batches, and journal entries
              for this org. Export a snapshot first if you need a backup.
            </p>
            <p className="text-xs font-semibold text-gray-700 mb-2">
              Type <span className="font-mono bg-red-50 text-red-700 px-1 rounded">RESET</span> to confirm:
            </p>
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="RESET"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono mb-4 focus:outline-none focus:ring-2 focus:ring-red-400"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && resetConfirmText === 'RESET') resetMutation.mutate()
                if (e.key === 'Escape') setShowResetModal(false)
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetConfirmText !== 'RESET' || resetMutation.isPending}
                onClick={() => resetMutation.mutate()}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resetMutation.isPending ? 'Resetting…' : 'Reset All Data'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
