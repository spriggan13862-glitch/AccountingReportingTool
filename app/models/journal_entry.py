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
            "status IN ('draft','posted','reversed','voided')",
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

    # Reversal linkage:
    #   reversal_of_id  — this JE is the reversal of that JE (back-pointer to original)
    #   reversal_je_id  — that JE is the reversal of this JE (forward-pointer to reversal)
    reversal_of_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    reversal_je_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)

    # Draft overlay classification — used to group draft entries by purpose
    # e.g. 'audit_adjustment', 'topside', 'elimination', 'accrual', 'pro_forma', 'tax'
    overlay_group = Column(String(50), nullable=True)

    # Advisor materiality classification
    materiality = Column(String(50), nullable=True)  # clearly_trivial|immaterial|material|critical

    # Audit metadata — string placeholders (kept for backward compat)
    created_by  = Column(String(100), nullable=True)
    posted_by   = Column(String(100), nullable=True)
    # Audit metadata — user-id foreign keys (populated when acting_user is supplied)
    created_by_user_id  = Column(Integer, ForeignKey("users.id"), nullable=True)
    posted_by_user_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    reversed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at  = Column(DateTime, nullable=False, server_default=func.now())
    updated_at  = Column(DateTime, nullable=True)
    posted_at   = Column(DateTime, nullable=True)
    reversed_at = Column(DateTime, nullable=True)
