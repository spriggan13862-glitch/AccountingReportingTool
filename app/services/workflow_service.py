"""
Workflow service: tasks, review signoffs, and issue management.

Design
------
WorkflowTask      — standalone work items with a lifecycle (open→completed/rejected).
ReviewSignoff     — polymorphic approval records attached to any reviewable object.
WorkflowIssue     — polymorphic issue records; critical open issues block period close.

Immutability contract
---------------------
- Completed/rejected tasks are locked. Only privileged users (admin/superuser) can reopen.
- Approved/rejected signoffs are final; a new signoff must be created to re-review.
- Posted journal entry lines are never touched by workflow operations.

Reviewer/preparer separation
-----------------------------
When creating a signoff for a journal_entry, the reviewer_user_id must differ from
the JE's created_by_user_id. Superusers are exempt from this constraint.
"""

from __future__ import annotations

import datetime
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from app.models.review_signoff import ReviewSignoff, SIGNOFF_OBJECT_TYPES, SIGNOFF_STATUSES
from app.models.workflow_issue import WorkflowIssue, ISSUE_SEVERITIES, ISSUE_STATUSES
from app.models.workflow_task import WorkflowTask, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES
from app.services.permission_service import OrganizationAccessError, user_has_permission

if TYPE_CHECKING:
    from app.models.user import User


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class WorkflowTaskNotFoundError(LookupError):
    pass


class WorkflowTaskStateError(ValueError):
    """Raised when an invalid status transition is attempted on a task."""


class ReviewSignoffNotFoundError(LookupError):
    pass


class ReviewSignoffStateError(ValueError):
    """Raised when a signoff that is no longer pending is actioned."""


class WorkflowIssueNotFoundError(LookupError):
    pass


class ReviewerSeparationError(ValueError):
    """Raised when the designated reviewer is the same as the JE preparer."""


class WorkflowValidationError(ValueError):
    """Raised for invalid task type, status, priority, or object type."""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _assert_org_access(acting_user: User, org_id: int) -> None:
    if acting_user.is_superuser:
        return
    if acting_user.organization_id != org_id:
        raise OrganizationAccessError(
            f"User '{acting_user.email}' (org={acting_user.organization_id}) "
            f"cannot access workflow objects in org {org_id}"
        )


def _is_privileged(db: Session, user: User) -> bool:
    """Admin (manage_users permission) or superuser may override locked tasks."""
    return user.is_superuser or user_has_permission(db, user, "manage_users")


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

def create_task(
    db: Session,
    organization_id: int,
    task_type: str,
    title: str,
    description: str | None = None,
    priority: str = "medium",
    assigned_to_user_id: int | None = None,
    due_date: datetime.date | None = None,
    acting_user: User | None = None,
) -> WorkflowTask:
    if task_type not in TASK_TYPES:
        raise WorkflowValidationError(
            f"Unknown task type '{task_type}'. Valid: {sorted(TASK_TYPES)}"
        )
    if priority not in TASK_PRIORITIES:
        raise WorkflowValidationError(
            f"Unknown priority '{priority}'. Valid: {sorted(TASK_PRIORITIES)}"
        )
    if acting_user is not None:
        _assert_org_access(acting_user, organization_id)

    task = WorkflowTask(
        organization_id=organization_id,
        task_type=task_type,
        title=title,
        description=description,
        status="open",
        priority=priority,
        assigned_to_user_id=assigned_to_user_id,
        created_by_user_id=acting_user.id if acting_user else None,
        due_date=due_date,
        created_at=datetime.datetime.now(),
    )
    db.add(task)
    db.flush()
    db.refresh(task)
    return task


def get_task_or_raise(db: Session, task_id: int) -> WorkflowTask:
    task = db.get(WorkflowTask, task_id)
    if task is None:
        raise WorkflowTaskNotFoundError(f"Workflow task id={task_id} not found")
    return task


def assign_task(
    db: Session,
    task_id: int,
    assigned_to_user_id: int,
    acting_user: User | None = None,
) -> WorkflowTask:
    task = get_task_or_raise(db, task_id)
    if acting_user is not None:
        _assert_org_access(acting_user, task.organization_id)
    task.assigned_to_user_id = assigned_to_user_id
    task.updated_at = datetime.datetime.now()
    db.flush()
    db.refresh(task)
    return task


def update_task_status(
    db: Session,
    task_id: int,
    new_status: str,
    reviewed_by_user_id: int | None = None,
    acting_user: User | None = None,
) -> WorkflowTask:
    """
    Transition a task to new_status.

    Terminal states (completed, rejected) are locked — only users with admin or
    superuser privileges may move out of them.
    """
    if new_status not in TASK_STATUSES:
        raise WorkflowValidationError(
            f"Unknown task status '{new_status}'. Valid: {sorted(TASK_STATUSES)}"
        )

    task = get_task_or_raise(db, task_id)

    if acting_user is not None:
        _assert_org_access(acting_user, task.organization_id)

    # Terminal-state guard
    if task.status in ("completed", "rejected"):
        if acting_user is None or not _is_privileged(db, acting_user):
            raise WorkflowTaskStateError(
                f"Task {task_id} is '{task.status}' and cannot be modified without "
                f"admin or superuser privileges"
            )

    now = datetime.datetime.now()
    task.status = new_status
    task.updated_at = now
    if new_status == "completed":
        task.completed_at = now
    if reviewed_by_user_id is not None:
        task.reviewed_by_user_id = reviewed_by_user_id

    db.flush()
    db.refresh(task)
    return task


def complete_task(db: Session, task_id: int, acting_user: User | None = None) -> WorkflowTask:
    return update_task_status(db, task_id, "completed", acting_user=acting_user)


def reject_task(db: Session, task_id: int, acting_user: User | None = None) -> WorkflowTask:
    return update_task_status(db, task_id, "rejected", acting_user=acting_user)


def list_tasks(
    db: Session,
    organization_id: int,
    status: str | None = None,
    task_type: str | None = None,
    assigned_to_user_id: int | None = None,
) -> list[WorkflowTask]:
    q = db.query(WorkflowTask).filter(WorkflowTask.organization_id == organization_id)
    if status:
        q = q.filter(WorkflowTask.status == status)
    if task_type:
        q = q.filter(WorkflowTask.task_type == task_type)
    if assigned_to_user_id:
        q = q.filter(WorkflowTask.assigned_to_user_id == assigned_to_user_id)
    return q.order_by(WorkflowTask.created_at.desc()).all()


# ---------------------------------------------------------------------------
# Signoffs
# ---------------------------------------------------------------------------

def create_signoff(
    db: Session,
    organization_id: int,
    object_type: str,
    object_id: int,
    reviewer_user_id: int,
    notes: str | None = None,
    acting_user: User | None = None,
) -> ReviewSignoff:
    if object_type not in SIGNOFF_OBJECT_TYPES:
        raise WorkflowValidationError(
            f"Unknown signoff object type '{object_type}'. "
            f"Valid: {sorted(SIGNOFF_OBJECT_TYPES)}"
        )
    if acting_user is not None:
        _assert_org_access(acting_user, organization_id)

    if object_type == "journal_entry":
        _check_reviewer_separation(db, reviewer_user_id, object_id)

    signoff = ReviewSignoff(
        organization_id=organization_id,
        object_type=object_type,
        object_id=object_id,
        reviewer_user_id=reviewer_user_id,
        signoff_status="pending",
        notes=notes,
        created_at=datetime.datetime.now(),
    )
    db.add(signoff)
    db.flush()
    db.refresh(signoff)
    return signoff


def _check_reviewer_separation(db: Session, reviewer_user_id: int, je_id: int) -> None:
    """
    Raise ReviewerSeparationError if the reviewer is the JE's preparer.
    No-op when the JE has no created_by_user_id (legacy data) or when the reviewer
    is a superuser.
    """
    from app.models.journal_entry import JournalEntry
    je = db.get(JournalEntry, je_id)
    if je is None or je.created_by_user_id is None:
        return
    if je.created_by_user_id != reviewer_user_id:
        return

    from app.models.user import User
    reviewer = db.get(User, reviewer_user_id)
    if reviewer and reviewer.is_superuser:
        return

    raise ReviewerSeparationError(
        f"Reviewer (user_id={reviewer_user_id}) cannot be the same as the "
        f"journal entry preparer (created_by_user_id={je.created_by_user_id}). "
        f"Assign a different reviewer to maintain segregation of duties."
    )


def get_signoff_or_raise(db: Session, signoff_id: int) -> ReviewSignoff:
    signoff = db.get(ReviewSignoff, signoff_id)
    if signoff is None:
        raise ReviewSignoffNotFoundError(f"Review signoff id={signoff_id} not found")
    return signoff


def _transition_signoff(
    db: Session,
    signoff_id: int,
    new_status: str,
    notes: str | None,
    acting_user: User | None,
) -> ReviewSignoff:
    signoff = get_signoff_or_raise(db, signoff_id)
    if acting_user is not None:
        _assert_org_access(acting_user, signoff.organization_id)

    if signoff.signoff_status != "pending":
        raise ReviewSignoffStateError(
            f"Signoff {signoff_id} is already '{signoff.signoff_status}' "
            f"and cannot be changed; create a new signoff to re-review"
        )

    # Only the designated reviewer or a superuser may approve/reject
    if acting_user is not None:
        if not acting_user.is_superuser and acting_user.id != signoff.reviewer_user_id:
            raise ReviewSignoffStateError(
                f"User '{acting_user.email}' is not the designated reviewer "
                f"for signoff {signoff_id} (reviewer_user_id={signoff.reviewer_user_id})"
            )

    now = datetime.datetime.now()
    signoff.signoff_status = new_status
    signoff.signed_at = now
    if notes is not None:
        signoff.notes = notes

    db.flush()
    db.refresh(signoff)
    return signoff


def approve_signoff(
    db: Session,
    signoff_id: int,
    notes: str | None = None,
    acting_user: User | None = None,
) -> ReviewSignoff:
    return _transition_signoff(db, signoff_id, "approved", notes, acting_user)


def reject_signoff(
    db: Session,
    signoff_id: int,
    notes: str | None = None,
    acting_user: User | None = None,
) -> ReviewSignoff:
    return _transition_signoff(db, signoff_id, "rejected", notes, acting_user)


def list_signoffs(
    db: Session,
    object_type: str,
    object_id: int,
) -> list[ReviewSignoff]:
    return (
        db.query(ReviewSignoff)
        .filter(
            ReviewSignoff.object_type == object_type,
            ReviewSignoff.object_id == object_id,
        )
        .order_by(ReviewSignoff.created_at.desc())
        .all()
    )


# ---------------------------------------------------------------------------
# Issues
# ---------------------------------------------------------------------------

def create_issue(
    db: Session,
    organization_id: int,
    issue_code: str,
    severity: str,
    title: str,
    description: str | None = None,
    related_object_type: str | None = None,
    related_object_id: int | None = None,
    acting_user: User | None = None,
) -> WorkflowIssue:
    if severity not in ISSUE_SEVERITIES:
        raise WorkflowValidationError(
            f"Unknown severity '{severity}'. Valid: {sorted(ISSUE_SEVERITIES)}"
        )
    if acting_user is not None:
        _assert_org_access(acting_user, organization_id)

    issue = WorkflowIssue(
        organization_id=organization_id,
        related_object_type=related_object_type,
        related_object_id=related_object_id,
        issue_code=issue_code,
        severity=severity,
        title=title,
        description=description,
        status="open",
        opened_by_user_id=acting_user.id if acting_user else None,
        opened_at=datetime.datetime.now(),
    )
    db.add(issue)
    db.flush()
    db.refresh(issue)
    return issue


def get_issue_or_raise(db: Session, issue_id: int) -> WorkflowIssue:
    issue = db.get(WorkflowIssue, issue_id)
    if issue is None:
        raise WorkflowIssueNotFoundError(f"Workflow issue id={issue_id} not found")
    return issue


def resolve_issue(
    db: Session,
    issue_id: int,
    resolution_notes: str | None = None,
    acting_user: User | None = None,
) -> WorkflowIssue:
    issue = get_issue_or_raise(db, issue_id)
    if acting_user is not None:
        _assert_org_access(acting_user, issue.organization_id)
    now = datetime.datetime.now()
    issue.status = "resolved"
    issue.resolution_notes = resolution_notes
    issue.resolved_at = now
    issue.resolved_by_user_id = acting_user.id if acting_user else None
    db.flush()
    db.refresh(issue)
    return issue


def dismiss_issue(
    db: Session,
    issue_id: int,
    acting_user: User | None = None,
) -> WorkflowIssue:
    issue = get_issue_or_raise(db, issue_id)
    if acting_user is not None:
        _assert_org_access(acting_user, issue.organization_id)
    issue.status = "dismissed"
    db.flush()
    db.refresh(issue)
    return issue


def list_issues(
    db: Session,
    organization_id: int,
    status: str | None = None,
    severity: str | None = None,
    related_object_type: str | None = None,
    related_object_id: int | None = None,
) -> list[WorkflowIssue]:
    q = db.query(WorkflowIssue).filter(WorkflowIssue.organization_id == organization_id)
    if status:
        q = q.filter(WorkflowIssue.status == status)
    if severity:
        q = q.filter(WorkflowIssue.severity == severity)
    if related_object_type:
        q = q.filter(WorkflowIssue.related_object_type == related_object_type)
    if related_object_id is not None:
        q = q.filter(WorkflowIssue.related_object_id == related_object_id)
    return q.order_by(WorkflowIssue.opened_at.desc()).all()


def has_unresolved_critical_issues(
    db: Session,
    organization_id: int,
    related_object_type: str | None = None,
    related_object_id: int | None = None,
) -> bool:
    """Return True if any open or investigating critical issues exist."""
    q = db.query(WorkflowIssue).filter(
        WorkflowIssue.organization_id == organization_id,
        WorkflowIssue.severity == "critical",
        WorkflowIssue.status.in_(["open", "investigating"]),
    )
    if related_object_type:
        q = q.filter(WorkflowIssue.related_object_type == related_object_type)
    if related_object_id is not None:
        q = q.filter(WorkflowIssue.related_object_id == related_object_id)
    return db.query(q.exists()).scalar()
