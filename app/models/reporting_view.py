"""
ReportingView — presentation-only layer (Sprint P2).

A ReportingView consumes a classification Taxonomy (Sprint O) and adds
purely presentational concerns: row ordering, grouping, subtotals,
calculated rows (EBITDA, variance), comparative periods, column layouts,
and formatting.

A ReportingView MUST NOT classify accounts. Classification belongs to the
Taxonomy layer (Taxonomy, TaxonomyNode, AccountTaxonomyMapping). A view
references a taxonomy by FK and uses TaxonomyNode codes to anchor its rows.

This model is distinct from the legacy ReportingTaxonomyView (deprecated
Sprint P1), which conflates classification and presentation. The legacy
model continues to power existing financial-statement endpoints until
Sprint P5 migration.
"""
from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.orm import relationship
from app.database import Base


class ReportingView(Base):
    """
    A named presentation of a taxonomy.

    Examples (all referencing the same US GAAP taxonomy):
      - Standard Income Statement
      - Comparative IS (current vs prior period)
      - EBITDA View (adds Operating Income + D&A reconciliation)
      - Departmental P&L (rows grouped by Account.department)
      - Lender Presentation (adjusted EBITDA with addbacks)

    Fields:
      taxonomy_id          — FK to the Taxonomy that supplies classification.
      column_config        — JSON: which columns to render (current period,
                             prior period, variance %, budget, forecast,
                             scenario rollup). Shape:
                             [{"key": "current", "label": "Q4 2024",
                               "period": "current", "scenario_id": null},
                              {"key": "prior", "label": "Q4 2023",
                               "period": "prior_year"},
                              {"key": "variance", "label": "% Var",
                               "calculated": true,
                               "formula": "(current - prior) / prior"}]
      format_config        — JSON: scaling, decimal places, negative
                             format, sign behavior, currency symbol.
                             May inherit from ReportingPresentationSettings.
      comparative_config   — JSON: which prior periods, budget, forecast
                             to compare against.
    """
    __tablename__ = "reporting_views"
    __table_args__ = (
        UniqueConstraint("code", name="uq_reporting_view_code"),
    )

    id = Column(Integer, primary_key=True)
    code = Column(String(80), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # Classification source (Sprint O Taxonomy)
    taxonomy_id = Column(Integer, ForeignKey("taxonomies.id"), nullable=False)

    # Ownership / lifecycle
    is_system = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    is_default = Column(Boolean, nullable=False, default=False)
    parent_view_id = Column(Integer, ForeignKey("reporting_views.id"), nullable=True)

    # Presentation config (JSON blobs — see docstring)
    column_config = Column(JSON, nullable=True)
    format_config = Column(JSON, nullable=True)
    comparative_config = Column(JSON, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    rows = relationship(
        "ReportingViewRow",
        back_populates="view",
        cascade="all, delete-orphan",
        order_by="ReportingViewRow.sort_order",
    )


class ReportingViewRow(Base):
    """
    An ordered row within a ReportingView.

    row_type values:
      taxonomy_node — display the balance of a TaxonomyNode (taxonomy_node_id required)
      subtotal      — sum of preceding rows in this section (formula optional)
      calculation   — computed from other rows by formula (e.g. EBITDA = OI + D&A)
      header        — visual section header (no value)
      blank         — visual spacer

    formula examples:
      "{REVENUE_SALES} - {COGS}"           # subtotal of two nodes
      "{OPERATING_INCOME} + {DEPRECIATION_EXPENSE} + {AMORTIZATION_EXPENSE}"  # EBITDA
      "{current} - {prior}"                # variance row (uses column keys)
    """
    __tablename__ = "reporting_view_rows"

    id = Column(Integer, primary_key=True)
    view_id = Column(Integer, ForeignKey("reporting_views.id", ondelete="CASCADE"), nullable=False)

    sort_order = Column(Integer, nullable=False, default=0)
    section_label = Column(String(120), nullable=True)
    row_type = Column(String(30), nullable=False, default="taxonomy_node")
    label = Column(String(200), nullable=False)

    # Only set when row_type='taxonomy_node'
    taxonomy_node_id = Column(Integer, ForeignKey("taxonomy_nodes.id"), nullable=True)

    # Only set when row_type='subtotal' or 'calculation'
    formula = Column(Text, nullable=True)

    # Presentation flags
    indent_level = Column(Integer, nullable=False, default=0)
    is_bold = Column(Boolean, nullable=False, default=False)
    is_italic = Column(Boolean, nullable=False, default=False)
    underline_style = Column(String(20), nullable=True)  # 'none' / 'single' / 'double'
    sign_behavior = Column(String(20), nullable=True)    # 'normal' / 'flip' / 'absolute'

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    view = relationship("ReportingView", back_populates="rows")
