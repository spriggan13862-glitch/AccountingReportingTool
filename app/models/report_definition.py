from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class ReportDefinition(Base):
    """Configurable report layout template."""
    __tablename__ = "report_definitions"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(200), nullable=False)
    report_type = Column(String(50), nullable=False)   # BS/IS/CF/EQ/TB/CUSTOM
    description = Column(Text, nullable=True)
    is_template = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    overlay_groups = Column(Text, nullable=True)       # JSON list of applicable overlay groups
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    lines = relationship("ReportLine", foreign_keys="ReportLine.report_definition_id",
                         back_populates="definition", order_by="ReportLine.sort_order")
    columns = relationship("ReportColumn", foreign_keys="ReportColumn.report_definition_id",
                           back_populates="definition", order_by="ReportColumn.column_number")


class ReportLine(Base):
    """One display row in a configurable report definition."""
    __tablename__ = "report_lines"

    id = Column(Integer, primary_key=True)
    report_definition_id = Column(Integer, ForeignKey("report_definitions.id"), nullable=False)

    definition = relationship("ReportDefinition", foreign_keys=[report_definition_id],
                              back_populates="lines")
    sort_order = Column(Integer, nullable=False, default=0)
    indent_level = Column(Integer, nullable=False, default=0)
    label = Column(String(300), nullable=False)
    section = Column(String(100), nullable=True)
    account_ids_json = Column(Text, nullable=True)         # JSON list of account IDs
    fs_line_codes_json = Column(Text, nullable=True)       # JSON list of FS line codes
    calculation_type = Column(String(20), nullable=False, default="sum")  # sum/subtotal/formula/spacer
    formula = Column(String(500), nullable=True)           # e.g. "L1 - L2" (line references)
    sign_flip = Column(Boolean, nullable=False, default=False)
    is_subtotal = Column(Boolean, nullable=False, default=False)
    parent_line_id = Column(Integer, ForeignKey("report_lines.id"), nullable=True)
    number_format = Column(String(20), nullable=True, default="#,##0")
    bold = Column(Boolean, nullable=False, default=False)


class ReportColumn(Base):
    """One data column in a configurable report definition."""
    __tablename__ = "report_columns"

    id = Column(Integer, primary_key=True)
    report_definition_id = Column(Integer, ForeignKey("report_definitions.id"), nullable=False)
    column_number = Column(Integer, nullable=False)
    label = Column(String(200), nullable=False)
    column_type = Column(String(30), nullable=False)   # actual/budget/prior_period/ytd/variance/variance_pct
    scenario_ids_json = Column(Text, nullable=True)    # JSON list of scenario IDs
    period_offset = Column(Integer, nullable=False, default=0)   # 0=current, -1=prior month, -12=prior year
    is_variance_column = Column(Boolean, nullable=False, default=False)
    variance_base_column_id = Column(Integer, ForeignKey("report_columns.id"), nullable=True)
    show_percentage = Column(Boolean, nullable=False, default=False)
    overlay_groups_json = Column(Text, nullable=True)  # JSON list of overlay groups for this column

    definition = relationship("ReportDefinition", foreign_keys=[report_definition_id],
                              back_populates="columns")
