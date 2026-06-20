# Sprint G — Parent/Subaccount FSLI Inheritance QA Checklist
Last updated: 2026-06-19

## Acceptance Criteria
- [ ] Mapping parent account 1000 → all children (1000-01, 1000-02) inherit that FSLI
- [ ] Child with explicit override keeps own mapping (not overwritten)
- [ ] Propagate API call updates all unmapped children
- [ ] Inherited From column shows parent account number when inherited
- [ ] Explicit badge shown when account has its own mapping
- [ ] Inheritance is view-scoped: GAAP inheritance does not affect Tax view
- [ ] resolve_fsli_with_inheritance() walks parent chain correctly

## Backend Endpoints
- [ ] GET `/fsli-mappings/{entity_id}/{view_id}/with-inheritance` returns list with mapping_source
- [ ] POST `/fsli-mappings/{entity_id}/{view_id}/propagate/{parent_account_id}` returns propagated_count
- [ ] propagate with `overwrite_existing=false` skips accounts with explicit mappings
- [ ] propagate with `overwrite_existing=true` overwrites all children

## Inheritance Chain
- [ ] 'explicit': account has ViewAccountOverride row → uses that
- [ ] 'parent': direct parent (FK or number prefix) has override → inherits
- [ ] 'grandparent': ancestor two or more levels up has override → inherits
- [ ] 'legacy': no overrides anywhere, falls back to Account.reporting_taxonomy_line_id
- [ ] 'none': no mapping at any level

## Frontend
- [ ] Inherited From column visible in Mapping Workbench grid
- [ ] Explicit badge (green) shown for accounts with own mapping
- [ ] ↑ 1000 style annotation shown for inherited accounts
- [ ] Legacy badge shown for accounts using legacy field fallback
- [ ] — Unmapped shown for accounts with no mapping
- [ ] FSLI select shows inherited value greyed out with "inherited" label below
- [ ] Changing FSLI on parent triggers propagate API call automatically
- [ ] Toast shown: "Propagated to N child accounts."
- [ ] "Propagate FSLI to Children" row action visible only when account has children and a mapping

## Tests
- [ ] `python -m pytest tests/test_fsli_inheritance.py -v` — all 8 tests pass
- [ ] `npm run --prefix frontend test -- fsli_inheritance` — all tests pass
