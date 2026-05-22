from sqlalchemy import Boolean, Column, ForeignKey, Integer, Numeric, String, Text
from app.database import Base


class PDFImportLine(Base):
    """One extracted account line from a PDF financial statement.

    temp_account_code is deterministic: SHA-256 of "{stmt}:{cat}:{NORMALIZED_NAME}"
    truncated to 8 hex chars (uppercase). This means the same account name in the
    same section always produces the same code regardless of extraction order.

    official_account_code is set after the external entity provides real account
    numbers, replacing the temp code in downstream mappings without breaking
    the audit trail.
    """

    __tablename__ = "pdf_import_lines"

    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("pdf_import_batches.id"), nullable=False)
    # Deterministic code — hash-stable, not sequential
    temp_account_code = Column(String(50), nullable=False)
    # SHA-256 of "{stmt_abbrev}:{cat}:{NORMALIZED_NAME}" — full hash stored for dedup/lookup
    name_hash = Column(String(64), nullable=True)
    # Set when external CoA provides official numbers; replaces temp code in reports
    official_account_code = Column(String(50), nullable=True)
    account_name = Column(String(200), nullable=False)
    statement_type = Column(String(20), nullable=False)   # balance_sheet | income_statement
    section = Column(String(50), nullable=False)
    amount = Column(Numeric(18, 2), nullable=False)
    is_subtotal = Column(Boolean, nullable=False, default=False)
    is_contra = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    suggested_taxonomy_code = Column(String(50), nullable=True)
    mapping_confidence = Column(String(20), nullable=True)
    mapping_evidence = Column(String(200), nullable=True)
    page_number = Column(Integer, nullable=True)
    source_line_text = Column(Text, nullable=True)
