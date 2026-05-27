# Accounting System — Business Rules & Assumptions

## Sign Conventions

- **Normal balance stored explicitly**: `accounts.normal_balance` stores `debit` or `credit` as an enum, never derived.
- **FS sign convention**: The canonical schema specifies `fs_sign_convention INT(-1|1)` stored on the account. Currently the codebase computes this at query time from `normal_balance`. This is tracked as a Phase 2 enforcement item.
- **Debit/Credit columns**: Journal entry lines use separate `debit` and `credit` columns (non-negative). A transaction may never have both columns nonzero on the same line.
- **IS Net Income flows to BS**: Retained Earnings on the Balance Sheet must equal prior-period RE + YTD net income − dividends declared. It must NOT be pulled directly from the trial balance.

## Period & YTD Rules

- **Balance Sheet accounts**: Ending balance = cumulative since inception (not period-delta).
- **Income Statement accounts**: YTD = sum of all period amounts from fiscal year start through the selected period.
- **Fiscal year support**: Periods have `fiscal_year` and `fiscal_period` (1–12 monthly, 1–4 quarterly) columns. `fiscal_month` and `fiscal_quarter` are NOT separate columns; `fiscal_period` serves both depending on period type.
- **Period close**: Close entries (zeroing IS accounts to Retained Earnings) are posted as journal entries in the first period of the following fiscal year or as a designated "closing" period type.

## Three-Statement Linkages

- **IS → BS**: Net Income from the Income Statement = change in Retained Earnings on the Balance Sheet (adjusted for dividends and other equity transactions).
- **BS → CFS**: Ending cash balance on the Balance Sheet = Ending cash balance on the Cash Flow Statement.
- **CFS Indirect Method**: Net Income is the starting point; non-cash items and working capital changes are added/subtracted.
- **CFS sections**: Operating | Investing | Financing. Each account with CFS activity must have `cfs_section` set.

## Chart of Accounts Rules

- **Account type hierarchy**: parent `account_type` must match all children's `account_type`.
- **Header accounts** (`is_header = TRUE`): cannot receive journal entry line postings.
- **Postable accounts** (`is_postable = TRUE`): only postable accounts accept JE lines.
- **Materialized path** (`account_path`): stored as `"parent_id/child_id/grandchild_id"` to enable subtree queries without recursion.
- **Deleting an account with children**: forbidden — must re-parent or delete children first.

## Import Pipeline Assumptions

- **PDF import**: Uses temp account codes (`HERO-{type}-{section}-{seq}`) until mapped to official COA codes.
- **`name_hash`**: SHA-256 of the normalized account name, used for deduplication across re-imports.
- **`balance_sheet_tied`**: True when Assets = Liabilities + Equity within the import batch. Untied imports may still be applied with force-apply.
- **Import type**: `financial_statements` | `trial_balance` | `general_ledger` — determines which pipeline path runs.
- **Statement scope**: `standalone` | `consolidated` — affects entity assignment logic.

## Variance & Budget

- **Favorable variance**: Revenue actual > comparison = favorable; Expense actual < comparison = favorable.
- **Materiality threshold**: Configurable per report; gaps below threshold are suppressed.
- **Comparison types**: Prior period, prior year same period, budget version.

## Open Questions / Known Deviations

| ID | Area | Question | Status |
|----|------|----------|--------|
| OQ-1 | Sign convention | Store `fs_sign_convention` in DB vs. compute at runtime? | Deferred — tracked Phase 2 |
| OQ-2 | Fiscal periods | Add separate `fiscal_month` / `fiscal_quarter` columns or keep unified `fiscal_period`? | Keep unified, document mapping |
| OQ-3 | TB formal table | Add `trial_balances` / `trial_balance_lines` tables per spec, or keep current computed approach? | Tracked Phase 2 |
| OQ-4 | Budget tables | Add `budget_versions` / `budget_lines` per spec? | Not yet implemented |
| OQ-5 | Variance tables | Add `variance_reports` / `variance_report_lines` per spec? | Not yet implemented |
