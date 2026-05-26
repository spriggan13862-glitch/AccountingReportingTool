from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func
from app.database import Base


class PDFImportBatch(Base):
    """Tracks PDF financial statement upload + extract + apply lifecycle."""

    __tablename__ = "pdf_import_batches"

    id = Column(Integer, primary_key=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True)
    filename = Column(String(255), nullable=False)
    source_entity_name = Column(String(200), nullable=True)
    statement_date = Column(String(20), nullable=True)
    basis_of_accounting = Column(String(50), nullable=True)

    # P0: import classification set by user in Step 1
    # trial_balance | financial_statements | tax_return | management_report
    import_type = Column(String(40), nullable=True, default="financial_statements")
    # standalone | consolidated | combined | unknown
    statement_scope = Column(String(30), nullable=True, default="unknown")

    page_count = Column(Integer, nullable=True)
    line_count = Column(Integer, nullable=True)
    accounts_created = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="uploaded")
    error_message = Column(Text, nullable=True)
    raw_preview = Column(Text, nullable=True)
    validation_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
