"""
Close management service — M24.

Orchestrates monthly/quarterly/annual close workflows including:
  - CloseChecklist creation and lifecycle
  - CloseTask status machine with reviewer separation
  - Workpaper create / submit / review / finalize
  - Close readiness calculation
  - Close binder export

Business rules:
  - Reviewer cannot be the same user as preparer (reviewer separation)
  - Blocked tasks prevent close completion
  - All status transitions are audited via CloseTaskComment
  - Workpapers must reach 'reviewed' before they can be finalized
  - Close readiness is computed, never stored
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.models.close_checklist import CloseChecklist
from app.models.close_task import CloseTask, VALID_TRANSITIONS
from app.models.close_task_comment import CloseTaskComment
from app.models.close_task_attachment import CloseTaskAttachment
from app.models.workpaper import Workpaper
from app.models.workpaper_reference import WorkpaperReference


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class CloseManagementError(ValueError):
    pass


class CloseChecklistNotFoundError(LookupError):
    pass


class CloseTaskNotFoundError(LookupError):
    pass


class CloseTaskStateError(CloseManagementError):
    pass


class CloseReviewerSeparationError(CloseManagementError):
    pass


class WorkpaperNotFoundError(LookupError):
    pass


class WorkpaperStateError(CloseManagementError):
    pass


# ---------------------------------------------------------------------------
# Close Readiness
# ---------------------------------------------------------------------------

@dataclass
class CloseReadiness:
    checklist_id: int
    overall_status: str
    completion_pct: float
    total_tasks: int
    required_tasks: int
    by_status: dict[str, int]
    overdue_count: int
    blocked_count: int
    tasks_under_review: int
    unreviewed_workpapers: int
    issues: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Checklist CRUD
# ---------------------------------------------------------------------------

def create_checklist(
    db: Session,
    organization_id: int,
    name: str,
    close_type: str = "monthly",
    entity_id: int | None = None,
    period_id: int | None = None,
    target_close_date: datetime.date | None = None,
    notes: str | None = None,
    created_by_user_id: int | None = None,
) -> CloseChecklist:
    checklist = CloseChecklist(
        organization_id=organization_id,
        entity_id=entity_id,
        period_id=period_id,
        close_type=close_type,
        name=name,
        status="open",
        target_close_date=target_close_date,
        notes=notes,
        created_by_user_id=created_by_user_id,
    )
    db.add(checklist)
    db.flush()
    return checklist


def get_checklist(db: Session, checklist_id: int) -> CloseChecklist:
    cl = db.get(CloseChecklist, checklist_id)
    if cl is None:
        raise CloseChecklistNotFoundError(f"CloseChecklist {checklist_id} not found")
    return cl


def list_checklists(
    db: Session,
    organization_id: int,
    entity_id: int | None = None,
    period_id: int | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[CloseChecklist]:
    q = db.query(CloseChecklist).filter(CloseChecklist.organization_id == organization_id)
    if entity_id is not None:
        q = q.filter(CloseChecklist.entity_id == entity_id)
    if period_id is not None:
        q = q.filter(CloseChecklist.period_id == period_id)
    if status:
        q = q.filter(CloseChecklist.status == status)
    return q.order_by(CloseChecklist.created_at.desc()).offset(offset).limit(limit).all()


def update_checklist_status(
    db: Session,
    checklist_id: int,
    new_status: str,
    acting_user_id: int | None = None,
) -> CloseChecklist:
    cl = get_checklist(db, checklist_id)
    cl.status = new_status
    cl.updated_at = datetime.datetime.now(datetime.UTC)
    if new_status == "closed":
        cl.closed_at = datetime.datetime.now(datetime.UTC)
        cl.actual_close_date = datetime.date.today()
        cl.approved_by_user_id = acting_user_id
    db.flush()
    return cl


# ---------------------------------------------------------------------------
# Task CRUD
# ---------------------------------------------------------------------------

def create_task(
    db: Session,
    checklist_id: int,
    title: str,
    organization_id: int,
    task_type: str = "manual",
    description: str | None = None,
    priority: str = "medium",
    assigned_to_user_id: int | None = None,
    reviewer_user_id: int | None = None,
    due_date: datetime.date | None = None,
    entity_id: int | None = None,
    sort_order: int = 0,
    notes: str | None = None,
    blocker_task_ids: list[int] | None = None,
    is_required: bool = True,
    linked_reconciliation_id: int | None = None,
    linked_import_batch_id: int | None = None,
) -> CloseTask:
    _ = get_checklist(db, checklist_id)
    task = CloseTask(
        checklist_id=checklist_id,
        organization_id=organization_id,
        entity_id=entity_id,
        task_type=task_type,
        title=title,
        description=description,
        status="not_started",
        priority=priority,
        sort_order=sort_order,
        assigned_to_user_id=assigned_to_user_id,
        reviewer_user_id=reviewer_user_id,
        due_date=due_date,
        notes=notes,
        blocker_task_ids=blocker_task_ids or [],
        is_required=is_required,
        linked_reconciliation_id=linked_reconciliation_id,
        linked_import_batch_id=linked_import_batch_id,
    )
    db.add(task)
    db.flush()
    return task


def get_task(db: Session, task_id: int) -> CloseTask:
    task = db.get(CloseTask, task_id)
    if task is None:
        raise CloseTaskNotFoundError(f"CloseTask {task_id} not found")
    return task


def list_tasks(
    db: Session,
    checklist_id: int,
    status: str | None = None,
    assigned_to: int | None = None,
) -> list[CloseTask]:
    q = db.query(CloseTask).filter(CloseTask.checklist_id == checklist_id)
    if status:
        q = q.filter(CloseTask.status == status)
    if assigned_to is not None:
        q = q.filter(CloseTask.assigned_to_user_id == assigned_to)
    return q.order_by(CloseTask.sort_order, CloseTask.id).all()


def assign_task(
    db: Session,
    task_id: int,
    assigned_to_user_id: int | None,
    reviewer_user_id: int | None = None,
) -> CloseTask:
    task = get_task(db, task_id)
    task.assigned_to_user_id = assigned_to_user_id
    if reviewer_user_id is not None:
        task.reviewer_user_id = reviewer_user_id
    task.updated_at = datetime.datetime.now(datetime.UTC)
    db.flush()
    return task


# ---------------------------------------------------------------------------
# Task status machine
# ---------------------------------------------------------------------------

def _check_blockers(db: Session, task: CloseTask) -> None:
    """Raise if any blocker tasks are not yet completed."""
    blocker_ids = task.blocker_task_ids or []
    for bid in blocker_ids:
        blocker = db.get(CloseTask, bid)
        if blocker and blocker.status != "completed":
            raise CloseTaskStateError(
                f"Task '{task.title}' is blocked by task #{bid} ('{blocker.title}', "
                f"status='{blocker.status}'). Complete the blocker first."
            )


def _record_status_change(
    db: Session,
    task: CloseTask,
    prior_status: str,
    new_status: str,
    comment_text: str,
    author_user_id: int | None,
    comment_type: str = "status_change",
) -> CloseTaskComment:
    cmt = CloseTaskComment(
        task_id=task.id,
        author_user_id=author_user_id,
        comment_text=comment_text,
        comment_type=comment_type,
        prior_status=prior_status,
        new_status=new_status,
    )
    db.add(cmt)
    db.flush()
    return cmt


def transition_task(
    db: Session,
    task_id: int,
    new_status: str,
    acting_user_id: int | None = None,
    comment: str | None = None,
) -> CloseTask:
    """
    Generic status transition. Validates the transition is allowed,
    checks blockers when moving to in_progress, and records an audit comment.
    """
    task = get_task(db, task_id)
    prior = task.status

    allowed = VALID_TRANSITIONS.get(prior, [])
    if new_status not in allowed:
        raise CloseTaskStateError(
            f"Cannot transition '{prior}' → '{new_status}'. "
            f"Allowed: {allowed or ['(none — terminal)']}"
        )

    if new_status == "in_progress":
        _check_blockers(db, task)

    now = datetime.datetime.now(datetime.UTC)
    task.status = new_status
    task.updated_at = now

    if new_status == "in_progress" and task.started_at is None:
        task.started_at = now
    elif new_status == "prepared":
        task.prepared_at = now
        task.prepared_by_user_id = acting_user_id
    elif new_status == "under_review":
        task.submitted_for_review_at = now
    elif new_status == "completed":
        task.reviewed_at = now
        task.completed_at = now
        task.reviewed_by_user_id = acting_user_id
    elif new_status == "rejected":
        task.reviewed_at = now
        task.reviewed_by_user_id = acting_user_id
        if comment:
            task.rejection_reason = comment

    default_msg = f"Status changed: {prior} → {new_status}"
    _record_status_change(
        db, task, prior, new_status,
        comment or default_msg,
        acting_user_id,
    )
    db.flush()
    return task


def submit_for_review(
    db: Session,
    task_id: int,
    acting_user_id: int | None = None,
    comment: str | None = None,
) -> CloseTask:
    """Move prepared → under_review."""
    return transition_task(db, task_id, "under_review", acting_user_id, comment)


def approve_task(
    db: Session,
    task_id: int,
    acting_user: Any,
    comment: str | None = None,
) -> CloseTask:
    """
    Move under_review → completed.
    Enforces reviewer ≠ preparer separation.
    """
    task = get_task(db, task_id)
    reviewer_id = getattr(acting_user, "id", acting_user) if acting_user else None

    if task.prepared_by_user_id and reviewer_id == task.prepared_by_user_id:
        raise CloseReviewerSeparationError(
            f"Reviewer (user {reviewer_id}) cannot approve their own preparation. "
            "Assign a different reviewer."
        )

    return transition_task(db, task_id, "completed", reviewer_id, comment or "Task approved and completed.")


def reject_task(
    db: Session,
    task_id: int,
    acting_user: Any,
    reason: str,
) -> CloseTask:
    """
    Move under_review → rejected.
    Enforces reviewer ≠ preparer separation.
    """
    task = get_task(db, task_id)
    reviewer_id = getattr(acting_user, "id", acting_user) if acting_user else None

    if task.prepared_by_user_id and reviewer_id == task.prepared_by_user_id:
        raise CloseReviewerSeparationError(
            "Reviewer cannot reject their own preparation."
        )

    task = transition_task(db, task_id, "rejected", reviewer_id, reason)
    _record_status_change(
        db, task, "under_review", "rejected",
        f"Rejected: {reason}", reviewer_id, comment_type="rejection"
    )
    return task


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

def add_comment(
    db: Session,
    task_id: int,
    author_user_id: int | None,
    comment_text: str,
) -> CloseTaskComment:
    _ = get_task(db, task_id)
    cmt = CloseTaskComment(
        task_id=task_id,
        author_user_id=author_user_id,
        comment_text=comment_text,
        comment_type="comment",
    )
    db.add(cmt)
    db.flush()
    return cmt


def get_task_comments(db: Session, task_id: int) -> list[CloseTaskComment]:
    return (
        db.query(CloseTaskComment)
        .filter(CloseTaskComment.task_id == task_id)
        .order_by(CloseTaskComment.created_at)
        .all()
    )


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

def add_attachment(
    db: Session,
    task_id: int,
    attachment_label: str,
    original_filename: str,
    document_id: int | None = None,
    document_category: str = "support",
    uploaded_by_user_id: int | None = None,
    notes: str | None = None,
) -> CloseTaskAttachment:
    """
    Add a support document to a close task.
    If another attachment with the same label exists, supersede it and increment version.
    """
    _ = get_task(db, task_id)

    prior = (
        db.query(CloseTaskAttachment)
        .filter(
            CloseTaskAttachment.task_id == task_id,
            CloseTaskAttachment.attachment_label == attachment_label,
            CloseTaskAttachment.is_superseded == False,
        )
        .first()
    )
    version = 1
    if prior:
        prior.is_superseded = True
        version = (prior.version_number or 1) + 1
        db.flush()

    attach = CloseTaskAttachment(
        task_id=task_id,
        document_id=document_id,
        attachment_label=attachment_label,
        original_filename=original_filename,
        version_number=version,
        document_category=document_category,
        uploaded_by_user_id=uploaded_by_user_id,
        notes=notes,
    )
    db.add(attach)
    db.flush()
    return attach


def get_task_attachments(
    db: Session, task_id: int, include_superseded: bool = False
) -> list[CloseTaskAttachment]:
    q = db.query(CloseTaskAttachment).filter(CloseTaskAttachment.task_id == task_id)
    if not include_superseded:
        q = q.filter(CloseTaskAttachment.is_superseded == False)
    return q.order_by(CloseTaskAttachment.attachment_label, CloseTaskAttachment.version_number).all()


# ---------------------------------------------------------------------------
# Close Readiness
# ---------------------------------------------------------------------------

def get_close_readiness(db: Session, checklist_id: int) -> CloseReadiness:
    """Compute close readiness for a checklist (never stored, always fresh)."""
    _ = get_checklist(db, checklist_id)
    tasks = db.query(CloseTask).filter(CloseTask.checklist_id == checklist_id).all()

    by_status: dict[str, int] = {}
    for t in tasks:
        by_status[t.status] = by_status.get(t.status, 0) + 1

    total = len(tasks)
    required_tasks = [t for t in tasks if t.is_required]
    required_total = len(required_tasks)
    completed_required = sum(1 for t in required_tasks if t.status == "completed")

    completion_pct = (completed_required / required_total * 100) if required_total > 0 else 0.0
    blocked_count = by_status.get("blocked", 0)
    under_review_count = by_status.get("under_review", 0)

    today = datetime.date.today()
    overdue = [
        t for t in tasks
        if t.due_date and t.due_date < today and t.status not in ("completed",)
    ]
    overdue_count = len(overdue)

    # Workpaper readiness
    wps = (
        db.query(Workpaper)
        .join(CloseTask, Workpaper.close_task_id == CloseTask.id)
        .filter(CloseTask.checklist_id == checklist_id)
        .all()
    )
    unreviewed_wps = sum(1 for w in wps if w.status not in ("reviewed", "finalized"))

    issues: list[str] = []
    if blocked_count > 0:
        issues.append(f"{blocked_count} task(s) are blocked.")
    if overdue_count > 0:
        issues.append(f"{overdue_count} task(s) are overdue.")
    if under_review_count > 0:
        issues.append(f"{under_review_count} task(s) awaiting reviewer sign-off.")
    if unreviewed_wps > 0:
        issues.append(f"{unreviewed_wps} workpaper(s) not yet reviewed.")

    # Determine overall status
    if required_total > 0 and completed_required == required_total and unreviewed_wps == 0:
        overall = "Ready to Close"
    elif blocked_count > 0:
        overall = "Blocked"
    elif under_review_count > 0:
        overall = "Review Required"
    elif overdue_count > 0:
        overall = "Overdue"
    elif completed_required == 0:
        overall = "Not Started"
    else:
        overall = "In Progress"

    return CloseReadiness(
        checklist_id=checklist_id,
        overall_status=overall,
        completion_pct=round(completion_pct, 1),
        total_tasks=total,
        required_tasks=required_total,
        by_status=by_status,
        overdue_count=overdue_count,
        blocked_count=blocked_count,
        tasks_under_review=under_review_count,
        unreviewed_workpapers=unreviewed_wps,
        issues=issues,
    )


# ---------------------------------------------------------------------------
# Workpapers
# ---------------------------------------------------------------------------

def create_workpaper(
    db: Session,
    organization_id: int,
    title: str,
    workpaper_type: str = "other",
    entity_id: int | None = None,
    period_id: int | None = None,
    close_task_id: int | None = None,
    description: str | None = None,
    preparer_user_id: int | None = None,
    reviewer_user_id: int | None = None,
    created_by_user_id: int | None = None,
) -> Workpaper:
    wp = Workpaper(
        organization_id=organization_id,
        entity_id=entity_id,
        period_id=period_id,
        close_task_id=close_task_id,
        title=title,
        description=description,
        workpaper_type=workpaper_type,
        status="draft",
        preparer_user_id=preparer_user_id,
        reviewer_user_id=reviewer_user_id,
        created_by_user_id=created_by_user_id,
    )
    db.add(wp)
    db.flush()
    return wp


def get_workpaper(db: Session, workpaper_id: int) -> Workpaper:
    wp = db.get(Workpaper, workpaper_id)
    if wp is None:
        raise WorkpaperNotFoundError(f"Workpaper {workpaper_id} not found")
    return wp


def list_workpapers(
    db: Session,
    organization_id: int,
    entity_id: int | None = None,
    period_id: int | None = None,
    status: str | None = None,
) -> list[Workpaper]:
    q = db.query(Workpaper).filter(Workpaper.organization_id == organization_id)
    if entity_id is not None:
        q = q.filter(Workpaper.entity_id == entity_id)
    if period_id is not None:
        q = q.filter(Workpaper.period_id == period_id)
    if status:
        q = q.filter(Workpaper.status == status)
    return q.order_by(Workpaper.created_at.desc()).all()


def submit_workpaper(
    db: Session,
    workpaper_id: int,
    acting_user_id: int | None = None,
) -> Workpaper:
    """draft → prepared."""
    wp = get_workpaper(db, workpaper_id)
    if wp.status not in ("draft", "prepared"):
        raise WorkpaperStateError(f"Cannot submit a workpaper with status '{wp.status}'")
    wp.status = "prepared"
    wp.preparer_user_id = acting_user_id
    wp.prepared_at = datetime.datetime.now(datetime.UTC)
    wp.submitted_for_review_at = datetime.datetime.now(datetime.UTC)
    wp.updated_at = datetime.datetime.now(datetime.UTC)
    db.flush()
    return wp


def review_workpaper(
    db: Session,
    workpaper_id: int,
    acting_user: Any,
    approved: bool,
    comment: str | None = None,
) -> Workpaper:
    """
    prepared → reviewed (if approved) or back to draft (if rejected).
    Enforces reviewer ≠ preparer separation.
    """
    wp = get_workpaper(db, workpaper_id)
    if wp.status != "prepared":
        raise WorkpaperStateError(
            f"Workpaper must be in 'prepared' status to review; current: '{wp.status}'"
        )

    reviewer_id = getattr(acting_user, "id", acting_user) if acting_user else None
    if wp.preparer_user_id and reviewer_id == wp.preparer_user_id:
        raise CloseReviewerSeparationError(
            "Reviewer cannot review their own workpaper preparation."
        )

    now = datetime.datetime.now(datetime.UTC)
    wp.reviewed_by_user_id = reviewer_id
    wp.reviewer_comment = comment
    wp.reviewed_at = now
    wp.updated_at = now

    if approved:
        wp.status = "reviewed"
    else:
        wp.status = "draft"
        wp.reviewer_comment = comment

    db.flush()
    return wp


def finalize_workpaper(
    db: Session,
    workpaper_id: int,
    acting_user_id: int | None = None,
) -> Workpaper:
    """reviewed → finalized."""
    wp = get_workpaper(db, workpaper_id)
    if wp.status != "reviewed":
        raise WorkpaperStateError(
            f"Workpaper must be 'reviewed' before finalizing; current: '{wp.status}'"
        )
    wp.status = "finalized"
    wp.finalized_at = datetime.datetime.now(datetime.UTC)
    wp.updated_at = datetime.datetime.now(datetime.UTC)
    db.flush()
    return wp


def add_workpaper_reference(
    db: Session,
    workpaper_id: int,
    reference_type: str,
    reference_id: int,
    notes: str | None = None,
    added_by_user_id: int | None = None,
) -> WorkpaperReference:
    _ = get_workpaper(db, workpaper_id)
    ref = WorkpaperReference(
        workpaper_id=workpaper_id,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes,
        added_by_user_id=added_by_user_id,
    )
    db.add(ref)
    db.flush()
    return ref


def get_workpaper_references(db: Session, workpaper_id: int) -> list[WorkpaperReference]:
    return (
        db.query(WorkpaperReference)
        .filter(WorkpaperReference.workpaper_id == workpaper_id)
        .order_by(WorkpaperReference.added_at)
        .all()
    )


# ---------------------------------------------------------------------------
# Close binder export
# ---------------------------------------------------------------------------

def export_close_binder(db: Session, checklist_id: int) -> dict[str, Any]:
    """
    Generate a structured close binder summary.
    Returns a dict suitable for JSON serialization or PDF generation.
    """
    cl = get_checklist(db, checklist_id)
    tasks = list_tasks(db, checklist_id)
    readiness = get_close_readiness(db, checklist_id)

    task_exports = []
    for task in tasks:
        comments = get_task_comments(db, task.id)
        attachments = get_task_attachments(db, task.id)

        # Collect linked workpaper
        wp_data = None
        if task.linked_workpaper_id:
            try:
                wp = get_workpaper(db, task.linked_workpaper_id)
                refs = get_workpaper_references(db, wp.id)
                wp_data = {
                    "id": wp.id,
                    "title": wp.title,
                    "status": wp.status,
                    "workpaper_type": wp.workpaper_type,
                    "preparer_user_id": wp.preparer_user_id,
                    "reviewer_user_id": wp.reviewed_by_user_id,
                    "reviewed_at": wp.reviewed_at.isoformat() if wp.reviewed_at else None,
                    "references": [
                        {"type": r.reference_type, "id": r.reference_id, "notes": r.notes}
                        for r in refs
                    ],
                }
            except WorkpaperNotFoundError:
                pass

        task_exports.append({
            "id": task.id,
            "title": task.title,
            "task_type": task.task_type,
            "status": task.status,
            "priority": task.priority,
            "assigned_to_user_id": task.assigned_to_user_id,
            "reviewer_user_id": task.reviewer_user_id,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "prepared_by_user_id": task.prepared_by_user_id,
            "reviewed_by_user_id": task.reviewed_by_user_id,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
            "rejection_reason": task.rejection_reason,
            "comments": [
                {
                    "id": c.id,
                    "comment_type": c.comment_type,
                    "text": c.comment_text,
                    "author_user_id": c.author_user_id,
                    "prior_status": c.prior_status,
                    "new_status": c.new_status,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
                for c in comments
            ],
            "attachments": [
                {
                    "id": a.id,
                    "label": a.attachment_label,
                    "filename": a.original_filename,
                    "version": a.version_number,
                    "category": a.document_category,
                    "uploaded_by_user_id": a.uploaded_by_user_id,
                }
                for a in attachments
            ],
            "workpaper": wp_data,
        })

    # Standalone workpapers (linked to checklist via tasks)
    all_task_ids = [t.id for t in tasks]
    standalone_wps = (
        db.query(Workpaper)
        .filter(
            Workpaper.organization_id == cl.organization_id,
            Workpaper.close_task_id.in_(all_task_ids) if all_task_ids else False,
        )
        .all()
    ) if all_task_ids else []

    signoff_summary = {
        "total": len(tasks),
        "completed": sum(1 for t in tasks if t.status == "completed"),
        "pending": sum(1 for t in tasks if t.status not in ("completed",)),
        "reviewers": list({t.reviewed_by_user_id for t in tasks if t.reviewed_by_user_id}),
    }

    return {
        "generated_at": datetime.datetime.now(datetime.UTC).isoformat(),
        "checklist": {
            "id": cl.id,
            "name": cl.name,
            "close_type": cl.close_type,
            "status": cl.status,
            "entity_id": cl.entity_id,
            "period_id": cl.period_id,
            "target_close_date": cl.target_close_date.isoformat() if cl.target_close_date else None,
            "actual_close_date": cl.actual_close_date.isoformat() if cl.actual_close_date else None,
        },
        "readiness": {
            "overall_status": readiness.overall_status,
            "completion_pct": readiness.completion_pct,
            "by_status": readiness.by_status,
            "issues": readiness.issues,
        },
        "signoff_summary": signoff_summary,
        "tasks": task_exports,
        "workpaper_count": len(standalone_wps),
    }
