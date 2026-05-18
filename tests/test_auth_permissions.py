"""
M12 proof-point tests: organizations, users, roles, and permissions.

Tests
-----
1.  Admin can create users and assign roles in their own org
2.  Viewer cannot post journal entries (PermissionDeniedError)
3.  Accountant cannot reverse entries (PermissionDeniedError)
4.  Reviewer can post draft and reverse but cannot manage users
5.  CFO has all permissions except manage_users
6.  Cross-org data access blocked (OrganizationAccessError)
7.  Audit fields (created_by_user_id, posted_by_user_id) populated from acting_user
8.  Superuser bypasses all permission and org checks
9.  manage_periods permission gate on close_period
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
from app.services.accounting_period_service import close_period, create_period
from app.services.journal_entry_service import (
    create_draft_journal_entry,
    post_draft_journal_entry,
    post_journal_entry,
    reverse_journal_entry,
)
from app.services.organization_service import create_organization, seed_default_roles
from app.services.permission_service import (
    OrganizationAccessError,
    PermissionDeniedError,
    get_user_permissions,
)
from app.services.user_service import assign_role, create_user, list_users


# ---------------------------------------------------------------------------
# Module-scoped session with seeded data (session stays open)
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

    # Users in Org A
    admin = create_user(db, org_a.id, "admin@alpha.com", "Admin User")
    viewer = create_user(db, org_a.id, "viewer@alpha.com", "Viewer User")
    accountant = create_user(db, org_a.id, "accountant@alpha.com", "Accountant User")
    reviewer = create_user(db, org_a.id, "reviewer@alpha.com", "Reviewer User")
    cfo = create_user(db, org_a.id, "cfo@alpha.com", "CFO User")
    superuser = create_user(db, org_a.id, "super@alpha.com", "Super User", is_superuser=True)

    # Users in Org B
    other_user = create_user(db, org_b.id, "user@beta.com", "Beta User")

    # Assign roles
    assign_role(db, admin.id, "admin", org_a.id)
    assign_role(db, viewer.id, "viewer", org_a.id)
    assign_role(db, accountant.id, "accountant", org_a.id)
    assign_role(db, reviewer.id, "reviewer", org_a.id)
    assign_role(db, cfo.id, "cfo", org_a.id)
    assign_role(db, other_user.id, "accountant", org_b.id)

    # Entities
    entity_a = Entity(code="EA", name="Entity Alpha", entity_type="operating",
                      currency="USD", organization_id=org_a.id)
    entity_b = Entity(code="EB", name="Entity Beta", entity_type="operating",
                      currency="USD", organization_id=org_b.id)
    db.add(entity_a)
    db.add(entity_b)
    db.flush()

    # Accounts
    cash_a = Account(entity_id=entity_a.id, account_number="1000", account_name="Cash A",
                     account_type="asset", normal_balance="debit")
    rev_a = Account(entity_id=entity_a.id, account_number="4000", account_name="Revenue A",
                    account_type="revenue", normal_balance="credit")
    re_a = Account(entity_id=entity_a.id, account_number="3900", account_name="RE A",
                   account_type="equity", normal_balance="credit")
    cash_b = Account(entity_id=entity_b.id, account_number="1000", account_name="Cash B",
                     account_type="asset", normal_balance="debit")
    rev_b = Account(entity_id=entity_b.id, account_number="4000", account_name="Revenue B",
                    account_type="revenue", normal_balance="credit")
    for acc in (cash_a, rev_a, re_a, cash_b, rev_b):
        db.add(acc)
    db.flush()

    scenario = Scenario(code="ACT", name="Actual", scenario_type="actual")
    db.add(scenario)
    db.flush()

    db.commit()

    yield db, {
        "org_a": org_a, "org_b": org_b,
        "admin": admin, "viewer": viewer, "accountant": accountant,
        "reviewer": reviewer, "cfo": cfo, "superuser": superuser,
        "other_user": other_user,
        "entity_a": entity_a, "entity_b": entity_b,
        "cash_a": cash_a, "rev_a": rev_a, "re_a": re_a,
        "cash_b": cash_b, "rev_b": rev_b,
        "scenario": scenario,
    }

    db.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def s(seeded_session):
    """Per-test savepoint isolation."""
    db, d = seeded_session
    db.begin_nested()
    yield db, d
    db.rollback()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _je(entity_id, scenario_id, cash_id, rev_id, amount=Decimal("1000"), je_num="JE-001"):
    return JournalEntryCreate(
        je_number=je_num,
        entry_date=datetime.date(2024, 6, 15),
        entity_id=entity_id,
        scenario_id=scenario_id,
        description="Test",
        source="test",
        lines=[
            JournalEntryLineCreate(line_number=1, account_id=cash_id, entity_id=entity_id,
                                   debit=amount, credit=Decimal("0")),
            JournalEntryLineCreate(line_number=2, account_id=rev_id, entity_id=entity_id,
                                   debit=Decimal("0"), credit=amount),
        ],
    )


# ---------------------------------------------------------------------------
# Test 1: Admin can create users and assign roles
# ---------------------------------------------------------------------------

def test_admin_can_create_user_and_assign_role(s):
    db, d = s
    new_user = create_user(db, d["org_a"].id, "new@alpha.com", "New Person",
                           acting_user=d["admin"])
    assert new_user.id is not None
    ur = assign_role(db, new_user.id, "viewer", d["org_a"].id, acting_user=d["admin"])
    assert ur.role_name == "viewer"


# ---------------------------------------------------------------------------
# Test 2: Viewer cannot post journal entries
# ---------------------------------------------------------------------------

def test_viewer_cannot_post_journal_entry(s):
    db, d = s
    data = _je(d["entity_a"].id, d["scenario"].id, d["cash_a"].id, d["rev_a"].id)
    with pytest.raises(PermissionDeniedError, match="create_journal_entries"):
        post_journal_entry(db, data, acting_user=d["viewer"])


# ---------------------------------------------------------------------------
# Test 3: Accountant cannot reverse entries
# ---------------------------------------------------------------------------

def test_accountant_cannot_reverse_entries(s):
    db, d = s
    je = post_journal_entry(db, _je(d["entity_a"].id, d["scenario"].id,
                                    d["cash_a"].id, d["rev_a"].id))
    with pytest.raises(PermissionDeniedError, match="reverse_entries"):
        reverse_journal_entry(
            db, je.id,
            reversal_date=datetime.date(2024, 6, 16),
            je_number="REV-001",
            description="Reversal",
            acting_user=d["accountant"],
        )


# ---------------------------------------------------------------------------
# Test 4: Reviewer can post draft and reverse but cannot manage users
# ---------------------------------------------------------------------------

def test_reviewer_can_post_draft_and_reverse(s):
    db, d = s
    draft = create_draft_journal_entry(
        db, _je(d["entity_a"].id, d["scenario"].id, d["cash_a"].id, d["rev_a"].id))
    je, _ = post_draft_journal_entry(db, draft.id, acting_user=d["reviewer"])
    assert je.status == "posted"
    rev = reverse_journal_entry(
        db, je.id,
        reversal_date=datetime.date(2024, 6, 16),
        je_number="REV-002",
        description="Rev",
        acting_user=d["reviewer"],
    )
    assert rev.status == "posted"


def test_reviewer_cannot_manage_users(s):
    db, d = s
    with pytest.raises(PermissionDeniedError, match="manage_users"):
        list_users(db, d["org_a"].id, acting_user=d["reviewer"])


# ---------------------------------------------------------------------------
# Test 5: CFO has all permissions except manage_users
# ---------------------------------------------------------------------------

def test_cfo_permissions(s):
    db, d = s
    perms = get_user_permissions(db, d["cfo"])
    assert "manage_users" not in perms
    for p in ("create_journal_entries", "post_journal_entries", "reverse_entries",
              "manage_periods", "view_reports", "manage_mappings", "run_consolidations"):
        assert p in perms, f"CFO missing permission: {p}"


# ---------------------------------------------------------------------------
# Test 6: Cross-org data access blocked
# ---------------------------------------------------------------------------

def test_cross_org_je_blocked(s):
    db, d = s
    data = _je(d["entity_b"].id, d["scenario"].id, d["cash_b"].id, d["rev_b"].id)
    with pytest.raises(OrganizationAccessError):
        post_journal_entry(db, data, acting_user=d["accountant"])


# ---------------------------------------------------------------------------
# Test 7: Audit fields populated from acting_user
# ---------------------------------------------------------------------------

def test_audit_fields_on_post(s):
    db, d = s
    je = post_journal_entry(
        db, _je(d["entity_a"].id, d["scenario"].id, d["cash_a"].id, d["rev_a"].id,
                amount=Decimal("500")),
        acting_user=d["accountant"],
    )
    assert je.created_by_user_id == d["accountant"].id
    assert je.posted_by_user_id == d["accountant"].id


def test_audit_fields_split_create_post(s):
    db, d = s
    draft = create_draft_journal_entry(
        db, _je(d["entity_a"].id, d["scenario"].id, d["cash_a"].id, d["rev_a"].id,
                amount=Decimal("250")),
        acting_user=d["accountant"],
    )
    assert draft.created_by_user_id == d["accountant"].id
    je, _ = post_draft_journal_entry(db, draft.id, acting_user=d["reviewer"])
    assert je.posted_by_user_id == d["reviewer"].id


# ---------------------------------------------------------------------------
# Test 8: Superuser bypasses permission and org checks
# ---------------------------------------------------------------------------

def test_superuser_bypasses_checks(s):
    db, d = s
    # Superuser in org_a posts into entity_b (org_b) — cross-org, should succeed
    je = post_journal_entry(
        db, _je(d["entity_b"].id, d["scenario"].id, d["cash_b"].id, d["rev_b"].id,
                amount=Decimal("100")),
        acting_user=d["superuser"],
    )
    assert je.status == "posted"


# ---------------------------------------------------------------------------
# Test 9: manage_periods permission gate on close_period
# ---------------------------------------------------------------------------

def test_viewer_cannot_close_period(s):
    db, d = s
    period = create_period(
        db, entity_id=d["entity_a"].id,
        period_name="June 2024", start_date=datetime.date(2024, 6, 1),
        end_date=datetime.date(2024, 6, 30), fiscal_year=2024, fiscal_period=6,
    )
    with pytest.raises(PermissionDeniedError, match="manage_periods"):
        close_period(
            db, period.id,
            re_account_id=d["re_a"].id,
            scenario_id=d["scenario"].id,
            closing_je_number="CL-2024-06",
            acting_user=d["viewer"],
        )
