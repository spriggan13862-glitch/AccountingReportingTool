# End-to-End Accounting Workflow QA
# Sprint N — CPA Working Paper Scenario

Last updated: 2026-06-20

---

## Scenario

**Entity:** Acme Operating LLC  
**Period:** FY2024 (Jan 1 – Dec 31, 2024)  
**Scenario:** ACT2024 (Actuals)  
**View:** GAAP  
**Goal:** Complete audit-ready adjusted financial statements from raw TB import through adjusted FSP export.

---

## Step 1 — Entity and Period Setup

| Check | Expected Result | Status |
|-------|----------------|--------|
| Navigate to `/setup?tab=entities` | Entity list renders | [ ] |
| Create entity "Acme Operating LLC" code `ACME` type `operating` | Entity saved | [ ] |
| Navigate to `/setup?tab=periods` | Period list renders | [ ] |
| Create period "FY2024" start `2024-01-01` end `2024-12-31` | Period saved | [ ] |
| Create scenario "ACT2024" type `actual` | Scenario saved | [ ] |
| Select ACME + FY2024 + ACT2024 in ContextBar | ContextBar shows `ACME — Acme Operating LLC \| FY2024 \| Actuals — ACT2024` | [ ] |

---

## Step 2 — Trial Balance Import

| Check | Expected Result | Status |
|-------|----------------|--------|
| Navigate to `/client-data/imports/trial-balance` | Import wizard renders | [ ] |
| Upload CSV with 15+ accounts (assets, liabilities, equity, revenue, expense) | Step 1 completes with file preview | [ ] |
| Step 2: map columns (Account #, Account Name, Debit, Credit) | All required columns mapped | [ ] |
| Step 3: preview shows all rows with `—` for blank cells | Table scrolls, sticky header visible | [ ] |
| Submit import | Redirected to import review page | [ ] |
| Import review: zero Errors, some Warnings (if any) | Errors count = 0 | [ ] |
| "Post" button enabled | Batch posts successfully | [ ] |

---

## Step 3 — Chart of Accounts Review

| Check | Expected Result | Status |
|-------|----------------|--------|
| Navigate to `/chart-of-accounts` | Accounts from import visible | [ ] |
| Filter by type "asset" | Only asset accounts shown | [ ] |
| Click account row | Detail panel opens with balance summary | [ ] |
| Verify debit-normal accounts (assets, expenses) show positive net balance | Net balance = debit - credit | [ ] |
| Verify credit-normal accounts (revenue, liabilities) show positive net balance | Net balance = credit - debit | [ ] |
| Toggle hierarchy view | Accounts nested under parents | [ ] |
| Edit account name inline | Name updates on save | [ ] |

---

## Step 4 — FSLI Mapping

| Check | Expected Result | Status |
|-------|----------------|--------|
| Navigate to `/import/map/{batch_id}` (mapping workbench) | All accounts listed | [ ] |
| Reporting view selector shows "GAAP" | GAAP view active | [ ] |
| Accounts matched to COA show "Matched existing COA" label | No "Will create" for known accounts | [ ] |
| Assign FSLI taxonomy line to a parent account | Toast: "FSLI propagated to N child accounts" | [ ] |
| Inherited FSLI shows greyed in child rows | Inherited source shown | [ ] |
| Conflict chip (red) absent for clean TB | No conflicts | [ ] |
| Navigate to `/taxonomy/mapping` | Taxonomy workbench shows % mapped | [ ] |
| Account count badge: `N accounts · M mapped (X%)` | Percentage > 80% | [ ] |

---

## Step 5 — Accounting Working View

| Check | Expected Result | Status |
|-------|----------------|--------|
| Navigate to `/financial-statements` | Page loads | [ ] |
| Select "Working View" tab | AccountingWorkingView renders | [ ] |
| Assets section expands to show FSLI taxonomy rows | Each FSLI row shows account count | [ ] |
| Expand FSLI row → account rows | Per-account debit/credit/net | [ ] |
| Revenue section: amounts shown negative (AWV convention) | Revenue row amount < 0 | [ ] |
| Expense section: amounts shown positive (AWV convention) | Expense row amount > 0 | [ ] |
| "Create AJE" button on account row | Navigates to `/adjustments/new?account_id=X` | [ ] |
| ContextBar "View: Adjusted" selected | Statement updates with posted JE amounts | [ ] |

---

## Step 6 — Adjustment Journal Entry

| Check | Expected Result | Status |
|-------|----------------|--------|
| Navigate to `/adjustments` | Adjustment workspace renders | [ ] |
| Create new JE: Dr Prepaid Expense $12,000 / Cr Accrued Liability $12,000 | JE saved as draft | [ ] |
| NI Impact column shows `-$12,000` (expense debited) | Red negative NI shown | [ ] |
| BS Impact column shows `$0` (asset + liability net zero) | Zero BS impact | [ ] |
| Grand total footer sums all JE impacts | Totals row visible at bottom | [ ] |
| Post JE | Status changes to "Posted" | [ ] |
| Impact preview: multi-select 2+ JEs | Combined impact displayed | [ ] |

---

## Step 7 — Accounting Bridge

| Check | Expected Result | Status |
|-------|----------------|--------|
| Navigate to `/adjustment-bridge` | Bridge page renders | [ ] |
| Select entity + period + scenario | Parameters applied | [ ] |
| Bridge shows columnar format: As Reported \| AJE-1 \| AJE-2 \| Total AJEs \| Adjusted | All columns rendered | [ ] |
| Revenue row: As Reported = raw TB balance, Adjusted = TB + AJEs | Correct arithmetic | [ ] |
| Export CSV button | Downloads bridge CSV | [ ] |

---

## Step 8 — Financial Statement Presentation

| Check | Expected Result | Status |
|-------|----------------|--------|
| Navigate to `/financial-statements` | Page loads | [ ] |
| Select "Financial Statements" tab | FinancialStatementPresentationView renders | [ ] |
| All amounts positive (FSP convention) | No negative amounts in revenue rows | [ ] |
| Income Statement: Revenue → COGS → Gross Profit → Expenses → Operating Income → Net Income | Correct hierarchy | [ ] |
| Balance Sheet: Assets = Liabilities + Equity | BS balanced (imbalance warning absent) | [ ] |
| Net Income on IS matches RE delta on BS | IS NI = BS RE change | [ ] |
| Print button renders print stylesheet | Dot leaders visible in print preview | [ ] |
| ContextBar "View: As Reported" → amounts change | View switch works | [ ] |

---

## Step 9 — Consolidation (if multi-entity)

| Check | Expected Result | Status |
|-------|----------------|--------|
| Navigate to `/consolidation` | ConsolidationPage renders | [ ] |
| Select 2 entities + period + GAAP view | Checkboxes select correctly | [ ] |
| "Build Consolidated Statements" | Results table renders | [ ] |
| Columns: Entity A \| Entity B \| Eliminations \| Consolidated | All columns present | [ ] |
| Elimination column amber-highlighted | Visual distinction clear | [ ] |

---

## Step 10 — Import Center Readiness Matrix

| Check | Expected Result | Status |
|-------|----------------|--------|
| Navigate to `/client-data/imports` | Import center renders | [ ] |
| Select ACME entity | Readiness matrix shows for ACME only | [ ] |
| After TB import: "Trial Balance" row = Ready | Green checkmark | [ ] |
| "Accounting View" row = Ready (TB posted + COA mapped) | Green checkmark | [ ] |
| "Financial Statements" row = Ready (FSLI % > threshold) | Green or partial | [ ] |

---

## Regression Checks

| Area | Check | Status |
|------|-------|--------|
| Number formatting | All currency values use consistent format (no raw decimals) | [ ] |
| Sign conventions | No positive revenue in AWV, no negative revenue in FSP | [ ] |
| Empty states | Selecting entity with no data shows empty state (not broken layout) | [ ] |
| ContextBar | Entity/period/scenario persist across navigation | [ ] |
| Error boundaries | Bad route navigates to 404 without crash | [ ] |
| Scenario type chips | Actuals=emerald, Budget=blue, Forecast=sky in ContextBar dropdown | [ ] |

---

## Known Limitations (Not Blocking QA)

- COA Filter: checklist filters not applied to Adjustment Workbench custom table (Sprint J PARTIAL)
- FSLI % mapping threshold is client-configurable but not yet exposed in UI
- "Tax" and "Management" scenario types not in backend VALID_TYPES (would need migration)
- Cash Flow Statement not auto-generated (requires indirect method computation)
- Drilldown from FSP row to contributing account list not implemented (JE-level only)
