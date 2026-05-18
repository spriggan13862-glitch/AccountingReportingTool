import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class PreviewRun(Base):
    """
    Audit trail for every draft-overlay preview generation.
    Stores WHO generated it, WHAT was included, and WHEN — never the preview balances.
    Balance data lives only in the HTTP response; this table proves the run happened.
    """
    __tablename__ = "preview_runs"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    entity_id = Column(Integer, nullable=True)
    generated_by = Column(String(100), nullable=True)
    generated_by_user_id = Column(Integer, nullable=True)
    generated_at = Column(DateTime, nullable=False, server_default=func.now())

    preview_type = Column(String(50), nullable=False)
    as_of_date = Column(String(10), nullable=False)   # stored as ISO string (YYYY-MM-DD)
    scenario_id = Column(Integer, nullable=True)

    # JSON arrays stored as Text (SQLite-compatible; SQLAlchemy JSON not portable to all DBs)
    included_je_ids = Column(Text, nullable=False, default="[]")    # e.g. "[1,2,5]"
    overlay_groups  = Column(Text, nullable=True)                   # e.g. '["audit_adjustments"]'
    parameters      = Column(Text, nullable=True)                   # arbitrary JSON

    included_je_count    = Column(Integer, nullable=False, default=0)
    preview_label        = Column(String(100), nullable=False, default="Draft Preview — Not Posted")
    is_consolidated      = Column(Boolean, nullable=False, default=False)
    consolidation_entity_id = Column(Integer, nullable=True)
