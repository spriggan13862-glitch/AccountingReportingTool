from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.sql import func

from app.database import Base


class ShadowCloseRun(Base):
    __tablename__ = "shadow_close_runs"

    id = Column(Integer, primary_key=True)
    period_id = Column(Integer, ForeignKey("accounting_periods.id", ondelete="CASCADE"), nullable=False, index=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False, index=True)
    run_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    overall_status = Column(String(20), nullable=False)  # valid|warning|blocked
    run_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    result_json = Column(JSON, nullable=False)  # list of {check, status, message, detail}
