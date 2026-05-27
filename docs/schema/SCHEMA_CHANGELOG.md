# Schema Changelog

All schema-level changes — model additions, column additions/removals, migration files, and enforcement logic — are recorded here.

## Applied

| Date | Change | Affected Files | Migration |
|------|--------|---------------|-----------|
| 2026-05-27 | Initial schema audit and Phase 0 bootstrap | `docs/schema/` (new) | — |
| 2026-05-27 | Added `ACCOUNTING_SCHEMA.md`, `ASSUMPTIONS.md`, `AUDIT_REPORT.md`, `CLAUDE.md` | `docs/schema/`, project root | — |
| 2026-05-27 | Added `is_header`, `is_postable` to `accounts` model | `app/models/account.py` | 013 |
| 2026-05-27 | Added `fs_sign_convention`, `cfs_section`, `fs_statement`, `fs_section`, `fs_line_label`, `fs_line_order` to `accounts` | `app/models/account.py` | 013 |
| 2026-05-27 | Added `account_path`, `depth_level`, `sort_order` to `accounts` | `app/models/account.py` | 013 |
| 2026-05-27 | Expanded `account_type` CHECK from 5 → 10 types (added cogs, other_income, other_expense, tax, intercompany) | `app/models/account.py` | 013 |
| 2026-05-27 | Added `ck_accounts_fs_sign` CHECK constraint on `fs_sign_convention` | `app/models/account.py` | 013 |
| 2026-05-27 | Enforced `is_postable` in `post_journal_entry()` and `create_draft_journal_entry()` | `app/services/journal_entry_service.py` | — |
| 2026-05-27 | Updated Pydantic `AccountCreate`, `AccountUpdate`, `AccountOut` with all new COA fields | `app/api/schemas.py` | — |
| 2026-05-27 | Updated accounts router create/update to persist new COA fields | `app/api/routers/accounts.py` | — |
| 2026-05-27 | Updated `Account` TypeScript interface with all new COA fields | `frontend/src/types/index.ts` | — |
| 2026-05-27 | Updated `AccountCreate`/`AccountUpdate` TS API types | `frontend/src/api/accounts.ts` | — |
| 2026-05-27 | Added FS mapping fields, is_header checkbox to CreateAccountModal | `frontend/src/components/ui/CreateAccountModal.tsx` | — |
| 2026-05-27 | Added is_header/is_postable badges + FS fields to COA account detail drawer | `frontend/src/pages/ChartOfAccountsPage.tsx` | — |
| 2026-05-27 | Expanded account_type dropdown to 10 types in COA inline edit | `frontend/src/pages/ChartOfAccountsPage.tsx` | — |
| 2026-05-27 | Extended `TrialBalanceRow` with `beginning_balance`, `period_debit`, `period_credit`, `ending_balance` | `app/services/reporting_service.py` | — |
| 2026-05-27 | Added `from_date` query param to `/reporting/trial-balance` endpoint | `app/api/routers/reporting.py`, `app/api/schemas.py` | — |
| 2026-05-27 | Added Period TB mode (Beg. Balance / Period Debits / Period Credits / End. Balance columns) to TrialBalancesPage | `frontend/src/pages/TrialBalancesPage.tsx` | — |
| 2026-05-27 | Updated `TBRow` TypeScript interface + `reportingApi.trialBalance()` to support `from_date` | `frontend/src/types/index.ts`, `frontend/src/api/reporting.ts` | — |
| 2026-05-27 | Added `_set_path_and_depth()` + `_rebuild_subtree_paths()` — auto-populate `account_path`/`depth_level` on create and reparent | `app/api/routers/accounts.py` | — |
| 2026-05-27 | Added `POST /accounts/backfill-paths` endpoint for existing-data backfill | `app/api/routers/accounts.py` | — |
| 2026-05-27 | Updated ALPHA_UX_TRACKER with schema enforcement section (UX-095 – UX-101, DEF-13 – DEF-16) | `docs/ALPHA_UX_TRACKER.md` | — |
| 2026-05-27 | Added three-statement health widget to FinancialStatementsPage (UX-DEF-15 resolved) | `frontend/src/pages/FinancialStatementsPage.tsx` | — |

## Pending

| Priority | Change | Notes |
|----------|--------|-------|
| Medium | `account_path` / `depth_level` backfill for existing records | Call `POST /accounts/backfill-paths?entity_id=N` per entity |
| ~~Medium~~ | ~~Implement `validate_three_statement_model()`~~ | Resolved — three-statement health widget added to FS page; backend already existed at `GET /financial-statements/validate` |
| Medium | Formal `trial_balances` / `trial_balance_lines` tables | Currently computed at query time |
| Low | `budget_versions` / `budget_lines` tables | Future milestone |
| Low | `variance_reports` / `variance_report_lines` tables | Future milestone |
| Low | `fs_sign_convention` data migration for existing accounts | Compute from `normal_balance` |
