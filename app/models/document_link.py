from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base

LINKED_OBJECT_TYPES = frozenset({
    "journal_entry",
    "tb_import",
    "accounting_period",
    "entity",
    "report_run",
    "consolidation_run",
    "pdf_import",
    "coa_import",
})


class DocumentLink(Base):
    """
    Polymorphic attachment table.
    A single document can be linked to many objects; a single object can have many documents.
    linked_object_type + linked_object_id form a logical FK without enforcing a real FK,
    enabling attachment to any table without schema changes.
    """
    __tablename__ = "document_links"
    __table_args__ = (
        UniqueConstraint(
            "document_id", "linked_object_type", "linked_object_id",
            name="uq_doclink_doc_obj",
        ),
        Index("idx_doclinks_object", "linked_object_type", "linked_object_id"),
    )

    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    linked_object_type = Column(String(100), nullable=False)
    linked_object_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
