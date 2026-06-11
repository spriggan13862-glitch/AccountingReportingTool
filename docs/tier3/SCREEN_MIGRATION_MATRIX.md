# Screen Migration Matrix
**Status:** Awaiting Approval  
**Produced:** 2026-06-11

All 45 screens. Columns: current route → new route, nav group, nav item label, sprint, action required.

---

## Legend

| Action | Meaning |
|--------|---------|
| RENAME | Route path changes; page file stays; redirect added |
| MOVE-NAV | No route change; nav entry added or moved to new group |
| KEEP | No change needed |
| CONSOLIDATE | Page merged into another; route redirects; file deleted |
| ADD-NAV | Page existed but had no nav entry; entry added |

---

## Full Screen Matrix

| # | Page File | Current Route | New Route | Nav Group | Nav Label | Sprint | Action |
|---|-----------|--------------|-----------|-----------|-----------|--------|--------|
| 1 | `DashboardPage` | `/` | `/` | OVERVIEW | Dashboard | 3.1 | KEEP |
| 2 | `LoginPage` | `/login` | `/login` | (public) | — | — | KEEP |
| 3 | `UnauthorizedPage` | `/unauthorized` | `/unauthorized` | (public) | — | — | KEEP |
| 4 | `JournalEntriesPage` | `/journal-entries` | `/journal-entries` | JOURNAL ENTRIES | Journal Entries | 3.1 | MOVE-NAV |
| 5 | `JournalEntryCreatePage` | `/journal-entries/new` | `/journal-entries/new` | (sub-route) | — | — | KEEP |
| 6 | `JournalEntryDetailPage` | `/journal-entries/:id` | `/journal-entries/:id` | (sub-route) | — | — | KEEP |
| 7 | `ImportCenterPage` | `/import` | `/imports` | IMPORTS | Import Center | 3.1, 3.2 | RENAME |
| 8 | `ImportWizardPage` | `/import/new` | `/imports` (hub) | (sub-flow) | — | 3.3 | CONSOLIDATE |
| 9 | `ImportReviewPage` | `/import/:id` | `/imports/:id` | (sub-route) | — | 3.2 | RENAME |
| 10 | `MappingWorkbenchPage` | `/import/:id/mapping` | `/imports/:id/mapping` | (sub-route) | — | 3.2 | RENAME |
| 11 | `TrialBalanceImportPage` | `/imports/trial-balance` | `/imports/trial-balance` | IMPORTS | Trial Balance | 3.1, 3.3 | MOVE-NAV |
| 12 | `GeneralLedgerImportPage` | `/imports/general-ledger` | `/imports/general-ledger` | IMPORTS | General Ledger | 3.1, 3.3 | MOVE-NAV |
| 13 | `JournalEntryImportPage` | `/imports/journal-entries` | `/imports/journal-entries` | IMPORTS | Journal Entries Import | 3.1, 3.3 | MOVE-NAV |
| 14 | `COAImportPage` | `/coa-import` | `/imports/coa` | IMPORTS | Chart of Accounts | 3.1, 3.2 | RENAME + ADD-NAV |
| 15 | `PDFImportPage` | `/pdf-import` | `/imports/pdf` | IMPORTS | PDF Statement | 3.1, 3.2 | RENAME + ADD-NAV |
| 16 | `ChartOfAccountsPage` | `/accounts` | `/accounts` | CHART OF ACCOUNTS | Accounts | 3.1 | KEEP |
| 17 | `TaxonomyAdminPage` | `/taxonomy-admin` | `/taxonomy-admin` | CHART OF ACCOUNTS | Taxonomy | 3.1 | MOVE-NAV |
| 18 | `TrialBalancesPage` | `/trial-balances` | `/financials/trial-balances` | FINANCIALS | Trial Balances | 3.1, 3.2 | RENAME |
| 19 | `FinancialStatementsPage` | `/financial-statements` | `/financials/statements` | FINANCIALS | Financial Statements | 3.1, 3.2 | RENAME |
| 20 | `FSBuilderPage` | `/fs-builder` | `/financials/builder` | FINANCIALS | FS Builder | 3.1, 3.2 | RENAME |
| 21 | `ComparativeFinancialsPage` | `/comparative-financials` | `/financials/comparative` | FINANCIALS | Comparatives | 3.1, 3.2 | RENAME + ADD-NAV |
| 22 | `VarianceAnalysisPage` | `/variance-analysis` | `/financials/variance` | FINANCIALS | Variance Analysis | 3.1, 3.2 | RENAME + ADD-NAV |
| 23 | `AdjustmentBridgePage` | `/adjustment-bridge` | `/financials/adjustment-bridge` | FINANCIALS | Adjustment Bridge | 3.1, 3.2 | RENAME |
| 24 | `DraftPreviewPage` | `/draft-preview` | `/financials/draft-preview` | FINANCIALS | Draft Preview | 3.1, 3.2 | RENAME + ADD-NAV |
| 25 | `CloseDashboardPage` | `/close` | `/close` | CLOSE | Close Dashboard | 3.1 | ADD-NAV |
| 26 | `CloseChecklistPage` | `/close/:id` | `/close/:id` | (sub-route) | — | — | KEEP |
| 27 | `CloseTaskDetailPage` | `/close/tasks/:id` | `/close/tasks/:id` | (sub-route) | — | — | KEEP |
| 28 | `WorkpaperCenterPage` | `/close/workpapers` | `/close/workpapers` | CLOSE | Workpapers | 3.1 | ADD-NAV |
| 29 | `WorkpaperDetailPage` | `/close/workpapers/:id` | `/close/workpapers/:id` | (sub-route) | — | — | KEEP |
| 30 | `ReconciliationPage` | `/reconciliations` | `/reconciliations` | RECONCILIATIONS | Reconciliations | 3.1 | MOVE-NAV |
| 31 | `ReconciliationDetailPage` | `/reconciliations/:id` | `/reconciliations/:id` | (sub-route) | — | — | KEEP |
| 32 | `ReportsPage` | `/reports` | `/reports` | REPORTS | Reports | 3.1 | ADD-NAV |
| 33 | `ReportDetailPage` | `/reports/:id` | `/reports/:id` | (sub-route) | — | — | KEEP |
| 34 | `ReportBuilderPage` | `/report-builder` | `/reports/builder` | REPORTS | Report Builder | 3.1, 3.2 | RENAME + ADD-NAV |
| 35 | `ConsolidationsPage` | `/consolidations` | `/settings/consolidations` | SETTINGS | Consolidations | 3.1, 3.2 | RENAME |
| 36 | `EntitiesPage` | `/entities` | `/settings/entities` | SETTINGS | Entities | 3.1, 3.2 | RENAME |
| 37 | `PeriodsPage` | `/periods` | `/settings/periods` | SETTINGS | Periods | 3.1, 3.2 | RENAME |
| 38 | `PeriodDetailPage` | `/periods/:id` | `/settings/periods/:id` | (sub-route) | — | 3.2 | RENAME |
| 39 | `DocumentsPage` | `/documents` | `/settings/documents` | SETTINGS | Documents | 3.1, 3.2 | RENAME |
| 40 | `ReportingSettingsPage` | `/reporting-settings` | `/settings/reporting` | SETTINGS | Reporting Settings | 3.1, 3.2 | RENAME |
| 41 | `WorkflowPage` | `/workflow` | `/workflow` | (TBD — deferred) | — | Deferred | ADD-NAV (deferred) |
| 42 | `IssuesPage` | `/issues` | `/issues` | (TBD — deferred) | — | Deferred | ADD-NAV (deferred) |
| 43 | `AdminPage` | `/admin` | `/admin` | SETTINGS | Admin | 3.1 | MOVE-NAV |
| 44 | `HelpCenterPage` | `/help` | `/help` | HELP | Help Center | 3.1 | KEEP |
| 45 | `PlaceholderPage` | (various) | — | — | — | 3.1 | REMOVE |

---

## Sprint 3.1 Scope (Nav Only — No Route Changes)

These are the nav entries being **added or changed** in Sprint 3.1. Route paths do not change yet.

| Nav Group | Nav Label | Route (unchanged) | Change |
|-----------|-----------|-------------------|--------|
| OVERVIEW | Dashboard | `/` | New group header |
| JOURNAL ENTRIES | Journal Entries | `/journal-entries` | Moved from primary flat list |
| IMPORTS | Import Center | `/import` | Renamed group header (route unchanged) |
| IMPORTS | Trial Balance | `/imports/trial-balance` | Added to group |
| IMPORTS | General Ledger | `/imports/general-ledger` | Added to group |
| IMPORTS | JE Import | `/imports/journal-entries` | Added to group |
| IMPORTS | Chart of Accounts | `/coa-import` | **Added** (was not in nav) |
| IMPORTS | PDF Statement | `/pdf-import` | **Added** (was not in nav) |
| CHART OF ACCOUNTS | Accounts | `/accounts` | New group header |
| CHART OF ACCOUNTS | Taxonomy | `/taxonomy-admin` | Moved into group |
| FINANCIALS | Trial Balances | `/trial-balances` | Moved into group |
| FINANCIALS | Financial Statements | `/financial-statements` | Moved into group |
| FINANCIALS | FS Builder | `/fs-builder` | Moved into group |
| FINANCIALS | Comparatives | `/comparative-financials` | **Added** (was not in nav) |
| FINANCIALS | Variance Analysis | `/variance-analysis` | **Added** (was not in nav) |
| FINANCIALS | Adjustment Bridge | `/adjustment-bridge` | Moved into group |
| FINANCIALS | Draft Preview | `/draft-preview` | **Added** (was not in nav) |
| CLOSE | Close Dashboard | `/close` | **Added** (was not in nav) |
| CLOSE | Workpapers | `/close/workpapers` | **Added** (was not in nav) |
| RECONCILIATIONS | Reconciliations | `/reconciliations` | Moved from Admin & Setup |
| REPORTS | Reports | `/reports` | **Added** (was not in nav) |
| REPORTS | Report Builder | `/report-builder` | **Added** (was not in nav) |
| SETTINGS | Entities | `/entities` | Moved from Admin & Setup |
| SETTINGS | Periods | `/periods` | Moved from Admin & Setup |
| SETTINGS | Consolidations | `/consolidations` | Moved from Admin & Setup |
| SETTINGS | Documents | `/documents` | Moved from Admin & Setup |
| SETTINGS | Reporting | `/reporting-settings` | Moved from primary flat list |
| SETTINGS | Admin | `/admin` | **Added** (was not in nav) |
| HELP | Help Center | `/help` | Moved to own group |

**Net change:** 10 screens that previously had no nav entry are now reachable. 0 route paths changed in Sprint 3.1.

---

## Deferred Items

| Screen | Reason |
|--------|--------|
| `WorkflowPage` | Workflow/Issues feature is incomplete — needs design review before surfacing in nav |
| `IssuesPage` | Same as above |
| `SetupWizardPage` | Onboarding-only; not surfaced in main nav by design |
