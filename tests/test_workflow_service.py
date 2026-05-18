"""
M14 proof-point tests: workflow tasks, signoffs, issue management, and close-process controls.

Tests
-----
1.  Tasks create and assign correctly
2.  Signoff approve flow works correctly
3.  Signoff reject flow works correctly
4.  Reviewer/preparer separation enforced for JE signoffs
5.  Unresolved critical issues block period close; resolve unblocks
6.  Issues resolve and dismiss correctly
7.  Organization isolation enforced for workflow objects
8.  Completed tasks are locked; admin can unlock
9.  JE workflow: full preparer→reviewer signoff flow
10. Multiple signoffs supported on the same object
11. Signoff history preserved after approval
"""

import datetime
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.account import Account
from app.models.entity import Entity
from app.models.scenario import Scenario
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
from app.services.accounting_period_service import (
    BlockedByCriticalIssueError,
    close_period,
    create_period,
)
from app.services.journal_entry_service import post_journal_entry
from app.services.organization_service import create_organization, seed_default_roles
from app.services.permission_service import OrganizationAccessError
from app.services.user_service import assign_role, create_user
from app.services.workflow_service import (
    ReviewSignoffStateError,
    ReviewerSeparationError,
    WorkflowTaskStateError,
    WorkflowValidationError,
    approve_signoff,
    assign_task,
    complete_task,
    create_issue,
    create_signoff,
    create_task,
    dismiss_issue,
    list_signoffs,
    reject_signoff,
    resolve_issue,
    update_task_status,
)


# ---------------------------------------------------------------------------
# Module-scoped seeded session
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def seeded_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = Session()

    # Organizations
    org_a = create_organization(db, name="Org Alpha", slug="alpha")
    org_b = create_organization(db, name="Org Beta", slug="beta")
    seed_default_roles(db)

    # Org A users
    admin = create_user(db, org_a.id, "admin@a.com", "Admin A")
    assign_role(db, admin.id, "admin", org_a.id)

    accountant = create_user(db, org_a.id, "acct@a.com", "Accountant")
    assign_role(db, accountant.id, "accountant", org_a.id)

    reviewer = create_user(db, org_a.id, "rev@a.com", "Reviewer")
    assign_role(db, reviewer.id, "reviewer", org_a.id)

    # Org B user (for cross-org tests)
    other_user = create_user(db, org_b.id, "user@b.com", "Other Org User")
    assign_role(db, other_user.id, "accountant", org_b.id)

    # Entity + accounts
    entity_a = Entity(code="EA", name="Entity Alpha", entity_type="operating",
                      currency="USD", organization_id=org_a.id)
    db.add(entity_a)
    db.flush()

    cash = Account(entity_id=entity_a.id, account_number="1000", account_name="Cash",
                   account_type="asset", normal_balance="debit")
    rev_acc = Account(entity_id=entity_a.id, account_number="4000", account_name="Revenue",
                      account_type="revenue", normal_balance="credit")
    re_acc = Account(entity_id=entity_a.id, account_number="3900", account_name="RE",
                     account_type="equity", normal_balance="credit")
    for acc in (cash, rev_acc, re_acc):
        db.add(acc)
    db.flush()

    scenario = Scenario(code="ACT", name="Actual", scenario_type="actual")
    db.add(scenario)
    db.flush()

    # A posted JE prepared by the accountant
    je = post_journal_entry(db, JournalEntryCreate(
        je_number="JE-WF-001",
        entry_date=datetime.date(2024, 3, 15),
        entity_id=entity_a.id,
        scenario_id=scenario.id,
        description="Workflow test JE",
        source="test",
        lines=[
            JournalEntryLineCreate(line_number=1, account_id=cash.id, entity_id=entity_a.id,
                                   debit=Decimal("1000"), credit=Decimal("0")),
            JournalEntryLineCreate(line_number=2, account_id=rev_acc.id, entity_id=entity_a.id,
                                   debit=Decimal("0"), credit=Decimal("1000")),
        ],
    ), acting_user=accountant)

    db.commit()

    yield db, {
        "org_a": org_a, "org_b": org_b,
        "admin": admin, "accountant": accountant, "reviewer": reviewer,
        "other_user": other_user,
        "entity_a": entity_a,
        "cash": cash, "rev_acc": rev_acc, "re_acc": re_acc,
        "scenario": scenario,
        "je": je,
    }

    db.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def s(seeded_session):
    db, d = seeded_session
    db.begin_nested()
    yield db, d
    db.rollback()


# ---------------------------------------------------------------------------
# Test 1: Tasks create and assign correctly
# ---------------------------------------------------------------------------

def test_task_create_and_assign(s):
    db, d = s
    task = create_task(
        db,
        organization_id=d["org_a"].id,
        task_type="journal_entry_review",
        title="Review March revenue JE",
        priority="high",
        acting_user=d["accountant"],
    )
    assert task.id is not None
    assert task.status == "open"
    assert task.priority == "high"
    assert task.created_by_user_id == d["accountant"].id

    task = assign_task(db, task.id, assigned_to_user_id=d["reviewer"].id,
                       acting_user=d["admin"])
    assert task.assigned_to_user_id == d["reviewer"].id
    assert task.updated_at is not None


# ---------------------------------------------------------------------------
# Test 2: Signoff approve flow
# ---------------------------------------------------------------------------

def test_signoff_approve(s):
    db, d = s
    signoff = create_signoff(
        db,
        organization_id=d["org_a"].id,
        object_type="journal_entry",
        object_id=d["je"].id,
        reviewer_user_id=d["reviewer"].id,
    )
    assert signoff.signoff_status == "pending"
    assert signoff.signed_at is None

    approved = approve_signoff(db, signoff.id, notes="Looks good.",
                               acting_user=d["reviewer"])
    assert approved.signoff_status == "approved"
    assert approved.signed_at is not None
    assert approved.notes == "Looks good."


# ---------------------------------------------------------------------------
# Test 3: Signoff reject flow
# ---------------------------------------------------------------------------

def test_signoff_reject(s):
    db, d = s
    signoff = create_signoff(
        db,
        organization_id=d["org_a"].id,
        object_type="journal_entry",
        object_id=d["je"].id,
        reviewer_user_id=d["reviewer"].id,
    )
    rejected = reject_signoff(db, signoff.id, notes="Missing documentation.",
                               acting_user=d["reviewer"])
    assert rejected.signoff_status == "rejected"
    assert rejected.signed_at is not None


# ---------------------------------------------------------------------------
# Test 4: Reviewer/preparer separation enforced
# ---------------------------------------------------------------------------

def test_reviewer_separation_enforced(s):
    db, d = s
    # accountant created the JE; accountant cannot also be the reviewer
    with pytest.raises(ReviewerSeparationError, match="segregation of duties"):
        create_signoff(
            db,
            organization_id=d["org_a"].id,
            object_type="journal_entry",
            object_id=d["je"].id,
            reviewer_user_id=d["accountant"].id,  # same as JE creator
        )


def test_reviewer_separation_allows_different_user(s):
    db, d = s
    # reviewer is different from accountant → should succeed
    signoff = create_signoff(
        db,
        organization_id=d["org_a"].id,
        object_type="journal_entry",
        object_id=d["je"].id,
        reviewer_user_id=d["reviewer"].id,
    )
    assert signoff.id is not None


# ---------------------------------------------------------------------------
# Test 5: Unresolved critical issues block period close
# ---------------------------------------------------------------------------

def test_critical_issues_block_close(s):
    db, d = s
    period = create_period(
        db, entity_id=d["entity_a"].id,
        period_name="April 2024",
        start_date=datetime.date(2024, 4, 1),
        end_date=datetime.date(2024, 4, 30),
        fiscal_year=2024, fiscal_period=4,
    )
    issue = create_issue(
        db, d["org_a"].id,
        issue_code="UNRECONCILED_BALANCE",
        severity="critical",
        title="Unreconciled cash balance",
        related_object_type="accounting_period",
        related_object_id=period.id,
    )

    with pytest.raises(BlockedByCriticalIssueError, match="unresolved critical issues"):
        close_period(
            db, period.id,
            re_account_id=d["re_acc"].id,
            scenario_id=d["scenario"].id,
            closing_je_number="CL-APR-2024",
        )

    resolve_issue(db, issue.id, resolution_notes="Balance confirmed.")

    result = close_period(
        db, period.id,
        re_account_id=d["re_acc"].id,
        scenario_id=d["scenario"].id,
        closing_je_number="CL-APR-2024",
    )
    assert result.period.is_closed


# ---------------------------------------------------------------------------
# Test 6: Issues resolve and dismiss correctly
# ---------------------------------------------------------------------------

def test_issue_resolve(s):
    db, d = s
    issue = create_issue(
        db, d["org_a"].id, "MAPPING_GAP", "warning",
        "Account mapping missing for 5000-series",
        acting_user=d["accountant"],
    )
    assert issue.status == "open"
    assert issue.opened_by_user_id == d["accountant"].id

    resolved = resolve_issue(db, issue.id, resolution_notes="Mapping added.",
                             acting_user=d["admin"])
    assert resolved.status == "resolved"
    assert resolved.resolution_notes == "Mapping added."
    assert resolved.resolved_by_user_id == d["admin"].id
    assert resolved.resolved_at is not None


def test_issue_dismiss(s):
    db, d = s
    issue = create_issue(db, d["org_a"].id, "FALSE_POSITIVE", "info", "Not an issue")
    dismissed = dismiss_issue(db, issue.id)
    assert dismissed.status == "dismissed"


# ---------------------------------------------------------------------------
# Test 7: Organization isolation
# ---------------------------------------------------------------------------

def test_task_org_isolation(s):
    db, d = s
    task = create_task(
        db, organization_id=d["org_a"].id,
        task_type="close_task", title="Org A task",
    )
    with pytest.raises(OrganizationAccessError):
        assign_task(db, task.id, assigned_to_user_id=d["other_user"].id,
                    acting_user=d["other_user"])


def test_issue_org_isolation(s):
    db, d = s
    issue = create_issue(db, d["org_a"].id, "ORG_A_ISSUE", "warning", "Org A issue")
    with pytest.raises(OrganizationAccessError):
        resolve_issue(db, issue.id, acting_user=d["other_user"])


# ---------------------------------------------------------------------------
# Test 8: Completed tasks lock; admin can unlock
# ---------------------------------------------------------------------------

def test_completed_task_locked(s):
    db, d = s
    task = create_task(db, d["org_a"].id, "close_task", "Complete and lock test")
    complete_task(db, task.id)
    assert task.status == "completed"

    # Non-privileged user (reviewer has post/reverse/view, not manage_users)
    with pytest.raises(WorkflowTaskStateError, match="admin or superuser"):
        update_task_status(db, task.id, "in_progress", acting_user=d["reviewer"])


def test_admin_can_reopen_completed_task(s):
    db, d = s
    task = create_task(db, d["org_a"].id, "reconciliation", "Admin unlock test")
    complete_task(db, task.id)

    reopened = update_task_status(db, task.id, "in_progress", acting_user=d["admin"])
    assert reopened.status == "in_progress"


# ---------------------------------------------------------------------------
# Test 9: JE workflow — full preparer→reviewer signoff cycle
# ---------------------------------------------------------------------------

def test_je_full_workflow(s):
    db, d = s
    # 1. Create a review task
    task = create_task(
        db, d["org_a"].id,
        task_type="journal_entry_review",
        title=f"Review JE {d['je'].je_number}",
        assigned_to_user_id=d["reviewer"].id,
        acting_user=d["accountant"],
    )
    # 2. Reviewer submits signoff
    signoff = create_signoff(
        db, d["org_a"].id,
        object_type="journal_entry",
        object_id=d["je"].id,
        reviewer_user_id=d["reviewer"].id,
    )
    # 3. Reviewer approves their signoff
    approved = approve_signoff(db, signoff.id, notes="JE verified.", acting_user=d["reviewer"])
    # 4. Complete the task
    complete_task(db, task.id, acting_user=d["reviewer"])

    assert approved.signoff_status == "approved"
    assert task.status == "completed"
    # JE is unchanged
    assert d["je"].status == "posted"


# ---------------------------------------------------------------------------
# Test 10: Multiple signoffs on the same object
# ---------------------------------------------------------------------------

def test_multiple_signoffs_same_object(s):
    db, d = s
    # Add a second reviewer via a second user — we need someone different from accountant
    second_reviewer = create_user(db, d["org_a"].id, "rev2@a.com", "Second Reviewer")
    assign_role(db, second_reviewer.id, "reviewer", d["org_a"].id)

    s1 = create_signoff(db, d["org_a"].id, "journal_entry", d["je"].id,
                        reviewer_user_id=d["reviewer"].id)
    s2 = create_signoff(db, d["org_a"].id, "journal_entry", d["je"].id,
                        reviewer_user_id=second_reviewer.id)

    assert s1.id != s2.id
    assert s1.reviewer_user_id != s2.reviewer_user_id

    all_signoffs = list_signoffs(db, "journal_entry", d["je"].id)
    signoff_ids = {s.id for s in all_signoffs}
    assert s1.id in signoff_ids
    assert s2.id in signoff_ids


# ---------------------------------------------------------------------------
# Test 11: Signoff history preserved after approval
# ---------------------------------------------------------------------------

def test_signoff_history_preserved(s):
    db, d = s
    signoff = create_signoff(
        db, d["org_a"].id, "accounting_period", 999,
        reviewer_user_id=d["reviewer"].id,
        notes="Initial note",
    )
    signoff_id = signoff.id
    approve_signoff(db, signoff_id, notes="Approved after review.", acting_user=d["reviewer"])

    from app.services.workflow_service import get_signoff_or_raise
    fetched = get_signoff_or_raise(db, signoff_id)
    assert fetched.signoff_status == "approved"
    assert fetched.notes == "Approved after review."
    assert fetched.signed_at is not None
    assert fetched.reviewer_user_id == d["reviewer"].id

    # Cannot approve again
    with pytest.raises(ReviewSignoffStateError, match="already"):
        approve_signoff(db, signoff_id, acting_user=d["reviewer"])
