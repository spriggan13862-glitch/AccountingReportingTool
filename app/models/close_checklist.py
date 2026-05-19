from sqlalchemy import Column, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base

CLOSE_TYPES = frozenset({"monthly", "quarterly", "annual", "entity", "consolidated"})
CHECKLIST_STATUSES = frozenset({"open", "in_progress", "review", "approved", "closed"})


class CloseChecklist(Base):
    __tablename__ = "close_checklists"
    __table_args__ = (
        Index("idx_checklist_org", "organization_id"),
        Index("idx_checklist_entity_period", "entity_id", "period_id"),
        Index("idx_checklist_status", "status"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True)  # null for consolidated
    period_id = Column(Integer, ForeignKey("accounting_periods.id"), nullable=True)
    close_type = Column(String(20), nullable=False, default="monthly")
    name = Column(String(300), nullable=False)
    status = Column(String(30), nullable=False, default="open")
    target_close_date = Column(Date, nullable=True)
    actual_close_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    closed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())
