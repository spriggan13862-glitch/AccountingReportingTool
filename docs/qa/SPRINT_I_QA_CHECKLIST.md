# Sprint I — Import Review & Mapping Workflow QA Checklist
Last updated: 2026-06-19

## Acceptance Criteria
- [ ] Blank total line is detected and can be excluded in one click
- [ ] Import table scrolls vertically with sticky column headers
- [ ] Batch exclude: select multiple rows → Exclude → marked as skipped
- [ ] Batch assign parent: select rows → choose parent → parent_account_id set
- [ ] Batch FSLI assign: select rows → choose FSLI → ViewAccountOverride created
- [ ] Only OUT_OF_BALANCE/MISSING_ACCOUNT/UNMAPPED_REQUIRED/INVALID_AMOUNT block posting
- [ ] MISSING_FSLI shown as warning, doesn't block posting
- [ ] Detect Total Rows button highlights and offers bulk exclude
