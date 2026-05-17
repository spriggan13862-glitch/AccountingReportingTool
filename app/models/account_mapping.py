from sqlalchemy import Column, Date, DateTime, ForeignKey, Index, Integer
from sqlalchemy.sql import func

from app.database import Base


class AccountMapping(Base):
    __tablename__ = "account_mappings"
    __table_args__ = (
        Index("idx_mappings_account", "account_id"),
        Index("idx_mappings_entity",  "entity_id"),
    )

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    fs_line_item_id = Column(Integer, ForeignKey("fs_line_items.id"), nullable=False)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True)  # NULL = all entities
    effective_from = Column(Date, nullable=False, default="1900-01-01")
    effective_to = Column(Date, nullable=False, default="9999-12-31")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
