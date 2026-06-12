# Tier 4 Cube Integration — Deliverables Workspace

**Status:** Documentation only — no implementation. This document records where Tier 4 cube infrastructure should plug into the Deliverables Workspace (Sprint 3.8).

---

## Overview

The Deliverables Workspace manages engagement output packages (`DeliverablePackage`) and their contents (`DeliverablePackageItem`). In Tier 3, package contents are references (item_type + item_ref) — no pre-aggregation happens. A Tier 4 cube layer would enable saved views, snapshots, and export templates that pull live aggregate data at export time.

---

## Cube Saved Views

**Purpose:** Allow an advisor to define a filter/dimension configuration once and save it as a named view that can be attached to a package.

**Integration point:** `DeliverablePackageItem` with `item_type = 'adjustment_set'`

**Cube view schema:**
```json
{
  "view_id": "uuid",
  "name": "Q1 Audit Adjustments — Material Only",
  "filters": {
    "materiality": ["material", "critical"],
    "status": ["posted"],
    "entity_ids": [1, 2]
  },
  "dimensions": ["account_type", "overlay_group", "entity_id"],
  "measures": ["net_income_impact", "asset_impact"],
  "as_of_date": "2024-03-31"
}
```

**Where to wire:** When a user adds an item with `item_type = 'adjustment_set'`, the `item_ref` would reference a cube view ID (e.g., `cube_view:uuid`). At export time, the export engine resolves the view to live data.

---

## Cube Snapshots

**Purpose:** Lock a point-in-time view of financial data into a package so that exported deliverables are reproducible even if underlying JEs change after finalization.

**Integration point:** `DeliverablePackage.status = 'finalized'` trigger

**Snapshot schema:**
```python
class CubeSnapshot(Base):
    __tablename__ = "cube_snapshots"
    id: int
    package_id: int  # FK → deliverable_packages
    snapshot_type: str  # 'trial_balance' | 'income_statement' | 'balance_sheet' | 'rollforward'
    entity_id: int
    as_of_date: date
    scenario_ids: str  # JSON array
    data_json: Text  # serialized cube result
    created_at: datetime
```

**Trigger logic:** When `DeliverablePackage.status` transitions to `finalized`, the system should:
1. Identify all `DeliverablePackageItem` rows referencing cube views
2. Materialize each view into a `CubeSnapshot`
3. Link snapshots to the package for reproducible export

---

## Cube Export Templates

**Purpose:** Standardized Excel/PDF templates that pull cube aggregates and format them for specific audiences (audit, management, lender).

**Package type → template mapping:**

| Package Type | Export Template | Cube Measures |
|---|---|---|
| `audit` | Adjustment Listing + Rollforward + JE Detail | ni_impact, asset_impact, all je lines |
| `advisor` | IS/BS/CF + Variance + Adjustment Summary | all KPI measures |
| `management` | Executive Summary IS + KPI strip | ni_book, ni_adj, ebitda_book, ebitda_adj |
| `tax` | Taxable Income Bridge + JE Listing | ni_impact by tax-type JEs |
| `qoe` | QoE Bridge (EBITDA add-backs) + Rollforward | ebitda adjustments by overlay_group |
| `lender` | Clean IS/BS + Covenant Metrics | ni_adj, total_assets_adj, total_liabilities_adj |
| `close` | Period Close Checklist + Adjustments | all measures filtered to period |

**Template engine integration point:** `GET /deliverable-workspace/packages/{id}/export/excel` (currently stub). In Tier 4, this endpoint should:
1. Determine the package type
2. Select the matching template
3. Resolve any cube view references in package items
4. Render the openpyxl workbook from the template + live cube data

---

## API Contract for Tier 4

```typescript
// Future: frontend/src/api/cube.ts

interface CubeViewCreate {
  name: string
  filters: Record<string, unknown>
  dimensions: string[]
  measures: string[]
  as_of_date: string
}

interface CubeView extends CubeViewCreate {
  id: string
  created_at: string
}

const cubeApi = {
  createView: (body: CubeViewCreate): Promise<CubeView> => ...,
  listViews: (): Promise<CubeView[]> => ...,
  resolveView: (viewId: string): Promise<unknown> => ...,  // returns live data
  snapshotView: (viewId: string, packageId: number): Promise<void> => ...,
}
```

---

## What Does NOT Need Cube

- Package CRUD (`deliverable_packages`, `deliverable_package_items`, `deliverable_memos`) — these are reference structures, not aggregates
- Memo status tracking — purely relational
- Package cloning — copies item references, not data
- Status workflow (draft → internal_review → client_review → finalized → archived) — no aggregation needed

---

## Prerequisites Before Tier 4 Implementation

1. Decide snapshot storage: SQLite JSON columns (current) vs. separate time-series store
2. Define template file format (openpyxl templates vs. Jinja2 + openpyxl generation)
3. Establish cube view versioning (views change over time; snapshots must be immutable)
4. Confirm finalization trigger logic (manual vs. automatic on status change)
