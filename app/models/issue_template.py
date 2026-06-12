from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, Index, Integer, String, Text,
)
from sqlalchemy.sql import func

from app.database import Base

ISSUE_TYPES = (
    "financial_analytics", "balance_sheet", "audit",
    "qoe", "sba", "fraud", "disclosure", "presentation",
)
RISK_LEVELS = ("low", "moderate", "high", "critical")


class IssueTemplate(Base):
    """
    Accounting Intelligence Repository — Sprint 3.13.

    Each row represents one accounting issue template: the firm's accumulated
    knowledge about an accounting risk area, including detection guidance,
    audit procedures, suggested AJEs, management questions, and AI placeholders.

    Static base library is seeded from app/data/issue_repository_data.py.
    Org-specific overrides or custom templates can be added by setting
    organization_id to the relevant org (NULL = global library template).
    """
    __tablename__ = "issue_templates"
    __table_args__ = (
        Index("idx_tmpl_category", "category"),
        Index("idx_tmpl_issue_type", "issue_type"),
        Index("idx_tmpl_risk_level", "risk_level"),
        CheckConstraint(
            "risk_level IN ('low','moderate','high','critical')",
            name="ck_tmpl_risk_level",
        ),
        CheckConstraint(
            "issue_type IN ('financial_analytics','balance_sheet','audit','qoe','sba','fraud','disclosure','presentation')",
            name="ck_tmpl_issue_type",
        ),
    )

    id = Column(Integer, primary_key=True)
    code = Column(String(50), nullable=False, unique=True)          # e.g. REV_001
    category = Column(String(100), nullable=False)                   # e.g. revenue_recognition
    subcategory = Column(String(100), nullable=True)                 # optional sub-grouping
    issue_type = Column(String(50), nullable=False)                  # see ISSUE_TYPES

    name = Column(String(300), nullable=False)
    description = Column(Text, nullable=False)
    risk_level = Column(String(20), nullable=False, default="moderate")
    materiality_note = Column(Text, nullable=True)

    # Detection
    detection_logic = Column(Text, nullable=True)

    # Knowledge arrays (JSON)
    potential_causes_json = Column(Text, nullable=True)
    suggested_procedures_json = Column(Text, nullable=True)
    suggested_ajes_json = Column(Text, nullable=True)
    management_questions_json = Column(Text, nullable=True)
    affected_account_types_json = Column(Text, nullable=True)
    affected_statements_json = Column(Text, nullable=True)
    audit_assertions_json = Column(Text, nullable=True)       # completeness, existence, valuation, etc.
    references_json = Column(Text, nullable=True)

    # Future AI integration (architecture reserved — never populated in this sprint)
    narrative_prompt_placeholder = Column(Text, nullable=True)
    executive_summary_placeholder = Column(Text, nullable=True)     # always null
    ai_summary_placeholder = Column(Text, nullable=True)            # always null
    ai_narrative_output = Column(Text, nullable=True)               # always null

    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    is_system = Column(Boolean, nullable=False, default=True)       # False = org custom
    organization_id = Column(Integer, nullable=True)                # null = global
    created_at = Column(DateTime, nullable=False, server_default=func.now())
