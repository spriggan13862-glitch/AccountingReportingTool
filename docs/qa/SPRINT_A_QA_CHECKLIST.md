# Sprint A — Domain Model Correction QA Checklist
Last updated: 2026-06-19

## Acceptance Criteria
- [ ] GAAP and Tax can map same account differently without affecting each other
- [ ] Mapping Workbench shows active reporting view selector
- [ ] FSLI save goes to view_account_overrides, not Account.reporting_taxonomy_line_id
- [ ] resolve_fsli() resolution chain works: entity override → org override → legacy fallback
- [ ] Taxonomy lines can have reporting_view_id (view-specific) or null (shared)
- [ ] Migration endpoint migrates existing Account.reporting_taxonomy_line_id data to overrides table

## Domain Model Visual
Account (COA) ≠ FSLI Line ≠ Reporting View
Account → [Mapped In View] → FSLI Line → [Displayed In] → Financial Statement
