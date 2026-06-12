# Tier 4 Cube Integration — Reporting View Engine

**Status:** Documentation only — no implementation. This document records where Tier 4 cube infrastructure should plug into the Reporting View Engine (Sprint 3.9).

---

## Overview

The Reporting View Engine (`ViewAccountOverride`) allows the same accounting data to produce different financial statement presentations (GAAP, Tax, QoE, Management, SBA) without duplicating JE data. In Tier 3, overrides are static per-account remaps. A Tier 4 cube layer would enable rule-based classification, computed measures per view, and multi-entity consolidated views.

---

## Rule-Based Override Generation

**Current Tier 3:** Each override is set manually — one `ViewAccountOverride` row per (view, account) pair.

**Tier 4 extension:** Allow views to define classification rules that auto-generate overrides:

```python
class ViewClassificationRule(Base):
    __tablename__ = "view_classification_rules"
    id: int
    view_id: int          # FK → reporting_taxonomy_views
    rule_type: str        # 'account_number_prefix' | 'account_type' | 'detail_type' | 'tag'
    rule_value: str       # e.g. "6100" (prefix), "revenue", "owner_salary"
    target_taxonomy_line_id: int  # FK → reporting_taxonomy_lines
    priority: int         # higher wins on conflict
```

**Integration point:** When `ViewAccountOverride` rows are absent for an entity, the cube layer materializes overrides from rules into a temporary working set used during FS generation.

---

## Cube Measures Per View

**Purpose:** Each reporting view may define custom measure definitions that differ from default IS/BS math. For example, a QoE view may compute EBITDA as Net Income + D&A + one-time items — defined as a formula referencing taxonomy lines.

**View measure schema:**
```json
{
  "view_id": 2,
  "measure_id": "ebitda_adj",
  "label": "Adjusted EBITDA",
  "formula": "net_income + depreciation + amortization + non_recurring_items",
  "taxonomy_line_refs": [101, 112, 115, 220]
}
```

**Integration point:** `GET /reporting-views/{view_id}/impact` could include cube-computed measure deltas alongside the per-account override list.

---

## Multi-Entity Consolidated Views

**Purpose:** Allow a view to consolidate multiple entities with optional elimination rules, producing a consolidated FS from a single `view_id`.

**Cube consolidation schema:**
```python
class ViewEntityScope(Base):
    __tablename__ = "view_entity_scopes"
    id: int
    view_id: int
    entity_id: int
    weight: float       # 1.0 = full consolidation, 0.5 = 50% JV
    elimination_set_id: int | None  # FK to elimination JEs
```

**Integration point:** `get_taxonomy_fs_statement()` in `taxonomy_reporting_service.py` currently takes a single `entity_id`. Tier 4 would replace this with a `view_scope` that resolves to multiple entities and applies consolidation weights.

---

## Snapshot-Backed Views

**Purpose:** Lock the account override configuration at a point in time so historical reports remain reproducible even if overrides are later changed.

**Integration point:** When `DeliverablePackage.status` transitions to `finalized`, snapshot all `ViewAccountOverride` rows for the package's `reporting_view_id` into a `ViewOverrideSnapshot`:

```python
class ViewOverrideSnapshot(Base):
    __tablename__ = "view_override_snapshots"
    id: int
    package_id: int      # FK → deliverable_packages
    view_id: int
    snapshot_json: Text  # JSON array of override rows at finalization time
    created_at: datetime
```

---

## API Contract for Tier 4

```typescript
// Future additions to frontend/src/api/reportingViews.ts

interface ViewClassificationRule {
  id: number
  view_id: number
  rule_type: 'account_number_prefix' | 'account_type' | 'detail_type' | 'tag'
  rule_value: string
  target_taxonomy_line_id: number
  priority: number
}

interface ViewMeasure {
  view_id: number
  measure_id: string
  label: string
  formula: string
  taxonomy_line_refs: number[]
}

// Additions to reportingViewsApi:
// listRules(viewId: number): Promise<ViewClassificationRule[]>
// createRule(viewId: number, body: Omit<ViewClassificationRule, 'id' | 'view_id'>): Promise<ViewClassificationRule>
// materializeRules(viewId: number, entityId: number): Promise<{ generated: number }>  // dry-run
// applyRules(viewId: number, entityId: number): Promise<{ applied: number }>
```

---

## What Does NOT Need Cube

- Manual override CRUD (`view_account_overrides` table) — purely relational
- View comparison (`/reporting-views/compare`) — runs two FS queries client-side
- Impact analysis (`/reporting-views/{id}/impact`) — simple join of overrides + accounts
- `DeliverablePackage.reporting_view_id` association — FK reference only
- View selector in Financial Impact Workspace — passes `view_id` query param only

---

## Prerequisites Before Tier 4 Implementation

1. Define rule priority resolution when multiple rules match the same account
2. Decide rule storage: DB rows (current schema above) vs. expression DSL
3. Establish override snapshot format (JSON array vs. relational copy)
4. Confirm consolidation weight model for partial JV entities
