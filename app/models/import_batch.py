from sqlalchemy import (
    JSON, Boolean, Column, Date, DateTime, ForeignKey,
    Index, Integer, Numeric, String, Text,
)
from sqlalchemy.sql import func

from app.database import Base


class ImportBatch(Base):
    """
    One uploaded TB/GL file moving through the import pipeline.

    Status machine:
      uploaded → parsing → mapping_required → validating
               → validation_failed → ready_to_post → posted → rolled_back
      (rolled_back can re-enter validating after remapping)
    """
    __tablename__ = "import_batches"
    __table_args__ = (
        Index("idx_ibatch_entity", "entity_id"),
        Index("idx_ibatch_org", "organization_id"),
        Index("idx_ibatch_status", "status"),
        Index("idx_ibatch_hash", "content_hash"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    period_id = Column(Integer, ForeignKey("accounting_periods.id"), nullable=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=True)

    # File metadata
    filename = Column(String(500), nullable=False)
    source_format = Column(String(20), nullable=False, default="csv")
    content_hash = Column(String(64), nullable=False)  # SHA-256 hex for dedup

    # Column mapping: standard_field → source_column_header
    # e.g. {"account_number": "Acct #", "debit": "Dr Amount"}
    column_mapping = Column(JSON, nullable=False, default=dict)

    # Original column headers from the uploaded file (all columns, in order)
    raw_headers = Column(JSON, nullable=True)

    as_of_date = Column(Date, nullable=False)

    # Pipeline status
    status = Column(String(30), nullable=False, default="uploaded")
    # uploaded | parsing | mapping_required | validating
    # | validation_failed | ready_to_post | posted | rolled_back | rejected

    # Row statistics
    row_count = Column(Integer, nullable=True)
    mapped_row_count = Column(Integer, nullable=True)
    unmapped_row_count = Column(Integer, nullable=True)

    # Financial totals (set after successful mapping)
    total_debits = Column(Numeric(20, 2), nullable=True)
    total_credits = Column(Numeric(20, 2), nullable=True)

    # Diagnostic info
    error_message = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    # JE linkage
    posted_je_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    reversal_je_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)

    # Audit
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, nullable=False, server_default=func.now())
    reviewed_at = Column(DateTime, nullable=True)
