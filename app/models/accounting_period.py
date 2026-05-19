from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime,
    ForeignKey, Integer, String, UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


class AccountingPeriod(Base):
    __tablename__ = "accounting_periods"
    __table_args__ = (
        UniqueConstraint(
            "entity_id", "fiscal_year", "fiscal_period", "period_type",
            name="uq_period_entity_fy_fp_type",
        ),
        CheckConstraint(
            "period_type IN ('monthly','quarterly','annual')",
            name="ck_period_type",
        ),
    )

    id = Column(Integer, primary_key=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    period_name = Column(String(100), nullable=False)      # e.g. "January 2024"
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    fiscal_year = Column(Integer, nullable=False)           # e.g. 2024
    fiscal_period = Column(Integer, nullable=False)         # 1–12 monthly, 1–4 quarterly, 1 annual
    period_type = Column(String(20), nullable=False, default="monthly")
    is_closed = Column(Boolean, nullable=False, default=False)
    period_status = Column(String(20), nullable=False, default="open")  # open|soft_closed|hard_closed|reopened
    closed_at = Column(DateTime, nullable=True)
    closed_by = Column(String(200), nullable=True)
    closed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
