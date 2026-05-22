from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from app.database import Base


class ReportingTaxonomyLine(Base):
    """
    Standardized reporting taxonomy lines.

    These form the normalized financial-statement structure that entity COA accounts
    roll up into. Pre-seeded with a standard QB-compatible taxonomy.
    Seeds live in app/services/reporting_taxonomy_service.py.
    """
    __tablename__ = "reporting_taxonomy_lines"
    __table_args__ = (
        UniqueConstraint("code", name="uq_taxonomy_code"),
    )

    id = Column(Integer, primary_key=True)
    code = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    short_name = Column(String(50), nullable=True)
    # Balance Sheet: assets / liabilities / equity
    # Income Statement: revenue / cogs / expense / other_income / other_expense
    section = Column(String(30), nullable=False)
    # Statement type grouping: balance_sheet / income_statement / cash_flow / equity_statement
    statement_type = Column(String(30), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    hierarchy_depth = Column(Integer, nullable=False, default=0)
    is_subtotal = Column(Boolean, nullable=False, default=False)
    normal_balance = Column(String(6), nullable=True)  # debit / credit
    # sign_behavior: how to display values (positive=normal, negative=inverted, contra=contra-account)
    sign_behavior = Column(String(20), nullable=True, default="positive")
    parent_id = Column(Integer, ForeignKey("reporting_taxonomy_lines.id"), nullable=True)
    description = Column(Text, nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    editable = Column(Boolean, nullable=False, default=True)
    system_defined = Column(Boolean, nullable=False, default=False)
    # Optional compliance tags (future)
    sec_xbrl_tag = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class ReportingTaxonomyView(Base):
    """
    Named reporting views (e.g., GAAP, Management, SBA Lender, QoE).

    The same account can map to different taxonomy lines depending on which
    reporting view is active.
    """
    __tablename__ = "reporting_taxonomy_views"
    __table_args__ = (
        UniqueConstraint("code", name="uq_view_code"),
    )

    id = Column(Integer, primary_key=True)
    code = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    is_default = Column(Boolean, nullable=False, default=False)
    is_system_defined = Column(Boolean, nullable=False, default=False)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class ReportingPresentationSettings(Base):
    """
    Organization-level (or global) financial presentation settings.

    Controls how numbers, dates, negatives, and hierarchies are displayed
    across all reports for an organization.
    """
    __tablename__ = "reporting_presentation_settings"

    id = Column(Integer, primary_key=True)
    # nullable org_id = global default; org-specific row overrides global
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, unique=True)
    # Number display
    display_scaling = Column(String(20), nullable=False, default="actual")   # actual/thousands/millions/billions
    decimal_places = Column(Integer, nullable=False, default=0)
    negative_format = Column(String(20), nullable=False, default="parentheses")  # parentheses/minus/red
    # Statement display
    show_account_numbers = Column(Boolean, nullable=False, default=True)
    collapse_subtotals = Column(Boolean, nullable=False, default=False)
    show_hierarchy_indent = Column(Boolean, nullable=False, default=True)
    show_zero_balance = Column(Boolean, nullable=False, default=False)
    hide_inactive = Column(Boolean, nullable=False, default=True)
    # Date/currency
    date_format = Column(String(20), nullable=False, default="long")  # long/short/iso
    currency_symbol = Column(String(5), nullable=False, default="$")
    # Presentation styling
    bold_subtotals = Column(Boolean, nullable=False, default=True)
    underline_totals = Column(Boolean, nullable=False, default=True)
    alternate_row_shading = Column(Boolean, nullable=False, default=False)
    # Default view
    default_view_id = Column(Integer, ForeignKey("reporting_taxonomy_views.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
