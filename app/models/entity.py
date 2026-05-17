from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class Entity(Base):
    __tablename__ = "entities"
    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('operating', 'consolidation', 'elimination', 'carveout')",
            name="ck_entities_type",
        ),
        Index("idx_entities_parent", "parent_id"),
    )

    id = Column(Integer, primary_key=True)
    code = Column(String(20), nullable=False, unique=True)
    name = Column(String(200), nullable=False)
    entity_type = Column(String(20), nullable=False)
    parent_id = Column(Integer, ForeignKey("entities.id"), nullable=True)
    currency = Column(String(3), nullable=False, default="USD")
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
