"""
Backend integration smoke tests — verifies the demo seeder creates a coherent,
usable dataset that the API can serve correctly.

These tests run against an in-memory SQLite DB seeded with seed_demo_data().
They do NOT test the HTTP layer exhaustively — that's covered by test_api.py.
Here we focus on data integrity and the correctness of the seeded state.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base


@pytest.fixture(scope="module")
def seeded_db():
    """Isolated in-memory DB with full demo seed data."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    from scripts.seed_demo import seed_demo_data
    result = seed_demo_data(db, verbose=False)

    yield db, result

    db.close()
    engine.dispose()


# ---------------------------------------------------------------------------
# Organization
# ---------------------------------------------------------------------------

def test_org_exists(seeded_db):
    db, result = seeded_db
    from app.models.organization import Organization
    org = db.query(Organization).filter(Organization.slug == "acme").first()
    assert org is not None
    assert org.name == "Acme Manufacturing Co."
    assert org.is_active is True


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def test_five_users_created(seeded_db):
    db, result = seeded_db
    from app.models.user import User
    from app.models.organization import Organization
    org = db.query(Organization).filter(Organization.slug == "acme").first()
    users = db.query(User).filter(User.organization_id == org.id).all()
    assert len(users) == 5


def test_admin_user_is_superuser(seeded_db):
    db, result = seeded_db
    from app.models.user import User
    admin = db.query(User).filter(User.email == "admin@acme.com").first()
    assert admin is not None
    assert admin.is_superuser is True


def test_all_demo_users_exist(seeded_db):
    db, result = seeded_db
    from app.models.user import User
    expected_emails = {
        "admin@acme.com",
        "controller@acme.com",
        "accountant@acme.com",
        "reviewer@acme.com",
        "viewer@acme.com",
    }
    actual_emails = {u.email for u in db.query(User).all()}
    assert expected_emails.issubset(actual_emails)


def test_demo_passwords_hash_correctly(seeded_db):
    db, result = seeded_db
    from app.models.user import User
    from app.core.security import verify_password
    admin = db.query(User).filter(User.email == "admin@acme.com").first()
    assert admin is not None
    assert verify_password("Demo1234!", admin.hashed_password)


# ---------------------------------------------------------------------------
# Chart of accounts
# ---------------------------------------------------------------------------

def test_seventeen_accounts(seeded_db):
    db, result = seeded_db
    entity = result.get("entity")
    assert entity is not None
    from app.models.account import Account
    accounts = db.query(Account).filter(Account.entity_id == entity.id).all()
    assert len(accounts) == 17


def test_account_types_present(seeded_db):
    db, result = seeded_db
    from app.models.account import Account
    entity = result["entity"]
    accounts = db.query(Account).filter(Account.entity_id == entity.id).all()
    types = {a.account_type for a in accounts}
    assert types == {"asset", "liability", "equity", "revenue", "expense"}


# ---------------------------------------------------------------------------
# Accounting periods
# ---------------------------------------------------------------------------

def test_four_periods_created(seeded_db):
    db, result = seeded_db
    from app.models.accounting_period import AccountingPeriod
    entity = result["entity"]
    periods = db.query(AccountingPeriod).filter(AccountingPeriod.entity_id == entity.id).all()
    assert len(periods) == 4


def test_period_names(seeded_db):
    db, result = seeded_db
    from app.models.accounting_period import AccountingPeriod
    entity = result["entity"]
    names = {p.period_name for p in db.query(AccountingPeriod).filter(AccountingPeriod.entity_id == entity.id).all()}
    assert "January 2024" in names
    assert "February 2024" in names


# ---------------------------------------------------------------------------
# Journal entries
# ---------------------------------------------------------------------------

def test_posted_journal_entries_exist(seeded_db):
    db, result = seeded_db
    from app.models.journal_entry import JournalEntry
    posted = db.query(JournalEntry).filter(JournalEntry.status == "posted").all()
    # 1 opening balance + 6 Jan + 3 Feb = 10 posted
    assert len(posted) >= 9


def test_draft_journal_entries_exist(seeded_db):
    db, result = seeded_db
    from app.models.journal_entry import JournalEntry
    drafts = db.query(JournalEntry).filter(JournalEntry.status == "draft").all()
    assert len(drafts) >= 2


def test_all_posted_entries_are_balanced(seeded_db):
    db, result = seeded_db
    from app.models.journal_entry import JournalEntry
    from app.models.journal_entry_line import JournalEntryLine
    posted = db.query(JournalEntry).filter(JournalEntry.status == "posted").all()
    for je in posted:
        lines = db.query(JournalEntryLine).filter(JournalEntryLine.journal_entry_id == je.id).all()
        total_dr = sum(float(l.debit or 0) for l in lines)
        total_cr = sum(float(l.credit or 0) for l in lines)
        assert abs(total_dr - total_cr) < 0.01, (
            f"JE {je.je_number} is unbalanced: DR={total_dr} CR={total_cr}"
        )


def test_opening_balance_entry_amount(seeded_db):
    db, result = seeded_db
    from app.models.journal_entry import JournalEntry
    from app.models.journal_entry_line import JournalEntryLine
    opening = db.query(JournalEntry).filter(
        JournalEntry.description.like("%Opening%") | JournalEntry.description.like("%opening%")
    ).first()
    assert opening is not None
    lines = db.query(JournalEntryLine).filter(JournalEntryLine.journal_entry_id == opening.id).all()
    total_dr = sum(float(l.debit or 0) for l in lines)
    # Opening balance should total ~$950,000
    assert abs(total_dr - 950_000) < 1.0, f"Opening balance DR total: {total_dr}"


# ---------------------------------------------------------------------------
# Reconciliations
# ---------------------------------------------------------------------------

def test_reconciliations_exist(seeded_db):
    db, result = seeded_db
    from app.models.reconciliation import Reconciliation
    recons = db.query(Reconciliation).all()
    assert len(recons) >= 2


def test_reconciliation_statuses(seeded_db):
    db, result = seeded_db
    from app.models.reconciliation import Reconciliation
    statuses = {r.status for r in db.query(Reconciliation).all()}
    # Should have at least prepared and in_progress
    assert len(statuses) >= 2


# ---------------------------------------------------------------------------
# Workflow tasks
# ---------------------------------------------------------------------------

def test_workflow_tasks_exist(seeded_db):
    db, result = seeded_db
    from app.models.workflow_task import WorkflowTask
    tasks = db.query(WorkflowTask).all()
    assert len(tasks) >= 3


# ---------------------------------------------------------------------------
# FS structure
# ---------------------------------------------------------------------------

def test_fs_line_items_exist(seeded_db):
    db, result = seeded_db
    from app.models.fs_line_item import FsLineItem
    items = db.query(FsLineItem).all()
    assert len(items) >= 20


def test_both_statements_present(seeded_db):
    db, result = seeded_db
    from app.models.fs_line_item import FsLineItem
    items = db.query(FsLineItem).all()
    statements = {i.statement for i in items}
    assert "BS" in statements
    assert "IS" in statements


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------

def test_seed_skips_if_org_exists(seeded_db):
    db, result = seeded_db
    from scripts.seed_demo import seed_demo_data
    result2 = seed_demo_data(db, verbose=False)
    assert result2.get("skipped") is True


# ---------------------------------------------------------------------------
# Setup endpoint guard
# ---------------------------------------------------------------------------

def test_setup_status_complete_after_seed(seeded_db):
    db, result = seeded_db
    from app.models.user import User
    count = db.query(User).count()
    assert count > 0, "Users should exist after seeding"
