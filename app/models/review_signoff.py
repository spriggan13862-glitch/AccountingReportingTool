from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.sql import func

from app.database import Base

SIGNOFF_STATUSES = frozenset({"pending", "approved", "rejected"})
SIGNOFF_OBJECT_TYPES = frozenset({
    "journal_entry", "tb_import", "accounting_period",
    "report_run", "workpaper", "consolidation_run",
})


class ReviewSignoff(Base):
    """
    Polymorphic review signoff.
    Multiple reviewers can sign off on the same object independently.
    Signoff history is preserved — records are never deleted.
    """
    __tablename__ = "review_signoffs"
    __table_args__ = (
        Index("idx_signoffs_object", "object_type", "object_id"),
        Index("idx_signoffs_reviewer", "reviewer_user_id"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    object_type = Column(String(100), nullable=False)
    object_id = Column(Integer, nullable=False)
    reviewer_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    signoff_status = Column(String(50), nullable=False, default="pending")
    notes = Column(String(2000), nullable=True)
    signed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
