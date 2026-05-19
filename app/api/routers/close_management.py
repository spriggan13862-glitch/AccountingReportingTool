"""
Close management router — M24.

Checklists:
  POST /close/checklists/                              — create checklist
  GET  /close/checklists/                              — list checklists
  GET  /close/checklists/{id}                          — get checklist
  PATCH /close/checklists/{id}/status                  — update status

Tasks:
  POST /close/checklists/{id}/tasks/                   — create task
  GET  /close/checklists/{id}/tasks/                   — list tasks
  GET  /close/tasks/{task_id}                          — get task
  PUT  /close/tasks/{task_id}/assign                   — assign task
  POST /close/tasks/{task_id}/transition               — generic status transition
  POST /close/tasks/{task_id}/submit-review            — prepared → under_review
  POST /close/tasks/{task_id}/approve                  — under_review → completed
  POST /close/tasks/{task_id}/reject                   — under_review → rejected

Comments / Attachments:
  POST /close/tasks/{task_id}/comments/                — add comment
  GET  /close/tasks/{task_id}/comments/                — list comments
  POST /close/tasks/{task_id}/attachments/             — add attachment
  GET  /close/tasks/{task_id}/attachments/             — list attachments

Readiness / Export:
  GET  /close/checklists/{id}/readiness                — close readiness
  GET  /close/checklists/{id}/export                   — binder export

Workpapers:
  POST /close/workpapers/                              — create workpaper
  GET  /close/workpapers/                              — list workpapers
  GET  /close/workpapers/{wp_id}                       — get workpaper
  POST /close/workpapers/{wp_id}/submit                — draft → prepared
  POST /close/workpapers/{wp_id}/review                — review workpaper
  POST /close/workpapers/{wp_id}/finalize              — reviewed → finalized
  POST /close/workpapers/{wp_id}/references/           — add reference
  GET  /close/workpapers/{wp_id}/references/           — list references
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user, get_required_user
from app.api.schemas import (
    AssignTaskRequest,
    CloseChecklistCreate,
    CloseChecklistOut,
    CloseReadinessOut,
    CloseTaskAttachmentCreate,
    CloseTaskAttachmentOut,
    CloseTaskCommentCreate,
    CloseTaskCommentOut,
    CloseTaskCreate,
    CloseTaskOut,
    CloseTaskStatusUpdate,
    RejectTaskRequest,
    ReviewActionRequest,
    WorkpaperCreate,
    WorkpaperOut,
    WorkpaperReferenceCreate,
    WorkpaperReferenceOut,
    WorkpaperReviewRequest,
)
from app.services import close_management_service as svc
from app.services.close_management_service import (
    CloseChecklistNotFoundError,
    CloseManagementError,
    CloseReviewerSeparationError,
    CloseTaskNotFoundError,
    CloseTaskStateError,
    WorkpaperNotFoundError,
    WorkpaperStateError,
)

router = APIRouter(prefix="/close", tags=["close-management"])


def _not_found(exc: Exception) -> HTTPException:
    return HTTPException(status_code=404, detail=str(exc))


def _conflict(exc: Exception) -> HTTPException:
    return HTTPException(status_code=409, detail=str(exc))


def _unprocessable(exc: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc))


def _handle(exc: Exception) -> HTTPException:
    if isinstance(exc, (CloseChecklistNotFoundError, CloseTaskNotFoundError, WorkpaperNotFoundError)):
        return _not_found(exc)
    if isinstance(exc, CloseReviewerSeparationError):
        return _unprocessable(exc)
    if isinstance(exc, (CloseTaskStateError, WorkpaperStateError)):
        return _conflict(exc)
    return HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# Checklists
# ---------------------------------------------------------------------------

@router.post("/checklists/", response_model=CloseChecklistOut, status_code=201)
def create_checklist(
    body: CloseChecklistCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        cl = svc.create_checklist(
            db,
            organization_id=body.organization_id,
            name=body.name,
            close_type=body.close_type,
            entity_id=body.entity_id,
            period_id=body.period_id,
            target_close_date=body.target_close_date,
            notes=body.notes,
            created_by_user_id=getattr(current_user, "id", None),
        )
        db.commit()
        db.refresh(cl)
        return cl
    except CloseManagementError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/checklists/", response_model=list[CloseChecklistOut])
def list_checklists(
    organization_id: int = Query(...),
    entity_id: int | None = Query(None),
    period_id: int | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    return svc.list_checklists(db, organization_id, entity_id, period_id, status, limit, offset)


@router.get("/checklists/{checklist_id}", response_model=CloseChecklistOut)
def get_checklist(checklist_id: int, db: Session = Depends(get_db)):
    try:
        return svc.get_checklist(db, checklist_id)
    except CloseChecklistNotFoundError as exc:
        raise _not_found(exc)


@router.patch("/checklists/{checklist_id}/status", response_model=CloseChecklistOut)
def update_checklist_status(
    checklist_id: int,
    body: CloseTaskStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
):
    try:
        cl = svc.update_checklist_status(
            db, checklist_id, body.new_status,
            acting_user_id=getattr(current_user, "id", None),
        )
        db.commit()
        db.refresh(cl)
        return cl
    except (CloseChecklistNotFoundError, CloseManagementError) as exc:
        db.rollback()
        raise _handle(exc)


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

@router.post("/checklists/{checklist_id}/tasks/", response_model=CloseTaskOut, status_code=201)
def create_task(
    checklist_id: int,
    body: CloseTaskCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        cl = svc.get_checklist(db, checklist_id)
        task = svc.create_task(
            db,
            checklist_id=checklist_id,
            title=body.title,
            organization_id=cl.organization_id,
            task_type=body.task_type,
            description=body.description,
            priority=body.priority,
            assigned_to_user_id=body.assigned_to_user_id,
            reviewer_user_id=body.reviewer_user_id,
            due_date=body.due_date,
            entity_id=body.entity_id,
            sort_order=body.sort_order,
            notes=body.notes,
            blocker_task_ids=body.blocker_task_ids,
            is_required=body.is_required,
            linked_reconciliation_id=body.linked_reconciliation_id,
            linked_import_batch_id=body.linked_import_batch_id,
        )
        db.commit()
        db.refresh(task)
        return task
    except (CloseChecklistNotFoundError, CloseManagementError) as exc:
        db.rollback()
        raise _handle(exc)


@router.get("/checklists/{checklist_id}/tasks/", response_model=list[CloseTaskOut])
def list_tasks(
    checklist_id: int,
    status: str | None = Query(None),
    assigned_to: int | None = Query(None),
    db: Session = Depends(get_db),
):
    return svc.list_tasks(db, checklist_id, status, assigned_to)


@router.get("/tasks/{task_id}", response_model=CloseTaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    try:
        return svc.get_task(db, task_id)
    except CloseTaskNotFoundError as exc:
        raise _not_found(exc)


@router.put("/tasks/{task_id}/assign", response_model=CloseTaskOut)
def assign_task(
    task_id: int,
    body: AssignTaskRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        task = svc.assign_task(db, task_id, body.assigned_to_user_id, body.reviewer_user_id)
        db.commit()
        db.refresh(task)
        return task
    except (CloseTaskNotFoundError, CloseManagementError) as exc:
        db.rollback()
        raise _handle(exc)


@router.post("/tasks/{task_id}/transition", response_model=CloseTaskOut)
def transition_task(
    task_id: int,
    body: CloseTaskStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        task = svc.transition_task(
            db, task_id, body.new_status,
            acting_user_id=getattr(current_user, "id", None),
            comment=body.comment,
        )
        db.commit()
        db.refresh(task)
        return task
    except (CloseTaskNotFoundError, CloseTaskStateError, CloseManagementError) as exc:
        db.rollback()
        raise _handle(exc)


@router.post("/tasks/{task_id}/submit-review", response_model=CloseTaskOut)
def submit_for_review(
    task_id: int,
    body: ReviewActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        task = svc.submit_for_review(
            db, task_id,
            acting_user_id=getattr(current_user, "id", None),
            comment=body.comment,
        )
        db.commit()
        db.refresh(task)
        return task
    except (CloseTaskNotFoundError, CloseTaskStateError) as exc:
        db.rollback()
        raise _handle(exc)


@router.post("/tasks/{task_id}/approve", response_model=CloseTaskOut)
def approve_task(
    task_id: int,
    body: ReviewActionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
):
    try:
        task = svc.approve_task(db, task_id, current_user, body.comment)
        db.commit()
        db.refresh(task)
        return task
    except (CloseTaskNotFoundError, CloseReviewerSeparationError, CloseTaskStateError) as exc:
        db.rollback()
        raise _handle(exc)


@router.post("/tasks/{task_id}/reject", response_model=CloseTaskOut)
def reject_task(
    task_id: int,
    body: RejectTaskRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
):
    try:
        task = svc.reject_task(db, task_id, current_user, body.reason)
        db.commit()
        db.refresh(task)
        return task
    except (CloseTaskNotFoundError, CloseReviewerSeparationError, CloseTaskStateError) as exc:
        db.rollback()
        raise _handle(exc)


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

@router.post("/tasks/{task_id}/comments/", response_model=CloseTaskCommentOut, status_code=201)
def add_comment(
    task_id: int,
    body: CloseTaskCommentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        cmt = svc.add_comment(
            db, task_id,
            author_user_id=getattr(current_user, "id", None),
            comment_text=body.comment_text,
        )
        db.commit()
        db.refresh(cmt)
        return cmt
    except CloseTaskNotFoundError as exc:
        db.rollback()
        raise _not_found(exc)


@router.get("/tasks/{task_id}/comments/", response_model=list[CloseTaskCommentOut])
def list_comments(task_id: int, db: Session = Depends(get_db)):
    return svc.get_task_comments(db, task_id)


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

@router.post("/tasks/{task_id}/attachments/", response_model=CloseTaskAttachmentOut, status_code=201)
def add_attachment(
    task_id: int,
    body: CloseTaskAttachmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        attach = svc.add_attachment(
            db, task_id,
            attachment_label=body.attachment_label,
            original_filename=body.original_filename,
            document_id=body.document_id,
            document_category=body.document_category,
            uploaded_by_user_id=getattr(current_user, "id", None),
            notes=body.notes,
        )
        db.commit()
        db.refresh(attach)
        return attach
    except (CloseTaskNotFoundError, CloseManagementError) as exc:
        db.rollback()
        raise _handle(exc)


@router.get("/tasks/{task_id}/attachments/", response_model=list[CloseTaskAttachmentOut])
def list_attachments(
    task_id: int,
    include_superseded: bool = Query(False),
    db: Session = Depends(get_db),
):
    return svc.get_task_attachments(db, task_id, include_superseded)


# ---------------------------------------------------------------------------
# Close readiness & export
# ---------------------------------------------------------------------------

@router.get("/checklists/{checklist_id}/readiness", response_model=CloseReadinessOut)
def get_readiness(checklist_id: int, db: Session = Depends(get_db)):
    try:
        r = svc.get_close_readiness(db, checklist_id)
        return CloseReadinessOut(
            checklist_id=r.checklist_id,
            overall_status=r.overall_status,
            completion_pct=r.completion_pct,
            total_tasks=r.total_tasks,
            required_tasks=r.required_tasks,
            by_status=r.by_status,
            overdue_count=r.overdue_count,
            blocked_count=r.blocked_count,
            tasks_under_review=r.tasks_under_review,
            unreviewed_workpapers=r.unreviewed_workpapers,
            issues=r.issues,
        )
    except CloseChecklistNotFoundError as exc:
        raise _not_found(exc)


@router.get("/checklists/{checklist_id}/export")
def export_binder(checklist_id: int, db: Session = Depends(get_db)):
    try:
        return svc.export_close_binder(db, checklist_id)
    except CloseChecklistNotFoundError as exc:
        raise _not_found(exc)


# ---------------------------------------------------------------------------
# Workpapers
# ---------------------------------------------------------------------------

@router.post("/workpapers/", response_model=WorkpaperOut, status_code=201)
def create_workpaper(
    body: WorkpaperCreate,
    organization_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        wp = svc.create_workpaper(
            db,
            organization_id=organization_id,
            title=body.title,
            workpaper_type=body.workpaper_type,
            entity_id=body.entity_id,
            period_id=body.period_id,
            close_task_id=body.close_task_id,
            description=body.description,
            preparer_user_id=body.preparer_user_id,
            reviewer_user_id=body.reviewer_user_id,
            created_by_user_id=getattr(current_user, "id", None),
        )
        db.commit()
        db.refresh(wp)
        return wp
    except CloseManagementError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/workpapers/", response_model=list[WorkpaperOut])
def list_workpapers(
    organization_id: int = Query(...),
    entity_id: int | None = Query(None),
    period_id: int | None = Query(None),
    status: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return svc.list_workpapers(db, organization_id, entity_id, period_id, status)


@router.get("/workpapers/{wp_id}", response_model=WorkpaperOut)
def get_workpaper(wp_id: int, db: Session = Depends(get_db)):
    try:
        return svc.get_workpaper(db, wp_id)
    except WorkpaperNotFoundError as exc:
        raise _not_found(exc)


@router.post("/workpapers/{wp_id}/submit", response_model=WorkpaperOut)
def submit_workpaper(
    wp_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        wp = svc.submit_workpaper(db, wp_id, getattr(current_user, "id", None))
        db.commit()
        db.refresh(wp)
        return wp
    except (WorkpaperNotFoundError, WorkpaperStateError) as exc:
        db.rollback()
        raise _handle(exc)


@router.post("/workpapers/{wp_id}/review", response_model=WorkpaperOut)
def review_workpaper(
    wp_id: int,
    body: WorkpaperReviewRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
):
    try:
        wp = svc.review_workpaper(db, wp_id, current_user, body.approved, body.comment)
        db.commit()
        db.refresh(wp)
        return wp
    except (WorkpaperNotFoundError, WorkpaperStateError, CloseReviewerSeparationError) as exc:
        db.rollback()
        raise _handle(exc)


@router.post("/workpapers/{wp_id}/finalize", response_model=WorkpaperOut)
def finalize_workpaper(
    wp_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_required_user),
):
    try:
        wp = svc.finalize_workpaper(db, wp_id, getattr(current_user, "id", None))
        db.commit()
        db.refresh(wp)
        return wp
    except (WorkpaperNotFoundError, WorkpaperStateError) as exc:
        db.rollback()
        raise _handle(exc)


@router.post("/workpapers/{wp_id}/references/", response_model=WorkpaperReferenceOut, status_code=201)
def add_reference(
    wp_id: int,
    body: WorkpaperReferenceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        ref = svc.add_workpaper_reference(
            db, wp_id,
            reference_type=body.reference_type,
            reference_id=body.reference_id,
            notes=body.notes,
            added_by_user_id=getattr(current_user, "id", None),
        )
        db.commit()
        db.refresh(ref)
        return ref
    except (WorkpaperNotFoundError, CloseManagementError) as exc:
        db.rollback()
        raise _handle(exc)


@router.get("/workpapers/{wp_id}/references/", response_model=list[WorkpaperReferenceOut])
def list_references(wp_id: int, db: Session = Depends(get_db)):
    try:
        return svc.get_workpaper_references(db, wp_id)
    except WorkpaperNotFoundError as exc:
        raise _not_found(exc)
