from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Index,
    Integer, Numeric, String, Text,
)
from sqlalchemy.sql import func

from app.database import Base


class ImportLine(Base):
    """
    One row from an imported TB/GL file.

    Preserves both the original source values (raw_*) and the resolved
    accounting values after column mapping and account resolution.
    The original source values are never mutated — corrections are
    expressed via changes to resolved_account_id and mapping_status.
    """
    __tablename__ = "import_lines"
    __table_args__ = (
        Index("idx_iline_batch", "batch_id"),
        Index("idx_iline_account", "resolved_account_id"),
        Index("idx_iline_status", "mapping_status"),
    )

    id = Column(Integer, primary_key=True)
    batch_id = Column(
        Integer, ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False
    )
    line_number = Column(Integer, nullable=False)

    # Original source values — immutable after upload
    raw_account_number = Column(String(100), nullable=True)   # as parsed from file
    raw_account_name = Column(String(500), nullable=True)     # as parsed from file
    raw_debit = Column(Numeric(20, 2), nullable=True)         # raw debit column
    raw_credit = Column(Numeric(20, 2), nullable=True)        # raw credit column
    raw_balance = Column(Numeric(20, 2), nullable=True)       # raw balance column (signed)
    raw_description = Column(Text, nullable=True)

    # Resolved accounting values (may differ from raw after normalization)
    debit = Column(Numeric(20, 2), nullable=False, default=0)
    credit = Column(Numeric(20, 2), nullable=False, default=0)
    description = Column(Text, nullable=True)

    # Account resolution
    resolved_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    mapping_status = Column(String(20), nullable=False, default="unmapped")
    # unmapped | mapped | skipped | rejected

    # Mapping audit — who mapped it, when, and whether it was manual
    is_manually_mapped = Column(Boolean, nullable=False, default=False)
    mapped_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    mapped_at = Column(DateTime, nullable=True)

    # Suggested resolution (account_number from fuzzy match)
    suggested_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)

    # Annotation / correction notes from the reviewer
    notes = Column(Text, nullable=True)

    # Staged FSLI / financial statement line — set during the import wizard's
    # "Suggest Financial Statement Lines" step, transferred onto the Account
    # at post time. nullable; null means no FSLI staged for this line.
    suggested_fsli_taxonomy_node_id = Column(
        Integer, ForeignKey("taxonomy_nodes.id"), nullable=True,
    )
    suggested_fsli_confidence = Column(Numeric(4, 3), nullable=True)
    suggested_fsli_reason = Column(String(200), nullable=True)
    selected_fsli_taxonomy_node_id = Column(
        Integer, ForeignKey("taxonomy_nodes.id"), nullable=True,
    )

    # CRL-B: wizard step 4 writes here; post_batch transfers onto
    # accounts.common_reporting_line_id when the Account is created.
    selected_common_reporting_line_id = Column(
        Integer, ForeignKey("common_reporting_lines.id"), nullable=True,
    )
