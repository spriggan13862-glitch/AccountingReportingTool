# PRE-PHASE 10 BASELINE

**Snapshot Date:** 2026-06-16  
**Branch:** `workflow-stabilization-imports-adjustments`  
**Commit:** `43539898fa74bb3a5444bca087c0c57e07d6d3f1`  
**Tag:** `pre-phase10-bridge-rebuild`  
**Baseline Branch:** `phase10-baseline`

---

## 1. Current Navigation Structure

Left rail — 5 collapsible groups defined in `frontend/src/config/nav.ts`:

### Engagement Overview (defaultOpen: true)
| ID | Label | Route |
|----|-------|-------|
| overview | Overview | `/overview` |

### Client Books (defaultOpen: true)
| ID | Label | Route | Badge |
|----|-------|-------|-------|
| import | Import Center | `/import` | `import-unmapped` count |
| mapping | Mapping Center | `/mapping` | — |

### Review & Adjust (defaultOpen: true)
| ID | Label | Route | Badge |
|----|-------|-------|-------|
| statements | Financial Statements | `/statements` | — |
| bridge | Bridge | `/bridge` | — |
| adjustments | Adjustment Workbench | `/adjustments` | `draft-je` count |
| intelligence | Intelligence | `/intelligence` | — |
| consolidation | Consolidation | `/consolidation` | — |

### Deliverables (defaultOpen: false)
| ID | Label | Route |
|----|-------|-------|
| deliverables | Packages | `/deliverables` |
| exports | Exports | `/exports` |

### Administration (defaultOpen: false)
| ID | Label | Route |
|----|-------|-------|
| admin-entities | Entities | `/admin/entities` |
| admin-periods | Periods | `/admin/periods` |
| admin-documents | Documents | `/admin/documents` |
| admin-settings | Settings | `/admin/settings` |

---

## 2. Existing Modules / Page Components

**64 page component files** in `frontend/src/pages/`. Organized by functional domain:

### Core Workspaces
- `OverviewPage.tsx` → `/overview` — engagement summary, exception tiles
- `ImportCenterPage.tsx` → `/import` / `/client-data/imports` — multi-format import hub
- `FinancialStatementsPage.tsx` → `/statements` — IS/BS/CF with entity+period selectors
- `AdjustmentWorkspacePage.tsx` → `/adjustments` (via `AdjustmentsPage.tsx`) — JE register with inline line expansion
- `AdjustmentBridgePage.tsx` → `/bridge` — CPA-style per-AJE pivot workbook
- `IntelligenceDashboardPage.tsx` → `/intelligence` — accounting intelligence engine, rule runner
- `DeliverablesWorkspacePage.tsx` → `/deliverables` — deliverable packages and exports

### Review Workspace
- `ReviewWorkspacePage.tsx` → `/review`
- `TrialBalancesPage.tsx` → `/review/trial-balance`
- `ComparativeFinancialsPage.tsx` → `/review/comparatives`
- `IssueRepositoryPage.tsx` → `/review/issues`

### Adjustments Workspace
- `AdjustmentsPage.tsx` → `/adjustments` (shell page routing to workbench/je list)
- `JournalEntriesPage.tsx` → `/adjustments/journal-entries`
- `JournalEntryCreatePage.tsx` → `/adjustments/journal-entries/new`
- `JournalEntryDetailPage.tsx` → `/adjustments/journal-entries/:id`
- `ConsolidationsPage.tsx` → `/adjustments/consolidations` / `/consolidation`

### Import & Mapping
- `ImportWizardPage.tsx` → `/import/new`
- `ImportReviewPage.tsx` → `/import/:id`
- `MappingWorkbenchPage.tsx` → `/import/:id/mapping` — column-to-field mapping UI
- `TrialBalanceImportPage.tsx` → `/client-data/imports/trial-balance`
- `GeneralLedgerImportPage.tsx` → `/client-data/imports/general-ledger`
- `JournalEntryImportPage.tsx` → `/client-data/imports/journal-entries`
- `PDFImportPage.tsx` → `/client-data/imports/pdf`
- `COAImportPage.tsx` → `/client-data/imports/coa`
- `TaxonomyAdminPage.tsx` → `/mapping` / `/client-data/taxonomy-mapping`
- `ChartOfAccountsPage.tsx` → `/client-data/chart-of-accounts`

### Deliverables
- `CloseDashboardPage.tsx` → `/deliverables/close-package`
- `CloseChecklistPage.tsx` → `/deliverables/close-package/:id`
- `CloseTaskDetailPage.tsx` → `/deliverables/close-package/tasks/:id`
- `WorkpaperCenterPage.tsx` → `/deliverables/workpapers`
- `WorkpaperDetailPage.tsx` → `/deliverables/workpapers/:id`
- `ReconciliationPage.tsx` → `/deliverables/reconciliations`
- `ReconciliationDetailPage.tsx` → `/deliverables/reconciliations/:id`
- `ReportBuilderPage.tsx` → `/deliverables/report-builder`
- `ReportsPage.tsx` → `/deliverables/reports`
- `ReportDetailPage.tsx` → `/deliverables/reports/:id`

### Admin / Setup
- `SetupPage.tsx` → `/setup` / `/admin/settings` — tabbed settings hub
- `EntitiesPage.tsx` → `/admin/entities`
- `PeriodsPage.tsx` → `/admin/periods`
- `PeriodDetailPage.tsx` → `/admin/periods/:id`
- `DocumentsPage.tsx` → `/admin/documents`
- `AdminPage.tsx` → `/admin` (role-gated)

### Legacy / Redirected
- `DashboardPage.tsx` — redirects to `/overview`
- `FinancialImpactWorkspacePage.tsx` — legacy, redirected
- `VarianceAnalysisPage.tsx` — redirected to `/review`
- `QuarterlyReviewPage.tsx` — redirected to `/intelligence`
- `AdvisoryAnalysisPage.tsx` — redirected to `/adjustments`
- `ScenarioManagerPage.tsx` — redirected to `/setup?tab=scenarios`
- `FinancialDiagnosticsPage.tsx` — redirected to `/intelligence`
- `RuleHarnessPage.tsx` — redirected to `/intelligence`
- `FSBuilderPage.tsx` — redirected to `/setup`
- `ReportingSettingsPage.tsx` — redirected to `/setup/settings`
- `ReportingViewWorkspacePage.tsx` — legacy reporting views
- `DraftPreviewPage.tsx` — legacy draft preview
- `ClientDataPage.tsx` → `/client-data` — landing with sub-navigation

### Auth / Utility
- `LoginPage.tsx`, `UnauthorizedPage.tsx`, `HelpCenterPage.tsx`
- `PlaceholderPage.tsx` — stub for future routes (JE Export, Advisor Report, Audit Support)
- `QuickBooksConnectPage.tsx`, `QuickBooksCallbackPage.tsx`

---

## 3. Existing Workflows

### Import → Map → Post (Trial Balance)
1. User navigates to Import Center (`/import`) or direct TB import (`/client-data/imports/trial-balance`)
2. Uploads CSV/XLSX file → `POST /tb-import/upload` → creates `ImportBatch`
3. Column mapping UI at `MappingWorkbenchPage` (`/import/:id/mapping`) → `PUT /tb-import/:id/mapping`
4. Preview → `POST /preview/calculate` (PreviewRun)
5. Post batch → `POST /tb-import/:id/post` → creates `JournalEntry` rows with `source=tb_import`

### PDF Import
1. Upload PDF → `POST /pdf-import/upload`
2. Extraction preview with extracted accounts table
3. Apply to entity → creates accounts and/or adjusting entries

### COA Import
1. Upload CSV → `POST /coa-import/upload`
2. Review and post → creates `Account` rows

### Journal Entry Lifecycle
1. Create draft → `POST /journal-entries/draft`
2. Edit lines → `PUT /journal-entries/:id`
3. Post → `POST /journal-entries/:id/post` (validates period open, Dr=Cr balance)
4. Reverse → `POST /journal-entries/:id/reverse` (creates mirror entry)
5. Void → marks status `voided`

### Intelligence Run
1. Select entity + period + scenario on IntelligenceDashboardPage
2. Run detection → `POST /accounting-intelligence/run-detection`
3. Issues written to `DetectedIssue` table
4. Issues browsable at `/review/issues`

---

## 4. Existing Reporting Views

### Financial Statements (`/statements` — `FinancialStatementsPage.tsx`)
- Income Statement, Balance Sheet, Cash Flow, SCE tabs
- Entity selector + Period selector (local state, not WorkspaceProvider)
- Data View toggle: As Reported / Adjusted / Pro Forma
- Variance column toggle (vs. prior period)
- Validation panel: A=L+E check, TB balance check, unmapped accounts
- **API:** `GET /financial-statements/{type}?entity_id=&period_end=&data_view=`

### CPA Bridge (`/bridge` — `AdjustmentBridgePage.tsx`) — Phase 10 rebuild
- Per-AJE column pivot: Account # | Account Name | As Reported | AJE-001 | AJE-002 | … | Total AJEs | Adjusted
- Entity + Period selectors; data auto-loads (no Compute button)
- Accounts ordered by account number ascending
- Green prefix (+) for positive AJE amounts, parentheses for negative
- Grand total footer row
- **API:** `GET /adjustment-bridge/cpa-bridge?entity_id=&period_end=`

### Comparative Financials (`/review/comparatives`)
- Period-over-period comparison using `ComparativeFinancialsPage`
- **API:** `GET /comparative-reports/`

### Trial Balance (`/review/trial-balance`)
- Raw debit/credit balances per account
- **API:** `GET /reporting/trial-balance`

---

## 5. Existing Import Functionality

### Supported Import Types
| Type | Entry Point | Backend Router | Source Tag |
|------|------------|----------------|------------|
| Trial Balance (CSV/XLSX) | `/client-data/imports/trial-balance` | `tb_import.py` | `tb_import` |
| General Ledger | `/client-data/imports/general-ledger` | (via tb_import) | `gl_import` |
| Journal Entries | `/client-data/imports/journal-entries` | `journal_entries.py` | `manual` |
| PDF (bank/vendor stmt) | `/client-data/imports/pdf` | `pdf_import.py` | `pdf_import` |
| Chart of Accounts | `/client-data/imports/coa` | `coa_import.py` | — |
| QuickBooks | `/quickbooks/connect` | `quickbooks.py` | `quickbooks` |

### Import State Machine
`ImportBatch.status`: `pending` → `mapped` → `previewed` → `posted` | `failed`

### Import Center Badges
`badgeKey: 'import-unmapped'` → queries for batches with unmapped accounts; count shown in nav badge.

### Column Mapping
`MappingWorkbenchPage` handles column-to-field mapping for CSV/XLSX imports. Template system via `ImportTemplate` model for reuse.

---

## 6. Existing Intelligence Functionality

**Location:** `IntelligenceDashboardPage.tsx` → `/intelligence`  
**Backend:** `app/api/routers/accounting_intelligence.py`

### Capabilities
- **200 detection rule templates** in `IssueTemplate` table with `detection_logic_json` (Sprint 3.14)
- **Run Detection:** `POST /accounting-intelligence/run-detection` — evaluates all active rules against entity/period, writes `DetectedIssue` rows
- **Issue Repository:** browsable at `/review/issues` via `IssueRepositoryPage`
- **Threshold configuration:** `IssueDetectionThreshold` model for per-rule sensitivity

### Detection Engine
`app/services/accounting_intelligence_service.py` — deterministic rule evaluation against trial balance and JE data. Rules evaluate materiality, ratio tests, account-level anomalies.

### Advisor Scenarios
`AdvisorScenario` + `AdvisorScenarioPackage` — scenario modeling for QoE/SBA (scaffolded, not yet fully wired to UI).

---

## 7. Existing Bridge Functionality

**Page:** `AdjustmentBridgePage.tsx` (Phase 10 rewrite, prior was pivot table)  
**Route:** `/bridge`  
**API module:** `frontend/src/api/adjustmentBridgeApi.ts`

### Pre-Phase-10 state (what Phase 10 replaced)
- Pivot summary table with As Reported / Total AJEs / Adjusted columns
- Required a "Compute" button click
- No per-AJE column breakdown
- Used `GET /adjustment-bridge/rows` endpoint

### Post-Phase-10 state (current baseline)
- CPA-style workbook with each posted AJE as its own column
- Auto-loads on entity+period selection
- Account ordering by number ascending
- Grand Total footer
- Uses `GET /adjustment-bridge/cpa-bridge` endpoint
- `cpaBridgeResult` type: `{ entity_id, period_end, scenario_id, columns: CPABridgeColumn[], rows: CPABridgeRow[], totals }`

### Backend
`app/api/routers/adjustment_bridge.py` — `GET /adjustment-bridge/cpa-bridge`, `GET /adjustment-bridge/rows`, `GET /adjustment-bridge/summary`

---

## 8. Existing Deliverables Functionality

### Deliverable Packages (`/deliverables`)
**Model:** `DeliverablePackage` + `DeliverablePackageItem` + `DeliverableSnapshot`  
**Router:** `deliverable_workspace.py`

- Create and manage deliverable packages
- Attach JE selections and workpapers to packages
- Snapshot capability: `POST /deliverables/:id/snapshot` — locks package with JE list
- Status: `draft` / `locked`

### Close Package (`/deliverables/close-package`)
**Models:** `CloseChecklist` + `CloseTask` + `CloseTaskAttachment` + `CloseTaskComment`

- Checklist-driven close management
- Tasks with assignees, due dates, attachments, comments
- Per-task detail view

### Workpapers (`/deliverables/workpapers`)
**Model:** `Workpaper` + `WorkpaperReference`

- Workpaper repository for the engagement
- Linkable to JEs and reconciliation items

### Reconciliations (`/deliverables/reconciliations`)
**Model:** `Reconciliation` + `ReconciliationLine`

- Account reconciliation tracking
- Line-level detail

### Reports (`/deliverables/reports`)
**Models:** `ReportDefinition` + `ReportColumn` + `ReportLine` + `ReportRun`

- Report Builder at `/deliverables/report-builder`
- Scheduled/on-demand report generation

### Documents (`/admin/documents`)
**Model:** `Document` + `DocumentLink`

- Central document store for the engagement

---

## 9. Existing Data Model

**52 SQLAlchemy model files** across `app/models/`. Key tables:

### Core Accounting
| Model | Table | Notes |
|-------|-------|-------|
| `Organization` | organizations | Multi-tenant root |
| `Entity` | entities | Legal entity; `entity_type`: individual / consolidated |
| `Account` | accounts | COA entry; `normal_balance` (debit/credit); `fs_sign_convention` (±1); `is_postable` |
| `AccountMapping` | account_mappings | Maps Account → FsLineItem; truth for FS aggregation |
| `FsLineItem` | fs_line_items | FS line hierarchy (IS/BS/CF/SCE) |
| `AccountingPeriod` | accounting_periods | `period_status`: open / soft_closed / hard_closed |
| `JournalEntry` | journal_entries | `status`: draft / posted / reversed / voided; `source`: tb_import / pdf_import / opening_balance / manual; `overlay_group`: audit_adjustment / topside / elimination / accrual / pro_forma / tax |
| `JournalEntryLine` | journal_entry_lines | Separate `debit` and `credit` columns; both cannot be nonzero |
| `JournalEntryEvent` | journal_entry_events | Audit trail: created/posted/reversed/voided lifecycle events |
| `Scenario` | scenarios | Budget/Forecast scenarios |
| `AdvisorScenario` | advisor_scenarios | QoE/SBA scenario modeling |

### Import Pipeline
| Model | Table | Notes |
|-------|-------|-------|
| `ImportBatch` | import_batches | Status machine for CSV/XLSX imports |
| `ImportLine` | import_lines | Raw parsed rows |
| `ImportTemplate` | import_templates | Reusable column mapping configs |
| `ImportValidationIssue` | import_validation_issues | Per-row errors |
| `TbImport` | tb_imports | TB-specific import metadata |
| `PDFImportBatch` | pdf_import_batches | PDF extraction runs |
| `PDFImportLine` | pdf_import_lines | Extracted account rows |
| `PDFAccountMapping` | pdf_account_mappings | PDF account → COA mapping |
| `COAImportBatch` | coa_import_batches | Chart of accounts import runs |
| `PreviewRun` | preview_runs | Staging area before post |

### Intelligence
| Model | Table | Notes |
|-------|-------|-------|
| `IssueTemplate` | issue_templates | 200 detection rule templates with `detection_logic_json` |
| `DetectedIssue` | detected_issues | Results of detection runs |
| `IssueDetectionThreshold` | issue_detection_thresholds | Per-rule sensitivity config |

### Deliverables
| Model | Table | Notes |
|-------|-------|-------|
| `DeliverablePackage` | deliverable_packages | Engagement deliverable container |
| `DeliverablePackageItem` | deliverable_package_items | JE/workpaper attachments |
| `DeliverableSnapshot` | deliverable_snapshots | Locked point-in-time package |
| `CloseChecklist` | close_checklists | Period-close checklist |
| `CloseTask` | close_tasks | Individual checklist items |
| `Workpaper` | workpapers | Supporting workpaper documents |
| `Reconciliation` | reconciliations | Account reconciliation |
| `ReportDefinition` | report_definitions | Report template |
| `ReportRun` | report_runs | Executed report output |

### Administration
| Model | Table | Notes |
|-------|-------|-------|
| `User` | users | `role`: admin / staff / viewer |
| `Role` | roles | Role definitions |
| `UserRole` | user_roles | User-role assignments |
| `Document` | documents | Engagement document store |
| `QuickBooksConnection` | quickbooks_connections | OAuth token storage |

### Sign Convention (canonical)
- `normal_balance` (debit | credit) stored on every Account
- `fs_sign_convention` (−1 | 1) controls display sign on financial statements
- JE lines: `debit` and `credit` are separate columns; only one is nonzero per line
- Header accounts (`is_header = TRUE`) are not postable (`is_postable = FALSE`)
- BS accounts: ending balance (cumulative). IS accounts: YTD sum from fiscal year start.

---

## 10. Existing Known Defects / Open Questions

| ID | Area | Description |
|----|------|-------------|
| OQ-1 | Sign Convention | `fs_sign_convention` field exists on Account but usage across all FS rendering paths not fully audited. Some display paths may double-apply or skip the sign flip. |
| OQ-2 | Fiscal Periods | Fiscal year start month not configurable per entity; assumes January. YTD calculations use calendar year. |
| OQ-3 | Trial Balance | Multiple TB import tables (`TbImport` vs `ImportBatch`) create ambiguity in which rows drive the reporting pipeline. `reporting_service.get_trial_balance()` filters by `source` tag. |
| OQ-4 | Budget / Forecast | `Scenario` model exists; budget vs. actuals variance pathway exists in `comparative_reports.py` but is not wired into the FS page's Data View toggle. |
| OQ-5 | Variance Table | No standalone `BudgetLine` or `ForecastLine` table; budget data enters as JEs with `scenario_id`. Variance computed dynamically, but the endpoint contract isn't stabilized. |
| OQ-6 | Reversal Dr/Cr | `reverse_journal_entry()` swap correctness unverified by test. Reversal creates new JE; debit/credit column swap relies on service layer logic not covered by dedicated assertion. |
| OQ-7 | Period Lock | `soft_closed` status does not fully block posting in all code paths. `hard_closed` is enforced; `soft_closed` raises a warning but may not 409 consistently. |
| OQ-8 | WorkspaceProvider | Context bar entity selector is live; period, scenario, and data_view selectors exist in ContextBar.tsx but some pages read local state instead of `useWorkspace()`, causing context bar to be cosmetic on those pages. |

---

## 11. Existing Test Counts

As of commit `43539898`:

| Suite | Count | Files | Status |
|-------|-------|-------|--------|
| Frontend (Vitest) | **716** | 39 test files | All passing |
| Backend (pytest) | **976** | 46 test files | All passing |
| E2E (Playwright) | ~30 scenarios | `frontend/e2e/` | Partial — some specs skipped |

### Frontend Test Files (39)
Located in `frontend/src/test/`:
`tier1_1` through `tier1_10`, `advisory_analysis`, `adjustment_bridge`, `adjustment_workspace`, `coa_import`, `comparative_financials`, `deliverables_workspace`, `excel_preview`, `financial_diagnostics`, `fs_builder`, `import_wizard`, `intelligence_dashboard`, `issue_repository`, `je_create`, `je_detail`, `je_list`, `mapping_workbench`, `overview`, `pdf_import`, `period_detail`, `quarterly_review`, `reconciliation`, `report_builder`, `review_workspace`, `scenario_manager`, `setup_page`, `tb_import`, `workpaper_center`

### Backend Test Files (46)
Located in `tests/`:
One file per service/router; covers journal entry lifecycle, FS computation, import pipeline, intelligence engine, deliverables, reconciliation, consolidation, close management.

---

## 12. Current Commit Hash

```
43539898fa74bb3a5444bca087c0c57e07d6d3f1
```

**Recent commit log (pre-Phase 10):**

| Hash | Message |
|------|---------|
| `4353989` | Fix three browser errors in FinancialStatementsPage |
| `bca3831` | Sprint 4.0 Phase 10: Adjustment Workbench + Bridge UX Refactor |
| `12044d0` | Sprint 4.0 Phase 9A: Intelligence QA and UX fixes |
| `61bef5c` | Sprint 4.0 Phase 9: Wire 200-rule repository into run_detection() — deterministic engine unified |
| `d8ff746` | Sprint 4.0 Phase 9: Accounting intelligence engine foundation |
| `2669d6d` | Sprint 4.0 Phase 2: New navigation model — 5-section intent-driven rail |
| `02726c6` | Fix XLSX preview: preserve blank leading columns and return raw_rows in API |
| `0517f75` | Sprint 3.17B: Fix import preview, reset history, JE account picker, and TB mode UX |
| `9b61d7e` | Sprint 3.17A: Import + Adjustment Workflow Stabilization |

**Tag:** `pre-phase10-bridge-rebuild`  
**Baseline branch:** `phase10-baseline`

---

## Screenshots

Screenshots of the 8 primary pages were not captured at snapshot time (dev server required). Capture from a live instance at the commit tagged `pre-phase10-bridge-rebuild`:

| Page | Route | Notes |
|------|-------|-------|
| Overview | `/overview` | Exception tiles, book→adjusted walk |
| Import Center | `/client-data/imports` | Multi-format hub with unmapped badge |
| Mapping Workbench | `/import/:id/mapping` | Column-to-field mapping grid |
| Financial Statements | `/statements` | IS/BS/CF tabs with Data View toggle |
| CPA Bridge | `/bridge` | Per-AJE column pivot (Phase 10 layout) |
| Adjustment Workbench | `/adjustments` | Inline JE line expansion (Phase 10 layout) |
| Intelligence Dashboard | `/intelligence` | Rule list + detection run panel |
| Deliverables | `/deliverables` | Package manager |
