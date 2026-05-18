from sqlalchemy import (
    CheckConstraint, Column, DateTime,
    ForeignKey, Integer, String, Text,
)
from sqlalchemy.sql import func

from app.database import Base


class SupportReference(Base):
    __tablename__ = "support_references"
    __table_args__ = (
        CheckConstraint(
            "reference_type IN ('document','journal_entry','external_system','workpaper')",
            name="ck_support_ref_type",
        ),
    )

    id = Column(Integer, primary_key=True)
    reconciliation_id = Column(Integer, ForeignKey("reconciliations.id"), nullable=False)
    reference_type = Column(String(30), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    external_ref = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    added_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    added_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
