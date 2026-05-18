from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.sql import func

from app.database import Base

DOCUMENT_TYPES = frozenset({
    "journal_entry_support",
    "tb_import",
    "bank_statement",
    "workpaper",
    "audit_support",
    "lender_support",
    "consolidation_support",
    "memo",
    "other",
})


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("idx_documents_org", "organization_id"),
        Index("idx_documents_org_checksum", "organization_id", "checksum_sha256"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    file_name = Column(String(255), nullable=False)           # stored name (uuid-based, collision-free)
    original_file_name = Column(String(500), nullable=False)  # user-supplied filename
    file_extension = Column(String(50), nullable=False)
    mime_type = Column(String(200), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    storage_path = Column(String(1000), nullable=False)       # path relative to storage root
    document_type = Column(String(100), nullable=False)
    description = Column(String(1000), nullable=True)
    checksum_sha256 = Column(String(64), nullable=False)
    uploaded_at = Column(DateTime, nullable=False, server_default=func.now())
    is_deleted = Column(Boolean, nullable=False, default=False)
