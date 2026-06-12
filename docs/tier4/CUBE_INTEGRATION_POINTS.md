# Tier 4 Cube Integration Points

**Status:** Documentation only — no implementation. This document records where Tier 4 cube infrastructure should plug into the existing Tier 3 workspace pages.

---

## Background

The Financial Impact Workspace (`/financial-impact/statements`) and Adjustment Workspace (`/workbench/adjustment-workspace`) were built in Tier 3 using direct API calls to existing endpoints. Each page makes 2–4 independent queries and merges the results client-side. This is sufficient for single-entity, moderate-row-count engagements.

A future cube layer would pre-aggregate these values server-side across dimensions, enabling sub-second response times for large multi-entity engagements and enabling cross-cut queries (e.g. "all audit adjustments by account type, by period, by entity").

---

## Dimension Schema

| Dimension | Grain | Source Table | Notes |
|-----------|-------|--------------|-------|
| `dim_entity` | entity | `entities` | includes parent/child hierarchy for consolidation |
| `dim_account` | account | `accounts` | includes `account_type`, `normal_balance`, `fs_sign_convention`, taxonomy mapping |
| `dim_period` | fiscal period | `periods` | `period_type` (month/quarter/year), `fiscal_year`, `period_number` |
| `dim_scenario` | scenario | `scenarios` | `scenario_type` (book/overlay/elimination/pro_forma), `parent_scenario_id` |
| `dim_adjustment_package` | package | `adjustment_packages` | `package_type` (audit/management/tax/qoe/seller/buyer), `status` |
| `dim_overlay_group` | string | `journal_entries.overlay_group` | degenerate dimension |
| `dim_materiality` | string | `journal_entries.materiality` | clearly_trivial/immaterial/material/critical |

---

## Measure Schema

| Measure | Aggregation | Source | Notes |
|---------|-------------|--------|-------|
| `book_balance` | SUM(signed_balance) | `trial_balance` view | filtered to book scenario(s) |
| `adj_balance` | SUM(signed_balance) | `trial_balance` view | filtered to book + overlay scenario(s) |
| `variance` | `adj_balance - book_balance` | computed | |
| `net_income_book` | SUM(income - expenses) | computed from `book_balance` by account_type | |
| `net_income_adj` | SUM(income - expenses) | computed from `adj_balance` by account_type | |
| `ebitda_book` | same as `net_income_book` | EBITDA ≈ NI until D&A tracked separately | |
| `ebitda_adj` | same as `net_income_adj` | | |
| `total_assets_book` | SUM where account_type IN ('asset') | | |
| `total_assets_adj` | SUM where account_type IN ('asset') | | |
| `total_liabilities_book` | SUM where account_type IN ('liability','intercompany') | | |
| `total_liabilities_adj` | SUM where account_type IN ('liability','intercompany') | | |
| `total_equity_book` | SUM where account_type IN ('equity') | | |
| `total_equity_adj` | SUM where account_type IN ('equity') | | |
| `adjustment_count` | COUNT(DISTINCT journal_entry_id) | `journal_entries` | filtered to overlay scenarios |
| `draft_count` | COUNT where status='draft' | `journal_entries` | |
| `material_count` | COUNT where materiality IN ('material','critical') | `journal_entries` | |

---

## Integration Points in Existing Code

### 1. KPI Strip — `FinancialImpactWorkspacePage.tsx`

**Current implementation** (`computeKPIs` function, line ~74):
Fetches two full trial balance row sets (book TB + adj TB), iterates all rows client-side, sums by account type.

**Cube replacement:**
Replace the two `reportingApi.trialBalance` calls powering KPIs with a single cube query:
```typescript
// Future: cubeApi.kpis({ entity_id, as_of_date, book_scenario_ids, adj_scenario_ids })
// Returns: { net_income_book, net_income_adj, ebitda_book, ebitda_adj,
//            total_assets_book, total_assets_adj, ... }
```
The `KPICard` component requires no changes — it accepts `book: number, adjusted: number` props.

### 2. Trial Balance Tab — `FinancialImpactWorkspacePage.tsx` (`TrialBalanceTab`, line ~311)

**Current implementation:**
Two `reportingApi.trialBalance` calls merged client-side into `{ book_balance, adj_balance, variance }` per row.

**Cube replacement:**
```typescript
// Future: cubeApi.trialBalanceComparison({ entity_id, as_of_date, book_scenario_ids, adj_scenario_ids })
// Returns: TBComparisonRow[] with book_balance, adj_balance, variance pre-computed
```
The table rendering requires no changes.

### 3. Variance Analysis Tab — `FinancialImpactWorkspacePage.tsx` (`VarianceTab`, line ~537)

**Current implementation:**
`adjustmentWorkspaceApi.rollforward` returns account-level `{ as_reported, adjustments, adjusted }`. Client filters `adjustments !== 0`.

**Cube replacement:**
```typescript
// Future: cubeApi.accountVariance({ entity_id, scenario_id, min_abs_variance? })
// Server-side filters zero-variance rows before transmission
```

### 4. Impact Preview / KPI Strip — `AdjustmentWorkspacePage.tsx`

**Current implementation:**
`adjustmentWorkspaceApi.impactPreview(ids)` computes impact for selected JEs by loading JE lines and account types in a Python loop.

**Cube replacement:**
```typescript
// Future: cubeApi.impactForJEs({ journal_entry_ids })
// Returns: { ni_impact, ebitda_impact, asset_impact, liability_impact, equity_impact }
```

### 5. Rollforward Tab — `AdjustmentWorkspacePage.tsx`

**Current implementation:**
`adjustmentWorkspaceApi.rollforward` aggregates JE lines per account.

**Cube replacement:**
```typescript
// Future: cubeApi.rollforward({ entity_id, scenario_id })
// Returns: RollforwardRow[] pre-aggregated by cube layer
```

---

## Scenario Mode → Cube Filter Mapping

The `ScenarioMode` toggle in `FinancialImpactWorkspacePage` maps to cube filter presets:

| ScenarioMode | Cube Filter |
|---|---|
| `as_reported` | `scenario_type = 'book'` |
| `draft_adjusted` | `scenario_type IN ('book', 'overlay')` AND `status IN ('draft', 'posted')` |
| `posted_adjusted` | `scenario_type IN ('book', 'overlay')` AND `status = 'posted'` |
| `pro_forma` | `scenario_type IN ('book', 'overlay', 'elimination', 'pro_forma')` |

---

## API Contract Recommendation

All cube endpoints should live under `/api/v1/cube/` and return results identical in shape to the existing direct-query endpoints. This allows the frontend to switch from `reportingApi.*` → `cubeApi.*` call-by-call without restructuring components.

The `cubeApi` client module should be added at `frontend/src/api/cube.ts`.

---

## What Does NOT Need a Cube

- Financial Statements taxonomy display (`TaxonomyTable`) — tree rendering is structural, not aggregate-heavy
- Comparative reports (`periodGovernanceApi.buildComparativeReport`) — already period-keyed; cube adds marginal value
- Drilldown drawer (`financialStatementsApi.getDrilldown`) — detail-level, not aggregate

---

## Prerequisites Before Tier 4 Implementation

1. Decide on cube technology: in-process SQLite window functions vs. DuckDB vs. external OLAP (Cube.dev, Apache Druid)
2. Confirm multi-entity consolidation scope (affects `dim_entity` hierarchy design)
3. Determine caching strategy for `book_balance` pre-aggregates (invalidate on JE post)
4. Add D&A tracking to account model to enable true EBITDA (currently EBITDA ≈ NI)
