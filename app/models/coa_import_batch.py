from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func
from app.database import Base


class COAImportBatch(Base):
    """
    Tracks COA file upload + parse + apply lifecycle per entity.

    Status flow: uploaded → parsed → applied | failed
    """
    __tablename__ = "coa_import_batches"

    id = Column(Integer, primary_key=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    source_system = Column(String(50), nullable=True)   # detected: quickbooks, netsuite, generic
    content_hash = Column(String(64), nullable=True)
    row_count = Column(Integer, nullable=True)
    accounts_created = Column(Integer, nullable=True)
    accounts_updated = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="uploaded")
    error_message = Column(Text, nullable=True)
    raw_preview = Column(Text, nullable=True)           # JSON-serialized parse preview
    created_at = Column(DateTime, nullable=False, server_default=func.now())
