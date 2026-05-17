from sqlalchemy import (
    CheckConstraint, Column, Date, DateTime, ForeignKey,
    Index, Integer, String, Text,
)
from sqlalchemy.sql import func

from app.database import Base


class JournalEntry(Base):
    __tablename__ = "journal_entries"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','posted','reversed')",
            name="ck_je_status",
        ),
        Index("idx_je_date", "entry_date"),
        Index("idx_je_entity", "entity_id"),
        Index("idx_je_scenario", "scenario_id"),
        Index("idx_je_status", "status"),
    )

    id = Column(Integer, primary_key=True)
    je_number = Column(String(50), nullable=False, unique=True)
    entry_date = Column(Date, nullable=False)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    description = Column(Text, nullable=False)
    source = Column(String(50), nullable=False, default="manual")
    source_ref = Column(String(200), nullable=True)
    status = Column(String(20), nullable=False, default="posted")
    reversal_of_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    posted_at = Column(DateTime, nullable=True)
