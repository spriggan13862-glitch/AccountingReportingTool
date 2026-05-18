from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime,
    ForeignKey, Integer, Numeric, String, Text,
)
from sqlalchemy.sql import func

from app.database import Base


class ReconciliationLine(Base):
    __tablename__ = "reconciliation_lines"
    __table_args__ = (
        CheckConstraint(
            "source_type IN ('gl','bank','subledger','manual')",
            name="ck_recon_line_source_type",
        ),
    )

    id = Column(Integer, primary_key=True)
    reconciliation_id = Column(Integer, ForeignKey("reconciliations.id"), nullable=False)
    line_number = Column(Integer, nullable=False)
    description = Column(String(500), nullable=True)
    source_type = Column(String(20), nullable=False, default="manual")
    source_reference = Column(String(200), nullable=True)
    debit = Column(Numeric(20, 6), nullable=False, default=0)
    credit = Column(Numeric(20, 6), nullable=False, default=0)
    balance = Column(Numeric(20, 6), nullable=False, default=0)
    is_reconciling_item = Column(Boolean, nullable=False, default=False)
    reconciling_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
