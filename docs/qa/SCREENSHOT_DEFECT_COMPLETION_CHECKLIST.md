# Screenshot Defect Completion Checklist

Last updated: 2026-06-19 (rev 2)

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

**Status: DONE**

- All module-scope `fmt()` wrappers that called raw `formatCurrencyCompact` converted to hook pattern:
  - `OverlaySummaryCard.tsx` — `useFmt()` hook added, `fmt` called inside component
  - `ReconciliationTable.tsx` — same pattern
  - `RollforwardTable.tsx` — same pattern
  - `VarianceBadge.tsx` — same pattern
  - `DraftPreviewPage.tsx` — same pattern
  - `ScenarioManagerPage.tsx` — same pattern
  - `TrialBalanceImportPage.tsx` — stale raw import removed (prior commit)
- MappingWorkbenchPage, FinancialStatementsPage, AdjustmentWorkspacePage: already on hook
- Limitation: PDFImportPage uses direct `formatCurrency` for extraction-detail display (2dp precision for source data, intentional — not a reporting screen)

---

## 4. Financial Statements Balances

**Status: PARTIAL**

- Route: `/financial-statements`
- Multi-column mode (Imported Balance, Posted Adj., Draft Adj., Adjusted Balance) already renders when `computedBsRows` has data
- Added: zero-balance warning banner when accounts are mapped (`mappedCount > 0`) but all balance columns are $0 — directs user to import a trial balance or post JEs
- The `(1)` count is the `account_count` badge — intentional, shows rollup account count
- Drilldown from taxonomy line to account detail is wired
- NOT DONE: drilldown from FSLI to contributing account list (only JE-level drilldown exists)

---

## 5. Import Center Empty / Stale State

**Status: PARTIAL**

- Route: `/import`
- File changed: `frontend/src/pages/ImportCenterPage.tsx`
- Fixed: `ImportReadinessMatrix` now only renders when `registryEntries.length > 0`; explicit empty state shown when entity is selected but has no registry entries ("No imports for this entity yet")
- Fixed: `totalUnmappedAccounts` now scoped to TB batches linked through the current entity's registry entries (was previously summing all TB batches regardless of entity)
- Fixed: removed cross-entity batch fallback that caused stale data from other entities to appear
- Remaining limitation: no period-dimension filter — switching period on same entity doesn't re-filter (needs `importRegistryApi.list(entityId, periodId)` API change)

---

## 6. Data Category Logic

**Status: PARTIAL**

- File changed: `frontend/src/components/ui/ContextBar.tsx`
- ContextBar selected scenario label now shows: `Actuals — ACT2024` (type label — code) instead of bare code — name
- Dropdown items: color-coded type chip (emerald=Actuals, blue=Budget, sky=Forecast, violet=Topside, amber=Pro Forma, purple=Eliminations, rose=Carveout) + code + name
- `ScenarioSelect` already showed `TYPE_LABELS[s.scenario_type] — code` in `<option>` text
- Backend `scenario_type` field already covers: actual, budget, forecast, pro_forma, topside, elimination, carveout
- NOT DONE: "Tax" and "Management" categories not in backend VALID_TYPES; would need migration to add them
- NOT DONE: no ability to filter by category without selecting a specific scenario

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
- File changed: `frontend/src/pages/AdjustmentWorkspacePage.tsx`
- Added: grand total footer row below all JEs showing sum of Total Dr, Total Cr, NI Impact, BS Impact across all `sortedItems` — only shown when `sortedItems.length > 1`
- NI Impact / BS Impact in the footer row are color-coded (emerald = positive, rose = negative, slate = zero)
- Each JE parent row still shows its own per-JE totals; expanded lines show per-account DR/CR
- NOT DONE: exposing a per-account breakdown in the parent row (by design — that data is in expanded lines)

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
| 3 | Global Number Formatting | DONE |
| 4 | Financial Statements Balances | PARTIAL |
| 5 | Import Center Empty/Stale State | PARTIAL |
| 6 | Data Category Logic | PARTIAL |
| 7 | Raw Preview | DONE |
| 8 | Mapping Workbench Language | DONE |
| 9 | Total Row Exclusion | DONE |
| 10 | Parent/Subaccount FSLI Inheritance | NOT DONE |
| 11 | Adjustment Workbench Impact Columns | PARTIAL |
| 12 | Validation Warning Noise | DONE |
| 13 | What's New / Changelog | DONE |
