# Schema Audit Report

**Audit Date:** 2026-05-27  
**Schema Reference:** `docs/schema/ACCOUNTING_SCHEMA.md` (canonical source)  
**Auditor:** Schema enforcement pass (Phase 1)

---

## Executive Summary

The codebase implements a solid accounting core with correct double-entry mechanics, period governance, and PDF import pipeline. The primary gaps are missing COA metadata fields that the canonical schema requires for financial statement mapping, hierarchy queries, and CFS section assignment. Several of these fields are now enforced as of migration 013.

---

## Status Table by Entity/Area

| Entity / Area | Status | Gap Count | Notes |
|---|---|---|---|
| **Chart of Accounts — core fields** | ✅ Compliant | 0 | account_number, account_name, account_type, normal_balance, entity_id, parent_account_id all present |
| **Chart of Accounts — hierarchy** | ✅ Fixed (013) | was 3 | account_path, depth_level, sort_order added |
| **Chart of Accounts — FS mapping** | ✅ Fixed (013) | was 5 | fs_statement, fs_section, fs_line_label, fs_line_order, fs_sign_convention added |
| **Chart of Accounts — postability** | ✅ Fixed (013) | was 2 | is_header, is_postable added |
| **Chart of Accounts — CFS** | ✅ Fixed (013) | was 1 | cfs_section added |
| **Chart of Accounts — account_type values** | ✅ Fixed (013) | was 5 | Expanded from 5 to 10 types |
| **Journal Entries — balance enforcement** | ✅ Compliant | 0 | JE_OUT_OF_BALANCE check present in validate_journal_entry() |
| **Journal Entries — line constraints** | ✅ Compliant | 0 | debit/credit non-negative CHECK, NOT both nonzero CHECK |
| **Journal Entries — is_postable enforcement** | ✅ Fixed (Phase 2) | was 1 | _check_accounts_postable() added to service layer |
| **Journal Entry Lines — column names** | ⚠️ Minor deviation | 1 | Schema spec uses debit_amount/credit_amount; code uses debit/credit. Functionally equivalent. |
| **Accounting Periods — fiscal fields** | ⚠️ Design choice | 1 | Spec calls for fiscal_month + fiscal_quarter; code uses fiscal_period (1-N). Documented in ASSUMPTIONS.md. |
| **Trial Balance — formal tables** | ❌ Not implemented | — | No trial_balances / trial_balance_lines tables. TB is computed at query time. |
| **Financial Statement templates** | ❌ Partial | — | Uses ReportDefinition model, not fs_templates/fs_template_lines per spec. |
| **Budget tables** | ❌ Not implemented | — | No budget_versions / budget_lines tables. |
| **Variance tables** | ❌ Not implemented | — | No variance_reports / variance_report_lines tables. |
| **Three-statement validation** | ❌ Not implemented | — | No validate_three_statement_model() function. |
| **Retained Earnings computation** | ⚠️ Partial | 1 | retained_earnings_service.py exists; linkage to IS net income path needs verification. |
| **Sign convention — storage** | ⚠️ Design choice | 1 | fs_sign_convention column now in DB (013); computation from normal_balance at query time still exists. Migration path needed. |

---

## Prioritized Gap List

### Critical — Fixed in This Pass (Migration 013 + Phase 2 Service)

| ID | Gap | Fix Applied |
|----|-----|-------------|
| C-01 | `is_postable` missing from accounts | Added to model + migration 013 |
| C-02 | `is_header` missing from accounts | Added to model + migration 013 |
| C-03 | `is_postable` not enforced at JE service layer | `_check_accounts_postable()` added to `journal_entry_service.py` |
| C-04 | `account_type` CHECK constraint only allowed 5 of 10 canonical types | Expanded in migration 013 via batch_alter |
| C-05 | `fs_sign_convention` missing (schema requires stored INT -1/1) | Added to model + migration 013 |

### High — Fixed in This Pass (Migration 013)

| ID | Gap | Fix Applied |
|----|-----|-------------|
| H-01 | `account_path` (materialized path) missing | Added to model + migration 013 |
| H-02 | `depth_level` missing | Added to model + migration 013 |
| H-03 | `sort_order` missing | Added to model + migration 013 |
| H-04 | `fs_statement` missing (IncomeStatement/BalanceSheet/etc.) | Added to model + migration 013 |
| H-05 | `fs_section` missing ("Current Assets", etc.) | Added to model + migration 013 |
| H-06 | `fs_line_label` missing | Added to model + migration 013 |
| H-07 | `fs_line_order` missing | Added to model + migration 013 |
| H-08 | `cfs_section` missing (Operating/Investing/Financing) | Added to model + migration 013 |

### Medium — Remaining

| ID | Gap | Recommendation |
|----|-----|----------------|
| M-01 | No formal `trial_balances` / `trial_balance_lines` tables | Add tables with beginning_balance, period_debits, period_credits, ending_balance per spec |
| M-02 | `validate_three_statement_model()` not implemented | Implement in `financial_statement_service.py`: IS net income = BS RE delta; BS cash = CFS cash |
| M-03 | FS templates use `ReportDefinition` model, not `fs_templates`/`fs_template_lines` | Either migrate or alias; spec tables are more expressive |
| M-04 | JE column names (`debit`/`credit` vs `debit_amount`/`credit_amount`) | Low-risk rename with migration; or document as intentional deviation |
| M-05 | `account_path` populated logic not implemented | Add trigger/service to populate on create/reparent |
| M-06 | `depth_level` auto-computation not implemented | Compute from parent depth on create/reparent |

### Low — Remaining

| ID | Gap | Recommendation |
|----|-----|----------------|
| L-01 | No `budget_versions` / `budget_lines` tables | Future milestone |
| L-02 | No `variance_reports` / `variance_report_lines` tables | Future milestone |
| L-03 | `fiscal_month` / `fiscal_quarter` as separate columns | Document current `fiscal_period` convention; no change needed |
| L-04 | `fs_sign_convention` computation migration | Populate existing accounts' `fs_sign_convention` from `normal_balance` in a data migration |
| L-05 | `account_path` not populated for existing records | One-time data migration to compute paths from parent tree |

---

## Files Modified (This Pass)

| File | Change |
|------|--------|
| `app/models/account.py` | Added 11 columns; expanded `account_type` CHECK to 10 types; added `ck_accounts_fs_sign` CHECK |
| `app/api/schemas.py` | Added new fields to `AccountCreate`, `AccountUpdate`, `AccountOut` |
| `app/api/routers/accounts.py` | Added new fields to `create_account()` and `update_account()` |
| `app/services/journal_entry_service.py` | Added `_check_accounts_postable()` guard; enforced in `post_journal_entry()` and `create_draft_journal_entry()` |
| `frontend/src/types/index.ts` | Added new fields to `Account` interface |
| `alembic/versions/013_schema_enforcement_coa.py` | New migration: adds all 11 columns, expands CHECK constraints |

---

## Deferred / Out of Scope

- UI exposure of `is_header`, `is_postable`, `cfs_section`, `fs_statement`, `fs_section`, `fs_line_label` — tracked as Phase 3
- `account_path` / `depth_level` auto-population service — tracked as M-05/M-06
- Budget and variance table scaffolding — tracked as L-01/L-02
- `validate_three_statement_model()` implementation — tracked as M-02
