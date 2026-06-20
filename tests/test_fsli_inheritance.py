"""
Tests for FSLI inheritance resolution — parent/child account chain.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.database import Base
from app.models.account import Account
from app.models.reporting_taxonomy import ReportingTaxonomyLine, ReportingTaxonomyView
from app.models.view_account_override import ViewAccountOverride
from app.services.fsli_mapping_service import (
    get_effective_fsli_for_all_accounts,
    propagate_fsli_to_children,
    resolve_fsli_with_inheritance,
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


def _view(db, code: str) -> ReportingTaxonomyView:
    v = ReportingTaxonomyView(code=code, name=code, is_default=False, is_system_defined=False, active=True)
    db.add(v)
    db.flush()
    return v


def _line(db, code: str) -> ReportingTaxonomyLine:
    line = ReportingTaxonomyLine(
        code=code, name=code, section="asset", sort_order=0,
        is_subtotal=False, active=True, editable=True, system_defined=False,
    )
    db.add(line)
    db.flush()
    return line


def _account(
    db,
    entity_id: int,
    number: str,
    parent_id: int | None = None,
    taxonomy_line_id: int | None = None,
) -> Account:
    acct = Account(
        entity_id=entity_id,
        account_number=number,
        account_name=number,
        account_type="asset",
        normal_balance="debit",
        parent_account_id=parent_id,
        reporting_taxonomy_line_id=taxonomy_line_id,
    )
    db.add(acct)
    db.flush()
    return acct


def test_explicit_mapping_takes_priority(db):
    """Account with explicit override returns 'explicit' source."""
    view = _view(db, "GAAP")
    line_legacy = _line(db, "LINE_LEGACY")
    line_explicit = _line(db, "LINE_EXPLICIT")
    acct = _account(db, entity_id=1, number="1000", taxonomy_line_id=line_legacy.id)
    db.commit()

    upsert_fsli_mapping(1, view.id, acct.id, line_explicit.id, db)

    tid, source, inherited_from = resolve_fsli_with_inheritance(acct.id, 1, view.id, db)
    assert tid == line_explicit.id
    assert source == 'explicit'
    assert inherited_from is None


def test_inherits_from_parent_by_parent_account_id(db):
    """Account with parent_account_id FK that has override → inherits 'parent'."""
    view = _view(db, "GAAP")
    line = _line(db, "LINE_PARENT")
    parent = _account(db, entity_id=1, number="1000")
    child = _account(db, entity_id=1, number="1000-01", parent_id=parent.id)
    db.commit()

    upsert_fsli_mapping(1, view.id, parent.id, line.id, db)

    tid, source, inherited_from = resolve_fsli_with_inheritance(child.id, 1, view.id, db)
    assert tid == line.id
    assert source == 'parent'
    assert inherited_from == parent.id


def test_inherits_from_parent_by_number_prefix(db):
    """Account 1000-01 inherits from account 1000 when no FK is set (number prefix match)."""
    view = _view(db, "GAAP")
    line = _line(db, "LINE_PREFIX")
    parent = _account(db, entity_id=1, number="1000")
    # No FK set — must use prefix
    child = _account(db, entity_id=1, number="1000-01", parent_id=None)
    db.commit()

    upsert_fsli_mapping(1, view.id, parent.id, line.id, db)

    tid, source, inherited_from = resolve_fsli_with_inheritance(child.id, 1, view.id, db)
    assert tid == line.id
    assert source == 'parent'
    assert inherited_from == parent.id


def test_grandparent_inheritance(db):
    """Account 1000-01-A inherits from 1000 when 1000-01 has no mapping."""
    view = _view(db, "GAAP")
    line = _line(db, "LINE_GRANDPARENT")
    grandparent = _account(db, entity_id=1, number="1000")
    parent = _account(db, entity_id=1, number="1000-01", parent_id=grandparent.id)
    child = _account(db, entity_id=1, number="1000-01-A", parent_id=parent.id)
    db.commit()

    upsert_fsli_mapping(1, view.id, grandparent.id, line.id, db)

    tid, source, inherited_from = resolve_fsli_with_inheritance(child.id, 1, view.id, db)
    assert tid == line.id
    assert source == 'grandparent'
    assert inherited_from == grandparent.id


def test_legacy_fallback(db):
    """No ViewAccountOverride → falls back to Account.reporting_taxonomy_line_id."""
    view = _view(db, "GAAP")
    line_legacy = _line(db, "LINE_LEGACY_FB")
    acct = _account(db, entity_id=1, number="2000", taxonomy_line_id=line_legacy.id)
    db.commit()

    tid, source, inherited_from = resolve_fsli_with_inheritance(acct.id, 1, view.id, db)
    assert tid == line_legacy.id
    assert source == 'legacy'
    assert inherited_from is None


def test_none_when_no_mapping(db):
    """Returns 'none' when account has no mapping at all."""
    view = _view(db, "GAAP")
    acct = _account(db, entity_id=1, number="9999")
    db.commit()

    tid, source, inherited_from = resolve_fsli_with_inheritance(acct.id, 1, view.id, db)
    assert tid is None
    assert source == 'none'
    assert inherited_from is None


def test_propagate_to_children(db):
    """propagate_fsli_to_children updates all unmapped children."""
    view = _view(db, "GAAP")
    line = _line(db, "LINE_PROPAGATE")
    parent = _account(db, entity_id=1, number="3000")
    child1 = _account(db, entity_id=1, number="3000-01", parent_id=parent.id)
    child2 = _account(db, entity_id=1, number="3000-02", parent_id=parent.id)
    db.commit()

    count, updated_ids = propagate_fsli_to_children(parent.id, 1, view.id, line.id, db)
    assert count == 2
    assert set(updated_ids) == {child1.id, child2.id}

    # Verify overrides created
    tid1, src1, _ = resolve_fsli_with_inheritance(child1.id, 1, view.id, db)
    assert tid1 == line.id
    assert src1 == 'explicit'


def test_propagate_skips_explicitly_mapped_children(db):
    """Child with explicit mapping is not overwritten unless overwrite_existing=True."""
    view = _view(db, "GAAP")
    line_parent = _line(db, "LINE_PARENT2")
    line_child = _line(db, "LINE_CHILD2")
    parent = _account(db, entity_id=1, number="4000")
    child_explicit = _account(db, entity_id=1, number="4000-01", parent_id=parent.id)
    child_unmapped = _account(db, entity_id=1, number="4000-02", parent_id=parent.id)
    db.commit()

    upsert_fsli_mapping(1, view.id, child_explicit.id, line_child.id, db)

    count, updated_ids = propagate_fsli_to_children(parent.id, 1, view.id, line_parent.id, db)
    assert count == 1
    assert child_unmapped.id in updated_ids
    assert child_explicit.id not in updated_ids

    # With overwrite_existing=True both should be updated
    count2, _ = propagate_fsli_to_children(parent.id, 1, view.id, line_parent.id, db, overwrite_existing=True)
    assert count2 == 2


def test_get_effective_fsli_for_all_accounts(db):
    """Returns all accounts with correct source labels."""
    view = _view(db, "GAAP")
    line_explicit = _line(db, "LINE_EFF_EXPLICIT")
    line_parent = _line(db, "LINE_EFF_PARENT")
    line_legacy = _line(db, "LINE_EFF_LEGACY")

    parent = _account(db, entity_id=1, number="5000")
    child_inherit = _account(db, entity_id=1, number="5000-01", parent_id=parent.id)
    child_explicit = _account(db, entity_id=1, number="5000-02", parent_id=parent.id)
    unrelated = _account(db, entity_id=1, number="6000", taxonomy_line_id=line_legacy.id)
    db.commit()

    upsert_fsli_mapping(1, view.id, parent.id, line_parent.id, db)
    upsert_fsli_mapping(1, view.id, child_explicit.id, line_explicit.id, db)

    rows = get_effective_fsli_for_all_accounts(1, view.id, db)
    by_num = {r['account_number']: r for r in rows}

    assert by_num['5000']['mapping_source'] == 'explicit'
    assert by_num['5000']['taxonomy_line_id'] == line_parent.id

    assert by_num['5000-01']['mapping_source'] == 'parent'
    assert by_num['5000-01']['inherited_from_account_id'] == parent.id
    assert by_num['5000-01']['inherited_from_account_number'] == '5000'

    assert by_num['5000-02']['mapping_source'] == 'explicit'
    assert by_num['5000-02']['taxonomy_line_id'] == line_explicit.id

    assert by_num['6000']['mapping_source'] == 'legacy'
    assert by_num['6000']['taxonomy_line_id'] == line_legacy.id
