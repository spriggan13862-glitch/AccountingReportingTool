from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Index,
    Integer, String, Text,
)
from sqlalchemy.sql import func

from app.database import Base


class ImportValidationIssue(Base):
    """
    Persisted validation issue for an ImportBatch or a specific ImportLine.

    Issues are re-created each time validate_batch() runs; stale issues
    from a previous validation pass are deleted before the new pass writes.
    """
    __tablename__ = "import_validation_issues"
    __table_args__ = (
        Index("idx_ivi_batch", "batch_id"),
        Index("idx_ivi_line", "import_line_id"),
        Index("idx_ivi_severity", "severity"),
    )

    id = Column(Integer, primary_key=True)
    batch_id = Column(
        Integer, ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False
    )
    import_line_id = Column(
        Integer, ForeignKey("import_lines.id", ondelete="CASCADE"), nullable=True
    )

    severity = Column(String(10), nullable=False)   # ERROR | WARNING | INFO
    code = Column(String(100), nullable=False)
    message = Column(Text, nullable=False)
    field_name = Column(String(100), nullable=True)
    suggested_resolution = Column(Text, nullable=True)

    resolved = Column(Boolean, nullable=False, default=False)
    resolved_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
