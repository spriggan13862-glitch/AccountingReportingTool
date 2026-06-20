"""
Tests for FSLI mapping service — entity+view scoped resolution and CRUD.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.account import Account
from app.models.reporting_taxonomy import ReportingTaxonomyLine, ReportingTaxonomyView
from app.models.view_account_override import ViewAccountOverride
from app.services.fsli_mapping_service import (
    bulk_migrate_from_account_field,
    delete_fsli_mapping,
    list_fsli_mappings,
    resolve_fsli,
    upsert_fsli_mapping,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


def _make_view(db, code: str, is_default: bool = False) -> ReportingTaxonomyView:
    view = ReportingTaxonomyView(
        code=code,
        name=code,
        is_default=is_default,
        is_system_defined=False,
        active=True,
    )
    db.add(view)
    db.flush()
    return view


def _make_line(db, code: str, view_id=None) -> ReportingTaxonomyLine:
    line = ReportingTaxonomyLine(
        code=code,
        name=code,
        section="revenue",
        sort_order=0,
        is_subtotal=False,
        active=True,
        editable=True,
        system_defined=False,
        reporting_view_id=view_id,
    )
    db.add(line)
    db.flush()
    return line


def _make_account(db, entity_id: int, number: str, taxonomy_line_id=None) -> Account:
    acct = Account(
        entity_id=entity_id,
        account_number=number,
        account_name=number,
        account_type="revenue",
        normal_balance="credit",
        reporting_taxonomy_line_id=taxonomy_line_id,
    )
    db.add(acct)
    db.flush()
    return acct


def test_mapping_isolation_by_reporting_view(db):
    """Same account maps to different taxonomy lines in GAAP vs Tax view."""
    gaap_view = _make_view(db, "GAAP")
    tax_view = _make_view(db, "TAX")
    line_a = _make_line(db, "LINE_A")
    line_b = _make_line(db, "LINE_B")
    account = _make_account(db, entity_id=1, number="4000")
    db.commit()

    upsert_fsli_mapping(1, gaap_view.id, account.id, line_a.id, db)
    upsert_fsli_mapping(1, tax_view.id, account.id, line_b.id, db)

    assert resolve_fsli(account.id, 1, gaap_view.id, db) == line_a.id
    assert resolve_fsli(account.id, 1, tax_view.id, db) == line_b.id


def test_resolution_chain(db):
    """Falls through: entity-specific → org-wide → legacy account field."""
    view = _make_view(db, "GAAP")
    line_legacy = _make_line(db, "LINE_LEGACY")
    line_override = _make_line(db, "LINE_OVERRIDE")
    account = _make_account(db, entity_id=1, number="4001", taxonomy_line_id=line_legacy.id)
    db.commit()

    # Only legacy field set — should fall back to it
    assert resolve_fsli(account.id, 1, view.id, db) == line_legacy.id

    # Add entity-specific override — should take priority
    upsert_fsli_mapping(1, view.id, account.id, line_override.id, db)
    assert resolve_fsli(account.id, 1, view.id, db) == line_override.id


def test_org_wide_override_resolution(db):
    """Org-wide override (entity_id=None) is used when no entity-specific one exists."""
    view = _make_view(db, "GAAP")
    line_org = _make_line(db, "LINE_ORG")
    account = _make_account(db, entity_id=1, number="4002")
    db.commit()

    # Insert org-wide override (entity_id=None)
    org_override = ViewAccountOverride(
        entity_id=None,
        view_id=view.id,
        account_id=account.id,
        taxonomy_line_id=line_org.id,
    )
    db.add(org_override)
    db.commit()

    assert resolve_fsli(account.id, 1, view.id, db) == line_org.id


def test_parent_child_account_hierarchy(db):
    """Parent account has FSLI mapped; child without mapping returns None from service (no auto-inherit)."""
    view = _make_view(db, "GAAP")
    line = _make_line(db, "LINE_PARENT")
    parent = _make_account(db, entity_id=1, number="4000")
    child = _make_account(db, entity_id=1, number="4000-01")
    db.commit()

    upsert_fsli_mapping(1, view.id, parent.id, line.id, db)

    assert resolve_fsli(parent.id, 1, view.id, db) == line.id
    assert resolve_fsli(child.id, 1, view.id, db) is None


def test_fsli_line_hierarchy(db):
    """FSLI line can have parent_id (subtotal structure)."""
    parent_line = _make_line(db, "PARENT_LINE")
    db.commit()
    child_line = _make_line(db, "CHILD_LINE")
    child_line.parent_id = parent_line.id
    db.commit()

    assert child_line.parent_id == parent_line.id


def test_delete_fsli_mapping(db):
    """delete_fsli_mapping removes the row and returns True; returns False if not found."""
    view = _make_view(db, "GAAP")
    line = _make_line(db, "LINE_X")
    account = _make_account(db, entity_id=1, number="5000")
    db.commit()

    upsert_fsli_mapping(1, view.id, account.id, line.id, db)
    assert delete_fsli_mapping(1, view.id, account.id, db) is True
    assert delete_fsli_mapping(1, view.id, account.id, db) is False


def test_list_fsli_mappings(db):
    """list_fsli_mappings returns only mappings for the given entity+view."""
    view_a = _make_view(db, "GAAP")
    view_b = _make_view(db, "TAX")
    line = _make_line(db, "LINE_L")
    acct1 = _make_account(db, entity_id=1, number="6000")
    acct2 = _make_account(db, entity_id=1, number="6001")
    db.commit()

    upsert_fsli_mapping(1, view_a.id, acct1.id, line.id, db)
    upsert_fsli_mapping(1, view_a.id, acct2.id, line.id, db)
    upsert_fsli_mapping(1, view_b.id, acct1.id, line.id, db)

    mappings = list_fsli_mappings(1, view_a.id, db)
    assert len(mappings) == 2
    assert all(m.view_id == view_a.id for m in mappings)


def test_bulk_migrate_from_account_field(db):
    """bulk_migrate_from_account_field copies legacy line IDs into overrides."""
    view = _make_view(db, "GAAP")
    line = _make_line(db, "LINE_M")
    acct = _make_account(db, entity_id=1, number="7000", taxonomy_line_id=line.id)
    # Account without a taxonomy line — should be skipped
    _make_account(db, entity_id=1, number="7001")
    db.commit()

    migrated = bulk_migrate_from_account_field(1, view.id, db)
    assert migrated == 1

    overrides = list_fsli_mappings(1, view.id, db)
    assert len(overrides) == 1
    assert overrides[0].account_id == acct.id
    assert overrides[0].taxonomy_line_id == line.id

    # Running again should skip already-migrated rows
    migrated_again = bulk_migrate_from_account_field(1, view.id, db)
    assert migrated_again == 0
