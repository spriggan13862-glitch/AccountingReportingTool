from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class CloseTaskAttachment(Base):
    __tablename__ = "close_task_attachments"
    __table_args__ = (
        Index("idx_ctattach_task", "task_id"),
    )

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("close_tasks.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    attachment_label = Column(String(200), nullable=False)
    original_filename = Column(String(500), nullable=False)
    version_number = Column(Integer, nullable=False, default=1)
    document_category = Column(String(50), nullable=False, default="support")
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, nullable=False, server_default=func.now())
    is_superseded = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)
