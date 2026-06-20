# Sprint K — Adjustment & Bridge Integration QA Checklist
Last updated: 2026-06-19

## Acceptance Criteria

- [ ] Dr Expense / Cr AR JE shows negative NI impact and correct BS impact
- [ ] NI Impact positive = green, negative = red in Adjustment Workbench
- [ ] Bridge shows: As Reported | AJE-1 | AJE-2 | Total AJEs | Adjusted per FSLI
- [ ] Grand total row impact in Adjustment Workbench sums all JE impacts
- [ ] JE impact computed from actual lines, not hardcoded
- [ ] compute_je_impact() double-entry test: IS-only entry has zero net BS impact

## Backend

- [ ] `GET /adjustment-workspace/journal-entries/{je_id}/impact` returns `ni_impact`, `bs_impact`, `asset_impact`, `liability_impact`, `equity_impact`, `line_details`
- [ ] Revenue credit → positive `ni_impact`
- [ ] Expense debit → negative `ni_impact`
- [ ] COGS debit → negative `ni_impact`
- [ ] Asset debit → positive `asset_impact` and `bs_impact`
- [ ] `_compute_impact()` in adjustment_workspace.py delegates to `je_impact_service.compute_je_impact()` (no hardcoded maps)
- [ ] `_compute_impact_for_jes()` aggregates per-JE calls to `compute_je_impact()`
- [ ] `impact_preview` endpoint uses `_compute_impact_for_jes()`
- [ ] Bridge `/adjustment-bridge/bridge` endpoint returns columnar rows: as_reported / AJE columns / total_ajes / adjusted
- [ ] Pydantic schemas: `JeImpactResult`, `BridgeAdjustmentItem`, `BridgeRow`, `BridgeResponse` added to schemas.py
- [ ] `tests/test_je_impact_service.py` — all tests pass

## Frontend

- [ ] `AdjustmentWorkspacePage` NI/BS impact columns show correct values from live computation
- [ ] Positive NI impact displayed with `text-emerald-600` class
- [ ] Negative NI impact displayed with `text-rose-600` class
- [ ] Grand total row sums NI and BS impact across all filtered items
- [ ] `AdjustmentBridgePage` renders columnar format: As Reported | AJE-1 | AJE-2 | ... | Total AJEs | Adjusted
- [ ] `adjustmentBridgeApi.getJeImpact(jeId)` available in `adjustmentBridge.ts`
- [ ] `JeImpactResult` interface exported from `adjustmentBridge.ts`
- [ ] `frontend/src/test/je_impact.test.tsx` — all tests pass
