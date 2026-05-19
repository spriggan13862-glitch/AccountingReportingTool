from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base

COMMENT_TYPES = frozenset({"comment", "rejection", "approval", "status_change", "assignment"})


class CloseTaskComment(Base):
    __tablename__ = "close_task_comments"
    __table_args__ = (
        Index("idx_ctcomment_task", "task_id"),
        Index("idx_ctcomment_author", "author_user_id"),
    )

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("close_tasks.id", ondelete="CASCADE"), nullable=False)
    author_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    comment_text = Column(Text, nullable=False)
    comment_type = Column(String(30), nullable=False, default="comment")
    prior_status = Column(String(30), nullable=True)
    new_status = Column(String(30), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
