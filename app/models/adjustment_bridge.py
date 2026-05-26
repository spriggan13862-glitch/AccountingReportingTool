"""Adjustment Bridge — pivot/data-cube workpaper model (Tier 1.9 skeleton).

This model stores pre-computed rows for the Adjustment Bridge cube.
Each row represents one account in one period/scenario combination,
with imported vs. adjusted balances and all pivot dimensions.

The full cube is computed on-demand from journal entries + imported balances.
Saved views, slicers, and groupings are stored in AdjustmentBridgeView.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text, Boolean
from sqlalchemy.sql import func
from app.database import Base


class AdjustmentBridgeRow(Base):
    """One row in the Adjustment Bridge cube.

    Dimensions (grouping axes):
      entity_id, period_end, scenario_id, account_id
      account_type, taxonomy_category, fs_line
      adjustment_type, is_posted, is_included
      source, consolidation_group

    Measures (numeric values):
      imported_balance, posted_adjustments, draft_adjustments
      excluded_adjustments, adjusted_balance, variance
      prior_period_balance (nullable — requires prior period import)
      budget_placeholder (nullable — future)
    """

    __tablename__ = "adjustment_bridge_rows"

    id = Column(Integer, primary_key=True)

    # Core dimensions
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    period_end = Column(String(20), nullable=False)           # YYYY-MM-DD
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    account_number = Column(String(50), nullable=True)
    account_name = Column(String(200), nullable=True)
    account_type = Column(String(30), nullable=True)          # asset|liability|equity|revenue|expense
    taxonomy_category = Column(String(50), nullable=True)     # reporting taxonomy code
    fs_line = Column(String(100), nullable=True)              # financial statement line label

    # Pivot dimensions
    adjustment_type = Column(String(50), nullable=True)       # audit_adj|topside|elimination|accrual|pro_forma|tax
    is_posted = Column(Boolean, nullable=False, default=False)
    is_included = Column(Boolean, nullable=False, default=True)
    source = Column(String(50), nullable=True)                # pdf_import|coa_import|manual|system
    consolidation_group = Column(String(50), nullable=True)

    # Measures
    imported_balance = Column(Numeric(18, 2), nullable=True)
    posted_adjustments = Column(Numeric(18, 2), nullable=True)
    draft_adjustments = Column(Numeric(18, 2), nullable=True)
    excluded_adjustments = Column(Numeric(18, 2), nullable=True)
    adjusted_balance = Column(Numeric(18, 2), nullable=True)
    variance = Column(Numeric(18, 2), nullable=True)
    prior_period_balance = Column(Numeric(18, 2), nullable=True)
    budget_placeholder = Column(Numeric(18, 2), nullable=True)

    # Audit
    computed_at = Column(DateTime, nullable=False, server_default=func.now())
    notes = Column(Text, nullable=True)


class AdjustmentBridgeView(Base):
    """Saved view configuration for the Adjustment Bridge cube.

    Stores user-defined pivot layout: which dimensions are rows/columns/slicers,
    active filters, and sort order. One entity can have multiple named views.
    """

    __tablename__ = "adjustment_bridge_views"

    id = Column(Integer, primary_key=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    is_default = Column(Boolean, nullable=False, default=False)

    # JSON-encoded pivot config
    row_dimensions = Column(Text, nullable=True)     # ["account_type", "taxonomy_category"]
    column_dimensions = Column(Text, nullable=True)  # ["scenario_id"]
    slicer_config = Column(Text, nullable=True)      # {"entity_id": 1, "period_end": "2024-12-31"}
    sort_config = Column(Text, nullable=True)        # [{"field": "adjusted_balance", "dir": "desc"}]
    visible_measures = Column(Text, nullable=True)   # ["imported_balance", "adjusted_balance", "variance"]

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())
