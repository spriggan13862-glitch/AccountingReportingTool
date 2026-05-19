from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class PeriodGovernanceEvent(Base):
    __tablename__ = "period_governance_events"

    id = Column(Integer, primary_key=True)
    period_id = Column(Integer, ForeignKey("accounting_periods.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(30), nullable=False)   # soft_close|hard_close|reopen|override
    from_status = Column(String(20), nullable=False)
    to_status = Column(String(20), nullable=False)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
