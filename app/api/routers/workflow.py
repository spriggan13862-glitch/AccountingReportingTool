"""Workflow tasks, review signoffs, and issue-management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.api.schemas import (
    AssignTaskRequest,
    IssueCreate,
    IssueOut,
    JEWorkflowStatusOut,
    PeriodWorkflowStatusOut,
    ResolveIssueRequest,
    SignoffActionRequest,
    SignoffCreate,
    SignoffOut,
    TaskCreate,
    TaskOut,
    UpdateTaskStatusRequest,
)
from app.services.workflow_service import (
    ReviewSignoffNotFoundError,
    ReviewSignoffStateError,
    ReviewerSeparationError,
    WorkflowIssueNotFoundError,
    WorkflowTaskNotFoundError,
    WorkflowTaskStateError,
    WorkflowValidationError,
    approve_signoff,
    assign_task,
    complete_task,
    create_issue,
    create_signoff,
    create_task,
    dismiss_issue,
    get_issue_or_raise,
    get_signoff_or_raise,
    get_task_or_raise,
    has_unresolved_critical_issues,
    list_issues,
    list_signoffs,
    list_tasks,
    reject_signoff,
    reject_task,
    resolve_issue,
    update_task_status,
)

router = APIRouter(tags=["workflow"])


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

@router.post("/workflow/tasks", response_model=TaskOut, status_code=201)
def create_workflow_task(
    organization_id: int,
    body: TaskCreate,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    try:
        return create_task(
            db,
            organization_id=organization_id,
            task_type=body.task_type,
            title=body.title,
            description=body.description,
            priority=body.priority,
            assigned_to_user_id=body.assigned_to_user_id,
            due_date=body.due_date,
            acting_user=acting_user,
        )
    except WorkflowValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/workflow/tasks", response_model=list[TaskOut])
def list_workflow_tasks(
    organization_id: int,
    status: str | None = Query(default=None),
    task_type: str | None = Query(default=None),
    assigned_to_user_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return list_tasks(db, organization_id, status=status, task_type=task_type,
                      assigned_to_user_id=assigned_to_user_id)


@router.get("/workflow/tasks/{task_id}", response_model=TaskOut)
def get_workflow_task(task_id: int, db: Session = Depends(get_db)):
    try:
        return get_task_or_raise(db, task_id)
    except WorkflowTaskNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.put("/workflow/tasks/{task_id}/assign", response_model=TaskOut)
def assign_workflow_task(
    task_id: int,
    body: AssignTaskRequest,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    try:
        return assign_task(db, task_id, body.assigned_to_user_id, acting_user=acting_user)
    except WorkflowTaskNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.put("/workflow/tasks/{task_id}/status", response_model=TaskOut)
def update_workflow_task_status(
    task_id: int,
    body: UpdateTaskStatusRequest,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    try:
        return update_task_status(
            db, task_id, body.new_status,
            reviewed_by_user_id=body.reviewed_by_user_id,
            acting_user=acting_user,
        )
    except WorkflowTaskNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except WorkflowTaskStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except WorkflowValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.put("/workflow/tasks/{task_id}/complete", response_model=TaskOut)
def complete_workflow_task(
    task_id: int,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    try:
        return complete_task(db, task_id, acting_user=acting_user)
    except WorkflowTaskNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except WorkflowTaskStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.put("/workflow/tasks/{task_id}/reject", response_model=TaskOut)
def reject_workflow_task(
    task_id: int,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    try:
        return reject_task(db, task_id, acting_user=acting_user)
    except WorkflowTaskNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except WorkflowTaskStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


# ---------------------------------------------------------------------------
# Signoffs
# ---------------------------------------------------------------------------

@router.post("/workflow/signoffs", response_model=SignoffOut, status_code=201)
def create_review_signoff(
    organization_id: int,
    body: SignoffCreate,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    try:
        return create_signoff(
            db,
            organization_id=organization_id,
            object_type=body.object_type,
            object_id=body.object_id,
            reviewer_user_id=body.reviewer_user_id,
            notes=body.notes,
            acting_user=acting_user,
        )
    except ReviewerSeparationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except WorkflowValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/workflow/signoffs/{object_type}/{object_id}", response_model=list[SignoffOut])
def list_review_signoffs(
    object_type: str,
    object_id: int,
    db: Session = Depends(get_db),
):
    return list_signoffs(db, object_type, object_id)


@router.put("/workflow/signoffs/{signoff_id}/approve", response_model=SignoffOut)
def approve_review_signoff(
    signoff_id: int,
    body: SignoffActionRequest,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    try:
        return approve_signoff(db, signoff_id, notes=body.notes, acting_user=acting_user)
    except ReviewSignoffNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ReviewSignoffStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.put("/workflow/signoffs/{signoff_id}/reject", response_model=SignoffOut)
def reject_review_signoff(
    signoff_id: int,
    body: SignoffActionRequest,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    try:
        return reject_signoff(db, signoff_id, notes=body.notes, acting_user=acting_user)
    except ReviewSignoffNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ReviewSignoffStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


# ---------------------------------------------------------------------------
# Issues
# ---------------------------------------------------------------------------

@router.post("/workflow/issues", response_model=IssueOut, status_code=201)
def create_workflow_issue(
    organization_id: int,
    body: IssueCreate,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    try:
        return create_issue(
            db,
            organization_id=organization_id,
            issue_code=body.issue_code,
            severity=body.severity,
            title=body.title,
            description=body.description,
            related_object_type=body.related_object_type,
            related_object_id=body.related_object_id,
            acting_user=acting_user,
        )
    except WorkflowValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/workflow/issues", response_model=list[IssueOut])
def list_workflow_issues(
    organization_id: int,
    status: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    related_object_type: str | None = Query(default=None),
    related_object_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return list_issues(db, organization_id, status=status, severity=severity,
                       related_object_type=related_object_type,
                       related_object_id=related_object_id)


@router.put("/workflow/issues/{issue_id}/resolve", response_model=IssueOut)
def resolve_workflow_issue(
    issue_id: int,
    body: ResolveIssueRequest,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    try:
        return resolve_issue(db, issue_id, resolution_notes=body.resolution_notes,
                             acting_user=acting_user)
    except WorkflowIssueNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.put("/workflow/issues/{issue_id}/dismiss", response_model=IssueOut)
def dismiss_workflow_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    acting_user=Depends(get_current_user),
):
    try:
        return dismiss_issue(db, issue_id, acting_user=acting_user)
    except WorkflowIssueNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ---------------------------------------------------------------------------
# Workflow status views
# ---------------------------------------------------------------------------

@router.get("/workflow/journal-entries/{je_id}", response_model=JEWorkflowStatusOut)
def je_workflow_status(je_id: int, db: Session = Depends(get_db)):
    from app.services.journal_entry_service import (
        JournalEntryNotFoundError,
        get_journal_entry_or_raise,
    )
    try:
        je = get_journal_entry_or_raise(db, je_id)
    except JournalEntryNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    signoffs = list_signoffs(db, "journal_entry", je_id)
    issues = list_issues(db, je.entity_id, related_object_type="journal_entry",
                         related_object_id=je_id)
    return JEWorkflowStatusOut(
        journal_entry_id=je_id,
        je_status=je.status,
        signoffs=signoffs,
        issues=issues,
    )


@router.get("/workflow/periods/{period_id}", response_model=PeriodWorkflowStatusOut)
def period_workflow_status(period_id: int, db: Session = Depends(get_db)):
    from app.services.accounting_period_service import (
        PeriodNotFoundError,
        get_period_or_raise,
    )
    try:
        period = get_period_or_raise(db, period_id)
    except PeriodNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    from app.models.entity import Entity
    entity = db.get(Entity, period.entity_id)
    org_id = entity.organization_id if entity else None

    signoffs = list_signoffs(db, "accounting_period", period_id)
    issues_list: list = []
    blocking = False
    if org_id:
        issues_list = list_issues(db, org_id, related_object_type="accounting_period",
                                  related_object_id=period_id)
        blocking = has_unresolved_critical_issues(
            db, org_id, "accounting_period", period_id
        )

    return PeriodWorkflowStatusOut(
        period_id=period_id,
        period_name=period.period_name,
        period_status="closed" if period.is_closed else "open",
        has_blocking_issues=blocking,
        signoffs=signoffs,
        issues=issues_list,
    )
