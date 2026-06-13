from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class QuickBooksConnection(Base):
    __tablename__ = "quickbooks_connections"
    __table_args__ = (
        Index("idx_qb_connections_entity", "entity_id"),
    )

    id = Column(Integer, primary_key=True)
    entity_id = Column(Integer, ForeignKey("entities.id", ondelete="CASCADE"), nullable=False)
    organization_id = Column(Integer, nullable=False)
    connection_type = Column(String(20), nullable=False, server_default="online")  # 'online' | 'desktop'
    realm_id = Column(String(100), nullable=True)  # QBO company ID
    access_token = Column(String(2000), nullable=True)   # Fernet-encrypted
    refresh_token = Column(String(2000), nullable=True)  # Fernet-encrypted
    token_expires_at = Column(DateTime, nullable=True)
    company_name = Column(String(200), nullable=True)
    last_sync_at = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, server_default="active")  # active|expired|disconnected
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())
