from sqlalchemy import (
    CheckConstraint, Column, DateTime, ForeignKey,
    Integer, Numeric, String, Text,
)
from sqlalchemy.sql import func

from app.database import Base


class Reconciliation(Base):
    __tablename__ = "reconciliations"
    __table_args__ = (
        CheckConstraint(
            "reconciliation_type IN ('bank','intercompany','subledger','gl_to_sub','manual')",
            name="ck_recon_type",
        ),
        CheckConstraint(
            "status IN ('not_started','in_progress','prepared','reviewed','rejected','rolled_forward')",
            name="ck_recon_status",
        ),
        CheckConstraint(
            "tie_out_status IN ('untested','in_tolerance','out_of_tolerance','tied')",
            name="ck_recon_tie_out_status",
        ),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    period_id = Column(Integer, ForeignKey("accounting_periods.id"), nullable=True)

    reconciliation_type = Column(String(20), nullable=False, default="manual")
    status = Column(String(20), nullable=False, default="not_started")

    preparer_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewer_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    prepared_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    official_balance = Column(Numeric(20, 6), nullable=True)
    supporting_balance = Column(Numeric(20, 6), nullable=True)
    variance_amount = Column(Numeric(20, 6), nullable=True)
    variance_explanation = Column(Text, nullable=True)

    draft_preview_balance = Column(Numeric(20, 6), nullable=True)
    tie_out_status = Column(String(20), nullable=False, default="untested")
    tolerance_amount = Column(Numeric(20, 6), nullable=False, default=0)

    rollforward_opening_balance = Column(Numeric(20, 6), nullable=True)
    rollforward_adjustments = Column(Numeric(20, 6), nullable=True)
    rollforward_closing_balance = Column(Numeric(20, 6), nullable=True)

    notes = Column(Text, nullable=True)
    reviewer_comment = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())
