"""
First-run setup endpoint.

Available ONLY when the users table is empty (no users exist).
Returns HTTP 409 once any user has been created.

This allows a fresh deployment to bootstrap the first admin without needing
shell access — useful for Docker-based alpha deployments.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.logging_config import get_logger
from app.core.security import hash_password

router = APIRouter(prefix="/setup", tags=["setup"])
logger = get_logger(__name__)


class OnboardingStatusOut(BaseModel):
    entity_count: int
    active_entity_count: int
    coa_batch_count: int           # COA imports uploaded
    coa_applied_count: int         # COA imports applied (accounts created)
    import_batch_count: int
    pending_imports: int           # mapping_required + validation_failed
    posted_imports: int
    unmapped_line_count: int
    has_journal_entries: bool
    setup_steps_complete: list[str]    # which of 6 onboarding steps are done
    setup_progress: int                # 0-100


class FirstAdminCreate(BaseModel):
    organization_name: str
    admin_email: str
    admin_full_name: str = "Administrator"
    admin_password: str


class SetupStatusOut(BaseModel):
    setup_complete: bool
    user_count: int


@router.get("/onboarding-status", response_model=OnboardingStatusOut)
def onboarding_status(db: Session = Depends(get_db)):
    """
    Return operational onboarding progress for the dashboard setup wizard.

    New COA-first workflow (M32):
      1. entity_created          — any entity exists
      2. coa_uploaded            — any COA import batch exists
      3. coa_applied             — any COA import batch with status=applied
      4. tb_uploaded             — any trial-balance ImportBatch exists
      5. mapping_exceptions_resolved — unmapped_line_count=0 AND tb batches exist
      6. first_report_generated  — at least one TB import posted to ledger
    """
    from app.models.entity import Entity
    from app.models.import_batch import ImportBatch
    from app.models.import_line import ImportLine
    from app.models.journal_entry import JournalEntry
    from app.models.coa_import_batch import COAImportBatch

    entity_count = db.query(Entity).count()
    active_entity_count = db.query(Entity).filter(Entity.active.is_(True)).count()

    coa_batch_count = db.query(COAImportBatch).count()
    coa_applied_count = (
        db.query(COAImportBatch).filter(COAImportBatch.status == "applied").count()
    )

    import_batch_count = db.query(ImportBatch).count()
    pending_imports = (
        db.query(ImportBatch)
        .filter(ImportBatch.status.in_(["mapping_required", "validation_failed"]))
        .count()
    )
    posted_imports = db.query(ImportBatch).filter(ImportBatch.status == "posted").count()

    unmapped_line_count = (
        db.query(ImportLine)
        .filter(ImportLine.mapping_status == "unmapped")
        .count()
    )

    has_journal_entries = db.query(JournalEntry).count() > 0

    steps_complete: list[str] = []
    if entity_count > 0:
        steps_complete.append("entity_created")
    if coa_batch_count > 0:
        steps_complete.append("coa_uploaded")
    if coa_applied_count > 0:
        steps_complete.append("coa_applied")
    if import_batch_count > 0:
        steps_complete.append("tb_uploaded")
    if unmapped_line_count == 0 and import_batch_count > 0:
        steps_complete.append("mapping_exceptions_resolved")
    if posted_imports > 0:
        steps_complete.append("first_report_generated")

    progress = int(len(steps_complete) / 6 * 100)

    return OnboardingStatusOut(
        entity_count=entity_count,
        active_entity_count=active_entity_count,
        coa_batch_count=coa_batch_count,
        coa_applied_count=coa_applied_count,
        import_batch_count=import_batch_count,
        pending_imports=pending_imports,
        posted_imports=posted_imports,
        unmapped_line_count=unmapped_line_count,
        has_journal_entries=has_journal_entries,
        setup_steps_complete=steps_complete,
        setup_progress=progress,
    )


@router.get("/status", response_model=SetupStatusOut)
def setup_status(db: Session = Depends(get_db)):
    """Check whether first-admin setup has been completed."""
    from app.models.user import User
    count = db.query(User).count()
    return SetupStatusOut(setup_complete=count > 0, user_count=count)


@router.post("/admin", status_code=201)
def create_first_admin(body: FirstAdminCreate, db: Session = Depends(get_db)):
    """
    Create the first organization and admin user.

    Returns HTTP 409 if any users already exist (setup already completed).
    Returns HTTP 400 if the password is too short (< 8 characters).
    """
    from app.models.user import User
    from app.services.organization_service import create_organization, seed_default_roles
    from app.services.user_service import create_user, assign_role

    existing = db.query(User).count()
    if existing > 0:
        raise HTTPException(
            status_code=409,
            detail="Setup already completed. Users exist. Use the admin panel to manage users.",
        )

    if len(body.admin_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    slug = (
        body.organization_name.lower()
        .replace(" ", "-")
        .replace(".", "")[:30]
    )

    org = create_organization(db, name=body.organization_name, slug=slug)
    seed_default_roles(db)

    admin = create_user(
        db,
        organization_id=org.id,
        email=body.admin_email.lower().strip(),
        full_name=body.admin_full_name,
        hashed_password=hash_password(body.admin_password),
        is_superuser=True,
    )
    assign_role(db, user_id=admin.id, role_name="admin", organization_id=org.id)

    logger.info(
        "first_admin_created org=%s email=%s user_id=%d",
        org.name, admin.email, admin.id,
    )

    return {
        "detail": "Setup complete.",
        "organization_id": org.id,
        "organization_name": org.name,
        "admin_user_id": admin.id,
        "admin_email": admin.email,
    }
