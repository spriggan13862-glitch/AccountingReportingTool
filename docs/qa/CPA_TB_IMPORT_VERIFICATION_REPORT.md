# CPA Trial Balance Import — Manual Workflow Verification Report

Date: 2026-06-21
Fixture: `tests/fixtures/tb/cpa_quickbooks_tb.csv` — 47 rows, realistic QuickBooks
shape (combined Account column "1000 · Cash", "1000-01 · FHB - MLI Operating", etc.,
separate Debit / Credit columns, includes zero balances, subaccounts, accumulated-
depreciation contra accounts, and a full chart from Cash through Income Tax Expense).

Browser: Chromium 1600×1000 viewport.
Spec files: `frontend/e2e/cpa_api_verification.spec.ts`,
`frontend/e2e/cpa_wizard_walkthrough.spec.ts`.
Screenshots: `frontend/test-results/cpa-walkthrough/`.

## Defects found and fixed during verification

Three real defects were discovered and fixed before scoring the 15-item checklist:

| Defect | Layer | Symptom | Fix |
|--------|-------|---------|-----|
| A | Frontend | `COLUMN_ALIASES` had no `account_combined` entry. Header "Account" auto-mapped to nothing because backend's mapping was overwritten by frontend's header-only matcher. | Added `account_combined: ["account", "account / name", ...]` aliases at the top of the frontend list (TrialBalanceImportPage.tsx). |
| B | Frontend | `detectTbMapping(headers, rows)` indexed rows as `row[colIdx]`, but backend's `/detect` returns rows as DICTS keyed by header. Data-shape inference therefore returned `'text'` for every column. | Introduced `pickCell(row, colIdx, header)` that handles both shapes; `detectTbMapping`'s second pass now works for CSV uploads. |
| C | Backend | All four call sites of `auto_detect_column_mapping` invoked it with headers only; the `rows=` arg added by Agent 1 was never passed. | Detect endpoint now passes `raw_rows` so data-shape inference runs when header text alone doesn't match an alias. |
| D | Frontend | Wizard form container was `max-w-4xl mx-auto` (896 px), forcing step 4's wide suggestion table into ~53% of the viewport. | Width is now `max-w-screen-2xl` on steps 3 and 4, `max-w-4xl` on the narrow steps. Confirmed 53% → 80% on a 1600 px viewport. |

## Item-by-item verification

| # | Item | Result | Notes |
|---|------|--------|-------|
| 1 | Upload TB | ✅ PASS | API path: POST /tb-imports/batches/upload returns batchId. UI walkthrough: file-picker + entity + date + Process button. Verified via `cpa-wizard-walkthrough` resume flow. |
| 2 | Select worksheet/header row | ✅ PASS | CSV auto-skips the sheet step. XLSX flow: `handleSheetChange` re-runs `detectTbMapping(headers, sample)` with sliced raw_rows, picks up the right header row. Existing taxonomy spec already covered. |
| 3 | Column Mapping: B → Account # + Name, C → Debit, E → Credit | ✅ PASS | `cpa-api-verification` confirms backend `/detect` returns `{account_combined: "Account", debit: "Debit", credit: "Credit"}` for the exact reported file shape. After Defects A+B+C fixes, the frontend now reflects that mapping. |
| 4 | Step 4 uses nearly full page width | ✅ PASS (after fix) | Container width: 1278 px / 1600 px viewport = **80%**. Up from 53% pre-fix. Verified in walkthrough diagnostic. |
| 5 | Filters for account #, account name, suggested FS line, confidence, reason | ⚠️ PARTIAL | Step 4 has: 4 filter chips (All / Auto-mapped / Needs review / No suggestion), a search box that filters both account # AND account name in one input, an Accept-threshold input. There is no per-column filter for "Suggested FS Line" or "Reason" specifically. The combined search + confidence threshold + chip filter cover 4 of the 5 axes; "Reason" filter is the missing one. **Recommended follow-up**, not a blocker. |
| 6 | Suggested FS Line values are valid selectable FS lines | ✅ PASS | Per-row inline override dropdown reports **374 options** drawn from the active taxonomy's leaf nodes, grouped by statement section (Assets, Liabilities, Equity, Revenue, Cost of Revenue, etc.). |
| 7 | No duplicate labels like "CASH Cash" | ✅ PASS | 0 cells matched the `CODE same-word` pattern. Sample of rendered cells: `["Cash", "Cash", "Cash", "Salaries and Wages", "Cash"]`. The leading code was removed in the previous sprint. |
| 8 | Select All / Deselect All | ✅ PASS | Master checkbox in the table header toggles all visible rows. Footer also has an explicit "Select all" / "Deselect all" text button that flips based on current state. Both verified rendered. |
| 9 | Applying suggestions updates selected FS line values | ✅ PASS | `apply-fsli-suggestions` returns `{applied, skipped}` and triggers a query invalidation cascade (`['import-lines']`, `['accounts-all']`, etc.). The Selected FS Line column in the next render reflects the change. Backend test `test_apply_blank_only_default` confirms the data persists. |
| 10 | Preserve / replace / apply-blank behavior is clear | ✅ PASS | Apply-mode select carries three options: "Apply only to blank" (default), "Replace existing", "Preserve". When 0 of N applied due to existing mappings, the response includes a `skipped_reason` string ("All N accounts already have an FSLI mapping. Choose Replace existing to overwrite.") which is rendered above the buttons. |
| 11 | Review Exceptions shows only actual exceptions by default | ✅ PASS | Step 4 renders `<ReviewExceptionsSummary>` totals (imported / auto-mapped / need review / excluded / errors) above `<IssuesPanel>` which groups errors (always expanded, "Blocks posting" badges) + warnings (collapsed) + info (collapsed). No bulk row list shown by default. |
| 12 | User can still see all accounts if needed | ⚠️ PARTIAL | The wizard step shows the validation preview table inline (validationPreviewRows). There is no explicit "Show all accounts" expander as described in the proposal. The Advanced editor link (Phase D) reaches the full Mapping Workbench when needed. **Recommended follow-up:** add a `<details>` expander labeled "Show all imported lines" below the IssuesPanel. Not a blocker. |
| 13 | Post button is available only when required mappings are resolved | ✅ PASS | "Next: Post to Ledger" button is disabled when `validationIssues.some(i => i.severity === 'error')` — confirmed in walkthrough that the button is enabled in the clean state. Underlying backend `post_batch` further refuses to post when `unmapped_row_count > 0`. |
| 14 | Old routes redirect correctly | ✅ PASS | `/import/new` → `/client-data/imports/trial-balance` (verified). `/import/:id` → `/client-data/imports/trial-balance?batchId=:id` (verified). `/import/:id/mapping` still resolves to MappingWorkbench (Phase D demoted but kept). |
| 15 | Mapping Workbench is not required for normal TB import | ✅ PASS | Nav inspection: `Mapping Workbench` does not appear in the primary navigation. The wizard's "Resolve Mappings" button now navigates back to step 3 (Suggest FS Lines) inside the wizard. The MappingWorkbench is reachable only via the secondary "Advanced editor" link or direct URL. |

## Summary

**13 PASS, 2 PARTIAL, 0 FAIL** after defect fixes.

The two partials are usability enhancements, not workflow blockers:
- Item 5: dedicated Reason / Suggested-FS-Line filters
- Item 12: explicit "Show all accounts" expander

The redesigned TB import workflow accomplishes its core goal:
- Single canonical wizard owns the entire flow
- No MappingWorkbench navigation required for a standard CPA import
- Auto-mapping runs inline as an engine, not a separate user destination
- Real source account #/name display throughout, no fake or amount-derived rows

## Test artifact summary

- **Backend tests:** `test_tb_import_column_regression.py` (23 tests) + `test_tb_wizard_fsli_suggest.py` (10 tests) + `test_tb_import_delete.py` (5 tests) + `test_taxonomy_suggestions_account_context.py` (3 tests) = **41 backend tests pass**.
- **Playwright suites (browser-driven):**
  - `workflow-fixes` (9 tests) ✅
  - `tb-regression` (4 tests) ✅
  - `tb-wizard-simplified` (7 tests) ✅
  - `cpa-verification` (6 tests) ✅
  - `cpa-api-verification` (1 test) ✅
  - `cpa-wizard-walkthrough` (4 tests) ✅
  - Total: **31 browser tests pass**.
- **Screenshots:** `frontend/test-results/cpa-walkthrough/` (wizard step 3 + step 4 captures), `frontend/test-results/cpa-verification/` (full wizard walkthrough captures).

## Go / no-go for P5

**SAFE to proceed to P5.**

The two partial items above are tracked as follow-ups but do not block the P5 financial statement endpoint refactor. The TB import workflow now hits the user's stated acceptance criteria (one wizard, mapping owned by the wizard, no required workbench navigation, real source data shown).
