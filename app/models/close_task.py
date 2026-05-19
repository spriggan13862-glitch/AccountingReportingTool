from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.sql import func

from app.database import Base

TASK_STATUSES = frozenset({
    "not_started", "in_progress", "blocked", "prepared",
    "under_review", "completed", "rejected",
})
TASK_PRIORITIES = frozenset({"low", "medium", "high", "critical"})

VALID_TRANSITIONS: dict[str, list[str]] = {
    "not_started":  ["in_progress"],
    "in_progress":  ["blocked", "prepared"],
    "blocked":      ["in_progress"],
    "prepared":     ["under_review"],
    "under_review": ["completed", "rejected"],
    "rejected":     ["in_progress"],
    "completed":    [],
}


class CloseTask(Base):
    __tablename__ = "close_tasks"
    __table_args__ = (
        Index("idx_ctask_checklist", "checklist_id"),
        Index("idx_ctask_status", "status"),
        Index("idx_ctask_assigned", "assigned_to_user_id"),
        Index("idx_ctask_org", "organization_id"),
    )

    id = Column(Integer, primary_key=True)
    checklist_id = Column(Integer, ForeignKey("close_checklists.id", ondelete="CASCADE"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True)

    task_type = Column(String(50), nullable=False, default="manual")
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="not_started")
    priority = Column(String(20), nullable=False, default="medium")
    sort_order = Column(Integer, nullable=False, default=0)

    # Assignees
    assigned_to_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewer_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    prepared_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Timestamps
    due_date = Column(Date, nullable=True)
    started_at = Column(DateTime, nullable=True)
    prepared_at = Column(DateTime, nullable=True)
    submitted_for_review_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True)

    # Linked objects (optional)
    linked_reconciliation_id = Column(Integer, ForeignKey("reconciliations.id"), nullable=True)
    linked_import_batch_id = Column(Integer, ForeignKey("import_batches.id"), nullable=True)
    linked_workpaper_id = Column(Integer, nullable=True)  # FK set after workpapers table created

    # Blocker task IDs stored as JSON list
    blocker_task_ids = Column(JSON, nullable=True)

    rejection_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    is_required = Column(Boolean, nullable=False, default=True)
