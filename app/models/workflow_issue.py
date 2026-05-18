from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.sql import func

from app.database import Base

ISSUE_SEVERITIES = frozenset({"info", "warning", "error", "critical"})
ISSUE_STATUSES = frozenset({"open", "investigating", "resolved", "dismissed"})


class WorkflowIssue(Base):
    """
    Polymorphic issue tracking.
    Issues may be related to any object (journal_entry, accounting_period, etc.)
    or standalone (no related object).
    Critical open/investigating issues block period close.
    """
    __tablename__ = "workflow_issues"
    __table_args__ = (
        Index("idx_issues_org_status", "organization_id", "status"),
        Index("idx_issues_object", "related_object_type", "related_object_id"),
        Index("idx_issues_severity", "organization_id", "severity", "status"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    related_object_type = Column(String(100), nullable=True)
    related_object_id = Column(Integer, nullable=True)
    issue_code = Column(String(100), nullable=False)
    severity = Column(String(50), nullable=False, default="warning")
    title = Column(String(500), nullable=False)
    description = Column(String(2000), nullable=True)
    resolution_notes = Column(String(2000), nullable=True)
    status = Column(String(50), nullable=False, default="open")
    opened_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    opened_at = Column(DateTime, nullable=False, server_default=func.now())
    resolved_at = Column(DateTime, nullable=True)
