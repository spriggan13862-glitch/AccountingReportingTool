from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func
from app.database import Base


class PDFAccountMapping(Base):
    """Four-layer mapping record for a PDF-extracted source account.

    Layer 1 — Source identity:
      source_account_code  deterministic temp code (HERO-BS-CASH-A7F3C912)
      official_account_code  set when external CoA provides real numbers
      name_hash              SHA-256 of normalized name (deduplication key)

    Layer 2 — Taxonomy:
      taxonomy_code        platform taxonomy assignment (e.g. "cash_equivalents")
      taxonomy_source      how it was set: 'auto' | 'manual' | 'inherited'
      taxonomy_locked      True prevents auto-remapping on re-extract

    Layer 3 — Legal entity alignment:
      entity_account_id    FK to platform accounts (when mapped to live entity CoA)
      legal_entity_code    entity code for cross-entity mapping (e.g. "LM")

    Layer 4 — Consolidation grouping:
      consolidation_group  e.g. "CONSOL-CASH" for multi-entity grouping
    """

    __tablename__ = "pdf_account_mappings"

    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("pdf_import_batches.id"), nullable=False)
    line_id = Column(Integer, ForeignKey("pdf_import_lines.id"), nullable=True)

    # Layer 1 — source identity
    source_account_code = Column(String(50), nullable=False)
    official_account_code = Column(String(50), nullable=True)
    account_name = Column(String(200), nullable=False)
    name_hash = Column(String(64), nullable=False)

    # Layer 2 — taxonomy
    taxonomy_code = Column(String(50), nullable=True)
    taxonomy_source = Column(String(20), nullable=False, default="auto")
    taxonomy_locked = Column(Boolean, nullable=False, default=False)

    # Layer 3 — legal entity alignment
    entity_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    legal_entity_code = Column(String(20), nullable=True)

    # Layer 4 — consolidation
    consolidation_group = Column(String(50), nullable=True)

    # Audit
    mapping_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())
