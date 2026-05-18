from sqlalchemy import Column, Date, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.sql import func

from app.database import Base

TASK_STATUSES = frozenset({"open", "in_progress", "blocked", "review", "completed", "rejected"})
TASK_PRIORITIES = frozenset({"low", "medium", "high", "critical"})
TASK_TYPES = frozenset({
    "close_task", "mapping_review", "tb_import_review", "journal_entry_review",
    "reconciliation", "lender_request", "audit_request", "consolidation_review",
    "workpaper_request", "issue_resolution", "other",
})


class WorkflowTask(Base):
    __tablename__ = "workflow_tasks"
    __table_args__ = (
        Index("idx_tasks_org_status", "organization_id", "status"),
        Index("idx_tasks_assigned", "assigned_to_user_id"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    task_type = Column(String(100), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(String(2000), nullable=True)
    status = Column(String(50), nullable=False, default="open")
    priority = Column(String(50), nullable=False, default="medium")
    assigned_to_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    due_date = Column(Date, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True)
