# Sprint M QA Checklist — Consolidation Model Update

## Backend

- [ ] `build_consolidated_statements()` returns `entity_balances`, `consolidated`, `eliminated` keys
- [ ] Single entity: balance maps to correct taxonomy line via `reporting_taxonomy_line_id` fallback
- [ ] `ViewAccountOverride` takes precedence over `Account.reporting_taxonomy_line_id` when view matches
- [ ] Multi-entity: consolidated dict sums balances across all operating entities
- [ ] Elimination entities (`entity_type == 'elimination'`) are excluded from `entity_balances`
- [ ] Elimination entity balances are negated and applied to `consolidated` and `eliminated`
- [ ] `include_eliminations=False` skips elimination entity processing entirely
- [ ] Invalid `period_id` returns empty dicts (no 500 error)
- [ ] `GET /consolidation/statements?entity_ids=1,2&period_id=1&view_id=1` returns 200
- [ ] `entity_ids` param parsed correctly from comma-separated string
- [ ] Only posted JE lines within the period date range are included

## Frontend

- [ ] `/consolidation` route renders `ConsolidationPage`
- [ ] Entity list loads from `entitiesApi.list()`; checkboxes shown per entity
- [ ] Elimination entities labeled `(elim)` in the selector
- [ ] Build button disabled until entity, period, and view are selected
- [ ] Clicking Build button calls `consolidationApi.statements()` with correct params
- [ ] Results table shows one column per selected entity
- [ ] "Eliminations" column present and rendered with amber color styling
- [ ] "Consolidated" column present and rendered with blue color styling
- [ ] Totals row at the bottom sums entity, elimination, and consolidated columns
- [ ] Loading spinner shown while fetching
- [ ] Error message shown when API call fails
- [ ] Deselecting an entity resets the submitted state

## Tests

- [ ] `test_single_entity_consolidation` passes
- [ ] `test_multi_entity_consolidation` passes
- [ ] `test_elimination_entity_negates` passes
- [ ] `test_empty_returns_zeros` passes
- [ ] `consolidation.test.tsx` — entity checkboxes render test passes
- [ ] `consolidation.test.tsx` — build button triggers API call test passes
- [ ] `consolidation.test.tsx` — results table shows entity columns test passes
- [ ] `consolidation.test.tsx` — elimination column amber styling test passes

## What's New

- [ ] Sprint M entry appears at top of WHATS_NEW list in `OverviewPage.tsx`
- [ ] Entry shows correct date (2026-06-19) and 4 bullet points
