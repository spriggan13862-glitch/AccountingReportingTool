"""
M35c — Account hierarchy context-menu actions: reparent endpoint.

Proof points:
  1.  POST /accounts/{id}/reparent sets a new parent
  2.  POST /accounts/{id}/reparent with null parent moves account to root (outdent)
  3.  Self-parent → 422
  4.  Circular hierarchy A→B→C, try C as parent of A → 422
  5.  Parent in different entity → 422
  6.  Parent account not found → 404
  7.  Account not found → 404
  8.  Response includes old + new parent numbers/names (audit trail)
  9.  Make-child: reparent selected account under the previous-sibling account
  10. Make-parent: reparent the next-sibling account under selected account
  11. Outdent (parent=null) clears parent_account_id
  12. Deep chain reparent preserves other accounts
  13. Tree endpoint reflects updated hierarchy after reparent
"""
from __future__ import annotations

import datetime
import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base
from app.api.deps import get_db
from app.main import app
from app.models.account import Account
from app.models.entity import Entity
from app.models.organization import Organization

BASE = "/api/v1"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture()
def client(db_session):
    def override():
        yield db_session

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _make_entity(db, slug="ent-hier"):
    org = Organization(name="HierOrg", slug=slug)
    db.add(org)
    db.flush()
    entity = Entity(name="HierEntity", code=slug.upper()[:8], entity_type="operating", organization_id=org.id)
    db.add(entity)
    db.flush()
    return entity


def _make_account(db, entity_id, number, name, parent_id=None):
    acct = Account(
        entity_id=entity_id,
        account_number=number,
        account_name=name,
        account_type="asset",
        normal_balance="debit",
        parent_account_id=parent_id,
    )
    db.add(acct)
    db.flush()
    return acct


# ---------------------------------------------------------------------------
# Basic reparent
# ---------------------------------------------------------------------------

def test_reparent_sets_new_parent(client, db_session):
    entity = _make_entity(db_session)
    parent = _make_account(db_session, entity.id, "2100", "Lines of Credit")
    child = _make_account(db_session, entity.id, "2101", "LOC - Aegis")

    r = client.post(f"{BASE}/accounts/{child.id}/reparent", json={"parent_account_id": parent.id})
    assert r.status_code == 200
    data = r.json()
    assert data["new_parent_id"] == parent.id
    assert data["new_parent_number"] == "2100"
    assert data["new_parent_name"] == "Lines of Credit"
    assert data["account_number"] == "2101"
    assert data["account_name"] == "LOC - Aegis"


def test_reparent_includes_old_parent_audit(client, db_session):
    entity = _make_entity(db_session, "ent-audit")
    old_parent = _make_account(db_session, entity.id, "2000", "Old Parent")
    new_parent = _make_account(db_session, entity.id, "2100", "New Parent")
    child = _make_account(db_session, entity.id, "2101", "Child", parent_id=old_parent.id)

    r = client.post(f"{BASE}/accounts/{child.id}/reparent", json={"parent_account_id": new_parent.id})
    assert r.status_code == 200
    data = r.json()
    assert data["old_parent_id"] == old_parent.id
    assert data["old_parent_number"] == "2000"
    assert data["old_parent_name"] == "Old Parent"
    assert data["new_parent_id"] == new_parent.id


def test_outdent_sets_parent_to_null(client, db_session):
    entity = _make_entity(db_session, "ent-outdent")
    parent = _make_account(db_session, entity.id, "2100", "Lines of Credit")
    child = _make_account(db_session, entity.id, "2101", "LOC - Aegis", parent_id=parent.id)

    r = client.post(f"{BASE}/accounts/{child.id}/reparent", json={"parent_account_id": None})
    assert r.status_code == 200
    data = r.json()
    assert data["new_parent_id"] is None
    assert data["new_parent_number"] is None
    assert data["old_parent_id"] == parent.id

    db_session.refresh(child)
    assert child.parent_account_id is None


def test_reparent_tree_reflects_change(client, db_session):
    entity = _make_entity(db_session, "ent-tree")
    parent = _make_account(db_session, entity.id, "2100", "LOC Header")
    child = _make_account(db_session, entity.id, "2101", "LOC Detail")

    client.post(f"{BASE}/accounts/{child.id}/reparent", json={"parent_account_id": parent.id})

    tree = client.get(f"{BASE}/accounts/tree", params={"entity_id": entity.id}).json()
    parent_node = next(n for n in tree if n["id"] == parent.id)
    child_ids = [c["id"] for c in parent_node["children"]]
    assert child.id in child_ids


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def test_self_parent_rejected(client, db_session):
    entity = _make_entity(db_session, "ent-self")
    acct = _make_account(db_session, entity.id, "1000", "Cash")

    r = client.post(f"{BASE}/accounts/{acct.id}/reparent", json={"parent_account_id": acct.id})
    assert r.status_code == 422
    assert "own parent" in r.json()["detail"].lower()


def test_circular_hierarchy_rejected(client, db_session):
    entity = _make_entity(db_session, "ent-circ")
    a = _make_account(db_session, entity.id, "1000", "A")
    b = _make_account(db_session, entity.id, "1100", "B", parent_id=a.id)
    c = _make_account(db_session, entity.id, "1200", "C", parent_id=b.id)

    # Trying to make A a child of C would create A→B→C→A
    r = client.post(f"{BASE}/accounts/{a.id}/reparent", json={"parent_account_id": c.id})
    assert r.status_code == 422
    assert "circular" in r.json()["detail"].lower()


def test_circular_direct_loop_rejected(client, db_session):
    entity = _make_entity(db_session, "ent-loop")
    a = _make_account(db_session, entity.id, "1000", "A")
    b = _make_account(db_session, entity.id, "1100", "B", parent_id=a.id)

    # Make A child of B (A→B→A is circular)
    r = client.post(f"{BASE}/accounts/{a.id}/reparent", json={"parent_account_id": b.id})
    assert r.status_code == 422
    assert "circular" in r.json()["detail"].lower()


def test_cross_entity_parent_rejected(client, db_session):
    entity1 = _make_entity(db_session, "ent-e1a")
    entity2 = _make_entity(db_session, "ent-e2a")
    acct1 = _make_account(db_session, entity1.id, "1000", "Acct in E1")
    acct2 = _make_account(db_session, entity2.id, "1000", "Acct in E2")

    r = client.post(f"{BASE}/accounts/{acct1.id}/reparent", json={"parent_account_id": acct2.id})
    assert r.status_code == 422
    assert "same entity" in r.json()["detail"].lower()


def test_account_not_found(client, db_session):
    r = client.post(f"{BASE}/accounts/99999/reparent", json={"parent_account_id": None})
    assert r.status_code == 404


def test_parent_not_found(client, db_session):
    entity = _make_entity(db_session, "ent-pnf")
    acct = _make_account(db_session, entity.id, "1000", "Cash")

    r = client.post(f"{BASE}/accounts/{acct.id}/reparent", json={"parent_account_id": 99999})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Semantic actions (Make Parent / Make Child / Outdent / Move To)
# ---------------------------------------------------------------------------

def test_make_parent_semantic(client, db_session):
    """Make Parent: selected becomes parent of next account."""
    entity = _make_entity(db_session, "ent-mkp")
    acct_2100 = _make_account(db_session, entity.id, "2100", "Lines of Credit")
    acct_2101 = _make_account(db_session, entity.id, "2101", "LOC - Aegis")

    # Simulate "Make Parent" on 2100: 2101 becomes child of 2100
    r = client.post(f"{BASE}/accounts/{acct_2101.id}/reparent", json={"parent_account_id": acct_2100.id})
    assert r.status_code == 200
    assert r.json()["new_parent_number"] == "2100"


def test_make_child_semantic(client, db_session):
    """Make Child: selected becomes child of previous account."""
    entity = _make_entity(db_session, "ent-mkc")
    acct_2100 = _make_account(db_session, entity.id, "2100", "Lines of Credit")
    acct_2101 = _make_account(db_session, entity.id, "2101", "LOC - Aegis")

    # Simulate "Make Child" on 2101: 2101 becomes child of 2100
    r = client.post(f"{BASE}/accounts/{acct_2101.id}/reparent", json={"parent_account_id": acct_2100.id})
    assert r.status_code == 200
    db_session.refresh(acct_2101)
    assert acct_2101.parent_account_id == acct_2100.id


def test_outdent_semantic(client, db_session):
    """Outdent: remove parent, move to root."""
    entity = _make_entity(db_session, "ent-od")
    parent = _make_account(db_session, entity.id, "2100", "LOC Header")
    child = _make_account(db_session, entity.id, "2101", "LOC Detail", parent_id=parent.id)

    r = client.post(f"{BASE}/accounts/{child.id}/reparent", json={"parent_account_id": None})
    assert r.status_code == 200
    db_session.refresh(child)
    assert child.parent_account_id is None


def test_move_to_parent_semantic(client, db_session):
    """Move To: select any account as new parent."""
    entity = _make_entity(db_session, "ent-mvt")
    target_parent = _make_account(db_session, entity.id, "3000", "Equity")
    acct = _make_account(db_session, entity.id, "3010", "Retained Earnings")

    r = client.post(f"{BASE}/accounts/{acct.id}/reparent", json={"parent_account_id": target_parent.id})
    assert r.status_code == 200
    assert r.json()["new_parent_number"] == "3000"
    db_session.refresh(acct)
    assert acct.parent_account_id == target_parent.id


def test_deep_chain_reparent(client, db_session):
    """Reparenting in a deep chain preserves other levels."""
    entity = _make_entity(db_session, "ent-deep")
    a = _make_account(db_session, entity.id, "1000", "A")
    b = _make_account(db_session, entity.id, "1100", "B", parent_id=a.id)
    c = _make_account(db_session, entity.id, "1200", "C", parent_id=b.id)
    d = _make_account(db_session, entity.id, "1300", "D", parent_id=c.id)

    # Reparent D directly under A (skip B and C)
    r = client.post(f"{BASE}/accounts/{d.id}/reparent", json={"parent_account_id": a.id})
    assert r.status_code == 200
    db_session.refresh(d)
    assert d.parent_account_id == a.id

    # B and C are unaffected
    db_session.refresh(b)
    db_session.refresh(c)
    assert b.parent_account_id == a.id
    assert c.parent_account_id == b.id
