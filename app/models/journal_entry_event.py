from sqlalchemy import (
    CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String, Text,
)
from sqlalchemy.sql import func

from app.database import Base


class JournalEntryEvent(Base):
    __tablename__ = "journal_entry_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('created','submitted','approved','rejected','posted','reversed','voided','updated')",
            name="ck_je_event_type",
        ),
        Index("idx_je_events_je_id", "je_id"),
        Index("idx_je_events_occurred", "occurred_at"),
    )

    id = Column(Integer, primary_key=True)
    je_id = Column(Integer, ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(50), nullable=False)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor_name = Column(String(100), nullable=True)
    occurred_at = Column(DateTime, nullable=False, server_default=func.now())
    note = Column(Text, nullable=True)
