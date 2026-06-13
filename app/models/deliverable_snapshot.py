from sqlalchemy import Column, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class DeliverableSnapshot(Base):
    __tablename__ = "deliverable_snapshots"
    __table_args__ = (
        Index("idx_deliverable_snapshots_pkg", "package_id"),
    )

    id = Column(Integer, primary_key=True)
    package_id = Column(Integer, ForeignKey("deliverable_packages.id", ondelete="CASCADE"), nullable=False)
    snapshot_name = Column(String(200), nullable=False)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True)
    as_of_date = Column(Date, nullable=True)
    scenario_ids = Column(Text, nullable=True)  # JSON array stored as text
    data_view = Column(String(20), nullable=False, server_default="adjusted")
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    notes = Column(Text, nullable=True)
