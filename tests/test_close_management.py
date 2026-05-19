"""
M24 close management tests.

Tests prove:
 1.  Close checklists create correctly
 2.  Close tasks create and list correctly
 3.  Task status transitions follow the state machine
 4.  Reviewer separation enforced on approve
 5.  Reviewer separation enforced on reject
 6.  Blocked tasks prevent transition to in_progress
 7.  Blocked tasks affect close readiness
 8.  Workpaper CRUD and linkage works
 9.  Support-doc attachment versioning works
10.  Close readiness calculation is accurate
11.  Signoffs (approve) persist reviewer data
12.  Reviewer comments persist in activity timeline
13.  Close binder export generates correctly
14.  Unreviewed workpapers affect readiness
15.  Workpaper review workflow (submit → review → finalize)
"""

from __future__ import annotations

import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 — ensure all tables are registered
from app.database import Base


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture(scope="module")
def seeded(db):
    from app.models.organization import Organization
    from app.models.entity import Entity
    from app.models.user import User
    from app.models.accounting_period import AccountingPeriod
    from app.services.organization_service import create_organization, seed_default_roles
    from app.core.security import hash_password

    org = create_organization(db, name="Close Test Corp", slug="close-test")
    seed_default_roles(db)

    preparer = User(
        organization_id=org.id, email="preparer@close.com",
        full_name="Preparer", hashed_password=hash_password("test1234!"),
        is_superuser=False,
    )
    reviewer = User(
        organization_id=org.id, email="reviewer@close.com",
        full_name="Reviewer", hashed_password=hash_password("test1234!"),
        is_superuser=False,
    )
    db.add(preparer)
    db.add(reviewer)

    entity = Entity(
        code="CTC-LLC", name="Close Test LLC",
        entity_type="operating", organization_id=org.id,
    )
    db.add(entity)
    db.flush()

    period = AccountingPeriod(
        entity_id=entity.id,
        period_name="Jan 2024",
        start_date=datetime.date(2024, 1, 1),
        end_date=datetime.date(2024, 1, 31),
        fiscal_year=2024,
        fiscal_period=1,
        period_type="monthly",
        is_closed=False,
    )
    db.add(period)
    db.flush()
    db.commit()

    return {
        "org": org,
        "entity": entity,
        "period": period,
        "preparer": preparer,
        "reviewer": reviewer,
    }


# ---------------------------------------------------------------------------
# 1. Checklist creation
# ---------------------------------------------------------------------------

def test_create_checklist(db, seeded):
    from app.services.close_management_service import create_checklist, get_checklist
    org = seeded["org"]
    entity = seeded["entity"]
    period = seeded["period"]

    cl = create_checklist(
        db,
        organization_id=org.id,
        name="January 2024 Monthly Close",
        close_type="monthly",
        entity_id=entity.id,
        period_id=period.id,
        target_close_date=datetime.date(2024, 2, 5),
    )
    db.commit()

    assert cl.id is not None
    assert cl.status == "open"
    assert cl.close_type == "monthly"
    assert cl.entity_id == entity.id
    assert cl.period_id == period.id

    fetched = get_checklist(db, cl.id)
    assert fetched.id == cl.id


# ---------------------------------------------------------------------------
# 2. Task creation and listing
# ---------------------------------------------------------------------------

def test_create_and_list_tasks(db, seeded):
    from app.services.close_management_service import (
        create_checklist, create_task, list_tasks
    )
    org = seeded["org"]
    preparer = seeded["preparer"]
    reviewer = seeded["reviewer"]

    cl = create_checklist(db, organization_id=org.id, name="Q1 Close Task Test")
    db.commit()

    t1 = create_task(
        db, checklist_id=cl.id, title="Cash Reconciliation",
        organization_id=org.id, task_type="reconciliation",
        assigned_to_user_id=preparer.id, reviewer_user_id=reviewer.id,
        priority="high", due_date=datetime.date(2024, 2, 3),
    )
    t2 = create_task(
        db, checklist_id=cl.id, title="AR Aging Review",
        organization_id=org.id, task_type="manual",
        priority="medium",
    )
    db.commit()

    tasks = list_tasks(db, cl.id)
    assert len(tasks) == 2
    assert t1.status == "not_started"
    assert t1.assigned_to_user_id == preparer.id
    assert t1.reviewer_user_id == reviewer.id
    assert t2.priority == "medium"


# ---------------------------------------------------------------------------
# 3. Status machine transitions
# ---------------------------------------------------------------------------

def test_task_status_transitions(db, seeded):
    from app.services.close_management_service import (
        create_checklist, create_task, transition_task, get_task
    )
    org = seeded["org"]
    preparer = seeded["preparer"]

    cl = create_checklist(db, organization_id=org.id, name="State Machine Test")
    db.commit()

    task = create_task(
        db, checklist_id=cl.id, title="Transition Test Task",
        organization_id=org.id, assigned_to_user_id=preparer.id,
    )
    db.commit()
    assert task.status == "not_started"

    task = transition_task(db, task.id, "in_progress", preparer.id)
    db.commit()
    assert task.status == "in_progress"
    assert task.started_at is not None

    task = transition_task(db, task.id, "prepared", preparer.id)
    db.commit()
    assert task.status == "prepared"
    assert task.prepared_by_user_id == preparer.id
    assert task.prepared_at is not None

    # Must submit for review before completing
    task = transition_task(db, task.id, "under_review", preparer.id)
    db.commit()
    assert task.status == "under_review"
    assert task.submitted_for_review_at is not None


# ---------------------------------------------------------------------------
# 4. Reviewer separation — approve
# ---------------------------------------------------------------------------

def test_reviewer_separation_on_approve(db, seeded):
    from app.services.close_management_service import (
        create_checklist, create_task, transition_task, approve_task,
        CloseReviewerSeparationError,
    )
    org = seeded["org"]
    preparer = seeded["preparer"]

    cl = create_checklist(db, organization_id=org.id, name="Reviewer Sep Test 1")
    db.commit()

    task = create_task(
        db, checklist_id=cl.id, title="Own-work approval test",
        organization_id=org.id, assigned_to_user_id=preparer.id,
    )
    db.commit()

    # Move to under_review as preparer
    transition_task(db, task.id, "in_progress", preparer.id)
    transition_task(db, task.id, "prepared", preparer.id)
    transition_task(db, task.id, "under_review", preparer.id)
    db.commit()

    # Same user tries to approve their own work
    with pytest.raises(CloseReviewerSeparationError):
        approve_task(db, task.id, preparer)  # preparer == prepared_by_user_id


# ---------------------------------------------------------------------------
# 5. Reviewer separation — reject
# ---------------------------------------------------------------------------

def test_reviewer_separation_on_reject(db, seeded):
    from app.services.close_management_service import (
        create_checklist, create_task, transition_task, reject_task,
        CloseReviewerSeparationError,
    )
    org = seeded["org"]
    preparer = seeded["preparer"]

    cl = create_checklist(db, organization_id=org.id, name="Reviewer Sep Test 2")
    db.commit()

    task = create_task(
        db, checklist_id=cl.id, title="Own-work rejection test",
        organization_id=org.id, assigned_to_user_id=preparer.id,
    )
    db.commit()

    transition_task(db, task.id, "in_progress", preparer.id)
    transition_task(db, task.id, "prepared", preparer.id)
    transition_task(db, task.id, "under_review", preparer.id)
    db.commit()

    with pytest.raises(CloseReviewerSeparationError):
        reject_task(db, task.id, preparer, reason="Self-review blocked")


# ---------------------------------------------------------------------------
# 6. Blockers prevent in_progress transition
# ---------------------------------------------------------------------------

def test_blockers_prevent_start(db, seeded):
    from app.services.close_management_service import (
        create_checklist, create_task, transition_task, CloseTaskStateError
    )
    org = seeded["org"]

    cl = create_checklist(db, organization_id=org.id, name="Blocker Test")
    db.commit()

    blocker = create_task(
        db, checklist_id=cl.id, title="Blocking Task",
        organization_id=org.id,
    )
    db.commit()

    dependent = create_task(
        db, checklist_id=cl.id, title="Dependent Task",
        organization_id=org.id,
        blocker_task_ids=[blocker.id],
    )
    db.commit()

    # Cannot start dependent while blocker is not_started
    with pytest.raises(CloseTaskStateError, match="blocked by"):
        transition_task(db, dependent.id, "in_progress")


# ---------------------------------------------------------------------------
# 7. Blocked tasks affect readiness
# ---------------------------------------------------------------------------

def test_blocked_tasks_in_readiness(db, seeded):
    from app.services.close_management_service import (
        create_checklist, create_task, transition_task, get_close_readiness
    )
    org = seeded["org"]

    cl = create_checklist(db, organization_id=org.id, name="Readiness Blocked Test")
    db.commit()

    task = create_task(db, checklist_id=cl.id, title="Task That Gets Blocked",
                       organization_id=org.id)
    db.commit()

    # Manually set to blocked (direct transition from in_progress)
    transition_task(db, task.id, "in_progress")
    db.commit()
    transition_task(db, task.id, "blocked")
    db.commit()

    readiness = get_close_readiness(db, cl.id)
    assert readiness.blocked_count >= 1
    assert readiness.overall_status == "Blocked"


# ---------------------------------------------------------------------------
# 8. Workpaper CRUD and task linkage
# ---------------------------------------------------------------------------

def test_workpaper_linkage(db, seeded):
    from app.services.close_management_service import (
        create_checklist, create_task, create_workpaper, add_workpaper_reference,
        get_workpaper, get_workpaper_references,
    )
    org = seeded["org"]
    preparer = seeded["preparer"]

    cl = create_checklist(db, organization_id=org.id, name="Workpaper Link Test")
    db.commit()

    task = create_task(
        db, checklist_id=cl.id, title="Cash Recon Task",
        organization_id=org.id,
    )
    db.commit()

    wp = create_workpaper(
        db, organization_id=org.id,
        title="Cash Reconciliation Workpaper",
        workpaper_type="reconciliation_support",
        close_task_id=task.id,
        preparer_user_id=preparer.id,
    )
    db.commit()

    assert wp.id is not None
    assert wp.status == "draft"
    assert wp.close_task_id == task.id

    # Add a reference
    ref = add_workpaper_reference(
        db, wp.id, reference_type="journal_entry", reference_id=1,
        notes="Opening entry reference", added_by_user_id=preparer.id,
    )
    db.commit()

    refs = get_workpaper_references(db, wp.id)
    assert len(refs) == 1
    assert refs[0].reference_type == "journal_entry"
    assert refs[0].reference_id == 1


# ---------------------------------------------------------------------------
# 9. Support-doc attachment versioning
# ---------------------------------------------------------------------------

def test_attachment_versioning(db, seeded):
    from app.services.close_management_service import (
        create_checklist, create_task, add_attachment, get_task_attachments
    )
    org = seeded["org"]

    cl = create_checklist(db, organization_id=org.id, name="Attachment Version Test")
    db.commit()

    task = create_task(db, checklist_id=cl.id, title="Versioning Task",
                       organization_id=org.id)
    db.commit()

    # First version
    a1 = add_attachment(
        db, task.id,
        attachment_label="Bank Statement",
        original_filename="bank_jan_v1.pdf",
        document_category="bank_statement",
    )
    db.commit()
    assert a1.version_number == 1
    assert a1.is_superseded == False

    # Second version — should supersede first
    a2 = add_attachment(
        db, task.id,
        attachment_label="Bank Statement",
        original_filename="bank_jan_v2.pdf",
        document_category="bank_statement",
    )
    db.commit()
    assert a2.version_number == 2

    db.refresh(a1)
    assert a1.is_superseded == True

    # Active attachments should only show v2
    active = get_task_attachments(db, task.id, include_superseded=False)
    assert all(a.attachment_label != "Bank Statement" or a.version_number == 2 for a in active)

    # With superseded should show both
    all_attach = get_task_attachments(db, task.id, include_superseded=True)
    bank_versions = [a for a in all_attach if a.attachment_label == "Bank Statement"]
    assert len(bank_versions) == 2


# ---------------------------------------------------------------------------
# 10. Close readiness calculation
# ---------------------------------------------------------------------------

def test_close_readiness_calculation(db, seeded):
    from app.services.close_management_service import (
        create_checklist, create_task, transition_task,
        approve_task, get_close_readiness
    )
    org = seeded["org"]
    preparer = seeded["preparer"]
    reviewer = seeded["reviewer"]

    cl = create_checklist(db, organization_id=org.id, name="Readiness Calc Test",
                          target_close_date=datetime.date(2024, 2, 10))
    db.commit()

    # 2 required tasks, 1 optional
    t1 = create_task(db, checklist_id=cl.id, title="Required Task 1",
                     organization_id=org.id, is_required=True)
    t2 = create_task(db, checklist_id=cl.id, title="Required Task 2",
                     organization_id=org.id, is_required=True)
    t3 = create_task(db, checklist_id=cl.id, title="Optional Task",
                     organization_id=org.id, is_required=False)
    db.commit()

    readiness = get_close_readiness(db, cl.id)
    assert readiness.required_tasks == 2
    assert readiness.total_tasks == 3
    assert readiness.completion_pct == 0.0
    assert readiness.overall_status == "Not Started"

    # Complete required task 1 (preparer → reviewer approval path)
    transition_task(db, t1.id, "in_progress", preparer.id)
    transition_task(db, t1.id, "prepared", preparer.id)
    transition_task(db, t1.id, "under_review", preparer.id)
    db.commit()
    # Reviewer approves
    approve_task(db, t1.id, reviewer)
    db.commit()

    readiness = get_close_readiness(db, cl.id)
    assert readiness.completion_pct == 50.0  # 1 of 2 required complete
    assert readiness.overall_status == "In Progress"

    # Complete required task 2
    transition_task(db, t2.id, "in_progress", preparer.id)
    transition_task(db, t2.id, "prepared", preparer.id)
    transition_task(db, t2.id, "under_review", preparer.id)
    approve_task(db, t2.id, reviewer)
    db.commit()

    readiness = get_close_readiness(db, cl.id)
    assert readiness.completion_pct == 100.0
    assert readiness.overall_status == "Ready to Close"


# ---------------------------------------------------------------------------
# 11. Signoffs persist reviewer data
# ---------------------------------------------------------------------------

def test_signoff_persists_reviewer(db, seeded):
    from app.services.close_management_service import (
        create_checklist, create_task, transition_task, approve_task, get_task
    )
    org = seeded["org"]
    preparer = seeded["preparer"]
    reviewer = seeded["reviewer"]

    cl = create_checklist(db, organization_id=org.id, name="Signoff Persist Test")
    db.commit()

    task = create_task(
        db, checklist_id=cl.id, title="Reviewer Tracked Task",
        organization_id=org.id, assigned_to_user_id=preparer.id,
    )
    db.commit()

    transition_task(db, task.id, "in_progress", preparer.id)
    transition_task(db, task.id, "prepared", preparer.id)
    transition_task(db, task.id, "under_review", preparer.id)
    approve_task(db, task.id, reviewer, comment="Looks good.")
    db.commit()

    t = get_task(db, task.id)
    assert t.status == "completed"
    assert t.reviewed_by_user_id == reviewer.id
    assert t.completed_at is not None
    assert t.prepared_by_user_id == preparer.id


# ---------------------------------------------------------------------------
# 12. Reviewer comments activity timeline
# ---------------------------------------------------------------------------

def test_activity_timeline_via_comments(db, seeded):
    from app.services.close_management_service import (
        create_checklist, create_task, transition_task,
        add_comment, get_task_comments
    )
    org = seeded["org"]
    preparer = seeded["preparer"]

    cl = create_checklist(db, organization_id=org.id, name="Comment Timeline Test")
    db.commit()

    task = create_task(db, checklist_id=cl.id, title="Comment Task",
                       organization_id=org.id)
    db.commit()

    add_comment(db, task.id, preparer.id, "Starting the cash tie-out now.")
    db.commit()

    transition_task(db, task.id, "in_progress", preparer.id, "Beginning work.")
    db.commit()

    add_comment(db, task.id, preparer.id, "Found a $500 variance, investigating.")
    db.commit()

    comments = get_task_comments(db, task.id)
    assert len(comments) >= 3  # manual comment + status_change + manual comment

    # Status changes should be recorded
    status_changes = [c for c in comments if c.comment_type == "status_change"]
    assert len(status_changes) >= 1
    assert any(c.prior_status == "not_started" and c.new_status == "in_progress" for c in status_changes)


# ---------------------------------------------------------------------------
# 13. Close binder export
# ---------------------------------------------------------------------------

def test_close_binder_export(db, seeded):
    from app.services.close_management_service import (
        create_checklist, create_task, add_comment,
        export_close_binder, add_attachment,
    )
    org = seeded["org"]
    preparer = seeded["preparer"]

    cl = create_checklist(db, organization_id=org.id, name="Export Binder Test",
                          close_type="quarterly")
    db.commit()

    task = create_task(db, checklist_id=cl.id, title="Binder Task",
                       organization_id=org.id)
    db.commit()

    add_comment(db, task.id, preparer.id, "Added support documentation.")
    add_attachment(db, task.id, "Support Doc", "support.pdf")
    db.commit()

    binder = export_close_binder(db, cl.id)
    assert binder["checklist"]["id"] == cl.id
    assert binder["checklist"]["close_type"] == "quarterly"
    assert binder["readiness"]["overall_status"] is not None
    assert len(binder["tasks"]) == 1
    assert binder["tasks"][0]["title"] == "Binder Task"
    assert len(binder["tasks"][0]["comments"]) >= 1
    assert len(binder["tasks"][0]["attachments"]) == 1
    assert "generated_at" in binder


# ---------------------------------------------------------------------------
# 14. Unreviewed workpapers affect readiness
# ---------------------------------------------------------------------------

def test_unreviewed_workpapers_affect_readiness(db, seeded):
    from app.services.close_management_service import (
        create_checklist, create_task, create_workpaper,
        get_close_readiness, transition_task, approve_task
    )
    org = seeded["org"]
    preparer = seeded["preparer"]
    reviewer = seeded["reviewer"]

    cl = create_checklist(db, organization_id=org.id, name="WP Readiness Test")
    db.commit()

    task = create_task(db, checklist_id=cl.id, title="WP Task",
                       organization_id=org.id, is_required=True)
    db.commit()

    # Create workpaper attached to this task (still draft)
    wp = create_workpaper(
        db, organization_id=org.id,
        title="Draft WP",
        close_task_id=task.id,
    )
    db.commit()

    # Complete the task but workpaper is still draft
    transition_task(db, task.id, "in_progress", preparer.id)
    transition_task(db, task.id, "prepared", preparer.id)
    transition_task(db, task.id, "under_review", preparer.id)
    approve_task(db, task.id, reviewer)
    db.commit()

    readiness = get_close_readiness(db, cl.id)
    # Tasks all complete but workpaper is unreviewed
    assert readiness.unreviewed_workpapers >= 1
    # Cannot be "Ready to Close" because of unreviewed WP
    assert readiness.overall_status != "Ready to Close"


# ---------------------------------------------------------------------------
# 15. Workpaper review workflow
# ---------------------------------------------------------------------------

def test_workpaper_review_workflow(db, seeded):
    from app.services.close_management_service import (
        create_workpaper, submit_workpaper, review_workpaper, finalize_workpaper,
        get_workpaper, CloseReviewerSeparationError, WorkpaperStateError,
    )
    org = seeded["org"]
    preparer = seeded["preparer"]
    reviewer = seeded["reviewer"]

    wp = create_workpaper(
        db, organization_id=org.id,
        title="Full Review Lifecycle WP",
        workpaper_type="variance_analysis",
        preparer_user_id=preparer.id,
        reviewer_user_id=reviewer.id,
    )
    db.commit()
    assert wp.status == "draft"

    # Submit for review
    wp = submit_workpaper(db, wp.id, preparer.id)
    db.commit()
    assert wp.status == "prepared"
    assert wp.prepared_at is not None

    # Preparer cannot review own work
    with pytest.raises(CloseReviewerSeparationError):
        review_workpaper(db, wp.id, preparer, approved=True)

    # Reviewer approves
    wp = review_workpaper(db, wp.id, reviewer, approved=True, comment="Approved after review.")
    db.commit()
    assert wp.status == "reviewed"
    assert wp.reviewed_by_user_id == reviewer.id
    assert wp.reviewer_comment == "Approved after review."

    # Finalize
    wp = finalize_workpaper(db, wp.id, reviewer.id)
    db.commit()
    assert wp.status == "finalized"
    assert wp.finalized_at is not None

    # Cannot finalize again
    with pytest.raises(WorkpaperStateError):
        finalize_workpaper(db, wp.id, reviewer.id)
