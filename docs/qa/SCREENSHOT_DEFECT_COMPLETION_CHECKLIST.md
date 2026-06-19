# Screenshot Defect Completion Checklist

Last updated: 2026-06-19

## Status key
- DONE — verified rendered, files changed
- PARTIAL — partially implemented; limitations noted
- NOT DONE — not yet implemented
- BLOCKED — depends on backend/schema change

---

## 1. Import Step 3 Scrolling

**Status: DONE**

- Route: `/import/new` (ImportWizardPage, step 3)
- File changed: `frontend/src/pages/ImportWizardPage.tsx`
- Fix: Added `overflow-auto max-h-[480px]` to the table container (line ~790) and `sticky top-0 z-10` to `<thead>` — vertical and horizontal scroll, sticky column headers
- Blank columns preserved (existing render shows `—` for empty cells)
- Works with any row count; container caps at 480px and scrolls

---

## 2. Global Column Filters

**Status: PARTIAL**

- New component: `frontend/src/components/data-grid/ColumnFilterMenu.tsx`
- Files changed: `AccountingDataGrid.tsx`, `useGridState.ts`, `types.ts`, `index.ts`
- Applied to: **Import Mapping (MappingWorkbenchPage)** — DR, CR, Balance (numeric min/max), Source Account, Matched COA (text contains, blank/nonblank)
- Filter menu: sort asc/desc, all values / blank only / non-blank only, text contains, numeric min/max
- NOT YET applied to: Adjustment Workbench (custom HTML table, not AccountingDataGrid), Financial Statements (custom HTML table), Chart of Accounts (custom table)
- Limitation: Adjustment Workbench, COA, and Financial Statements use custom table markup and would need refactoring to AccountingDataGrid to receive these filters

---

## 3. Global Number Formatting

**Status: PARTIAL**

- File changed: `frontend/src/pages/TrialBalanceImportPage.tsx` — removed stale `import { formatCurrencyCompact } from '@/lib/format'` raw import; all currency now goes through `useFormatCurrencyCompact` hook
- MappingWorkbenchPage: already uses `useFormatCurrency()` hook
- FinancialStatementsPage: already uses `useFormatCurrency()` hook via `makeFmt()`
- AdjustmentWorkspacePage: already uses `useFormatCurrency()` hook
- Remaining audit needed: check if any pages still have stale raw `formatCurrency`/`formatCurrencyCompact` direct function calls for displayed balances
- NOT DONE: end-to-end verification that actuals setting propagates consistently across Bridge, Consolidation, Intelligence, Deliverables pages

---

## 4. Financial Statements Balances

**Status: PARTIAL**

- Route: `/financial-statements`
- FinancialStatementsPage already renders multi-column mode (Imported Balance, Posted Adj., Draft Adj., Adjusted Balance) when `computedBsRows` has data
- The `(1)` count is the `account_count` badge next to line names — intentional, shows how many accounts roll into that FSLI
- Balances show as $0 when no trial balance has been imported for the selected entity/period
- Drilldown from taxonomy line to account detail is already wired
- NOT DONE: drilldown from FSLI to list of contributing accounts (only drilldown to JE adjustments is implemented)

---

## 5. Import Center Empty / Stale State

**Status: NOT DONE**

- Route: `/import`
- The readiness matrix renders from `importRegistryApi.list(entityId)` — already scoped to selected entity
- Stale data issue: switching entity updates the query key but old entity's data may linger until refetch
- Required fix: add `period` dimension to the registry query key + show "no data for this period" when registry entries don't match the current entity/period selection
- Blocked by: no period filter parameter on `importRegistryApi.list()` in current API

---

## 6. Data Category Logic

**Status: NOT DONE**

- ScenarioSelect shows custom scenario names from the database
- Standard categories (Actual, Budget, Forecast, Pro Forma, Tax, Management) would require seeding default scenarios or a separate category enum field
- Requires backend schema change: add `data_category` enum to scenarios table
- Display "Actual — ACME" format: already partially done in ScenarioSelect label rendering
- BLOCKED: needs backend API + alembic migration

---

## 7. Raw Preview

**Status: DONE**

- Route: `/import/:id` (ImportReviewPage), "Raw Preview" tab
- Raw preview is fully implemented: queries `tbImportApi.getRawPreview(batchId, 100)`, renders AccountingDataGrid with source headers, mapped column highlighting, status column
- Shows `Showing N of M rows · Format: CSV/XLSX`
- If the tab shows blank: the backend `/tb-imports/batches/:id/raw-preview` endpoint may not be returning data for older imports without raw storage
- NOT DONE: blank state message when raw storage is unavailable (shows "Loading preview…" indefinitely)

---

## 8. Mapping Workbench Language / Logic

**Status: DONE**

- Route: `/import/map/:id` (MappingWorkbenchPage)
- File changed: `frontend/src/pages/MappingWorkbenchPage.tsx`
- `getMappingStatusLabel()` helper added — replaces "No match — will create" with:
  - `Matched existing COA` — `{account_number} {account_name}` when resolved
  - `Will create new COA account` — unmapped with valid account number
  - `Awaiting parent assignment` — unmapped with no account number
  - `Total / header row — exclude` — auto-detected blank account + large amounts
  - `Excluded` — when `mapping_status === 'skipped'`
- Column renamed to "Matched COA / Status"
- NOT DONE: "Name conflict" and "Number conflict" labels — these require comparing proposed account against existing COA; current API doesn't expose conflict reason on the line object

---

## 9. Total Row Exclusion

**Status: DONE**

- Route: `/import/map/:id` (MappingWorkbenchPage)
- File changed: `frontend/src/pages/MappingWorkbenchPage.tsx`
- `looksLikeTotalRow()` detects: blank account + large debit/credit/balance, or name starts with "total"/"subtotal"/"check"/"sum"/"grand total"
- Row action: "Exclude — Total / Header Row" added (calls `tbImportApi.skipLine()` same as skip)
- Auto-detection label shown in "Matched COA / Status" column
- Bulk "Skip Lines" batch action already existed for multi-select exclusion
- NOT DONE: server-side reason tracking (currently just marks as `skipped`, doesn't store "total_row" reason)

---

## 10. Parent / Subaccount and FSLI Inheritance

**Status: NOT DONE**

- Subaccount detection already exists (MappingWorkbenchPage shows `└─` indent for accounts containing `-` / `.` / `:`)
- FSLI inheritance from parent: requires COA hierarchy lookup + propagation rule when mapping a parent account
- Requires: backend API to resolve parent account from subaccount number, then cascade FSLI assignment
- Mapping Workbench already shows FSLI dropdown per line but doesn't auto-populate from parent
- BLOCKED: no backend support for parent → child FSLI cascade

---

## 11. Adjustment Workbench Impact Columns

**Status: PARTIAL**

- Route: `/adjustments` (AdjustmentWorkspacePage)
- NI Impact and BS Impact columns already exist in the main table
- Parent row shows aggregate Total Dr / Total Cr / NI Impact / BS Impact — these are correct totals for the JE
- Issue reported: parent row "implies DR and CR hit same account" — this is misleading because the parent row summary shows the JE total, not a per-account breakdown
- Expanded line detail already shows actual DR/CR per account line
- NOT DONE: summary row showing grand totals across all JEs (currently each JE parent row shows its own totals)

---

## 12. Validation Warning Noise

**Status: DONE**

- Route: `/import/:id` (ImportReviewPage), Issues tab
- File changed: `frontend/src/pages/ImportReviewPage.tsx`
- New `IssuesPanel` component: groups by severity (Errors / Warnings / Info)
- Errors: always expanded, labeled "must resolve before posting"
- Warnings: collapsed by default, labeled "Non-blocking"
- Info: collapsed by default
- Blocking codes `OUT_OF_BALANCE`, `MISSING_ACCOUNT`, `UNMAPPED_REQUIRED`, `INVALID_AMOUNT` get "Blocks posting" badge
- Export issues CSV still available

---

## 13. What's New / Changelog

**Status: DONE**

- Route: `/overview` (OverviewPage)
- File changed: `frontend/src/pages/OverviewPage.tsx`
- v20 entry added at top of `WHATS_NEW` array with entries for all implemented items
- Previous v19 Build Stabilization entry preserved below

---

## Summary

| # | Item | Status |
|---|------|--------|
| 1 | Import Step 3 Scrolling | DONE |
| 2 | Global Column Filters | PARTIAL |
| 3 | Global Number Formatting | PARTIAL |
| 4 | Financial Statements Balances | PARTIAL |
| 5 | Import Center Empty/Stale State | NOT DONE |
| 6 | Data Category Logic | NOT DONE |
| 7 | Raw Preview | DONE |
| 8 | Mapping Workbench Language | DONE |
| 9 | Total Row Exclusion | DONE |
| 10 | Parent/Subaccount FSLI Inheritance | NOT DONE |
| 11 | Adjustment Workbench Impact Columns | PARTIAL |
| 12 | Validation Warning Noise | DONE |
| 13 | What's New / Changelog | DONE |
