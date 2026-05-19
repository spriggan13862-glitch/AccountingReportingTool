from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base

WORKPAPER_STATUSES = frozenset({"draft", "prepared", "reviewed", "finalized"})
WORKPAPER_TYPES = frozenset({
    "reconciliation_support", "variance_analysis", "rollforward",
    "flux_analysis", "tie_out", "debt_schedule", "equity_rollforward",
    "tax_provision", "audit_support", "management_memo", "other",
})


class Workpaper(Base):
    __tablename__ = "workpapers"
    __table_args__ = (
        Index("idx_wp_org", "organization_id"),
        Index("idx_wp_entity_period", "entity_id", "period_id"),
        Index("idx_wp_status", "status"),
        Index("idx_wp_close_task", "close_task_id"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True)
    period_id = Column(Integer, ForeignKey("accounting_periods.id"), nullable=True)
    close_task_id = Column(Integer, ForeignKey("close_tasks.id"), nullable=True)

    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    workpaper_type = Column(String(50), nullable=False, default="other")
    status = Column(String(20), nullable=False, default="draft")

    preparer_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewer_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewer_comment = Column(Text, nullable=True)

    prepared_at = Column(DateTime, nullable=True)
    submitted_for_review_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    finalized_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True)
