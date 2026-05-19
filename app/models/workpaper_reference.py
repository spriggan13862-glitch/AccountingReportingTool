from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base

REFERENCE_TYPES = frozenset({
    "reconciliation", "journal_entry", "import_batch",
    "report_run", "document", "overlay", "workpaper",
})


class WorkpaperReference(Base):
    __tablename__ = "workpaper_references"
    __table_args__ = (
        Index("idx_wpref_workpaper", "workpaper_id"),
        Index("idx_wpref_type_id", "reference_type", "reference_id"),
    )

    id = Column(Integer, primary_key=True)
    workpaper_id = Column(Integer, ForeignKey("workpapers.id", ondelete="CASCADE"), nullable=False)
    reference_type = Column(String(50), nullable=False)
    reference_id = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)
    added_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    added_at = Column(DateTime, nullable=False, server_default=func.now())
