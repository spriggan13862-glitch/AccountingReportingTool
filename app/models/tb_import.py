from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.sql import func

from app.database import Base


class TbImport(Base):
    __tablename__ = "tb_imports"

    id = Column(Integer, primary_key=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    as_of_date = Column(Date, nullable=False)
    filename = Column(String(500), nullable=False)
    row_count = Column(Integer, nullable=True)
    total_debits = Column(Numeric(20, 2), nullable=True)
    total_credits = Column(Numeric(20, 2), nullable=True)
    je_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending, processed, failed
    error_message = Column(Text, nullable=True)
    uploaded_by = Column(String(100), nullable=True)
    uploaded_at = Column(DateTime, nullable=False, server_default=func.now())
