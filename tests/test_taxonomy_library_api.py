"""
Sprint O3 — taxonomy library API endpoint tests.

Covers list/get/clone/edit + CSV/JSON export + account mappings.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base
from app.api.deps import get_db
from app.main import app
from app.models.account import Account
from app.models.taxonomy import Taxonomy, TaxonomyNode


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def engine():
    e = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(e, "connect")
    def pragmas(conn, _):
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys = OFF")
        cur.close()

    Base.metadata.create_all(e)
    yield e
    Base.metadata.drop_all(e)


@pytest.fixture
def session_factory(engine):
    return sessionmaker(bind=engine)


@pytest.fixture
def client(engine, session_factory):
    def override():
        db = session_factory()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def seed_taxonomy(session_factory):
    """Seed a small 3-node system taxonomy. Returns dict with ids."""
    db = session_factory()
    try:
        tx = Taxonomy(
            code="us_gaap_test",
            name="US GAAP (Test)",
            description="Test taxonomy",
            is_system=True,
            is_active=True,
        )
        db.add(tx)
        db.flush()

        root = TaxonomyNode(
            taxonomy_id=tx.id, parent_id=None, code="assets",
            name="Assets", statement_type="balance_sheet",
            financial_statement_section="assets", normal_balance="debit",
            sort_order=0, level=0, is_active=True, is_system=True,
        )
        db.add(root)
        db.flush()

        child1 = TaxonomyNode(
            taxonomy_id=tx.id, parent_id=root.id, code="current_assets",
            name="Current Assets", statement_type="balance_sheet",
            financial_statement_section="assets", normal_balance="debit",
            sort_order=10, level=1, is_active=True, is_system=True,
        )
        child2 = TaxonomyNode(
            taxonomy_id=tx.id, parent_id=root.id, code="non_current_assets",
            name="Non-Current Assets", statement_type="balance_sheet",
            financial_statement_section="assets", normal_balance="debit",
            sort_order=20, level=1, is_active=True, is_system=True,
        )
        db.add_all([child1, child2])
        db.commit()
        return {
            "taxonomy_id": tx.id,
            "root_id": root.id,
            "child1_id": child1.id,
            "child2_id": child2.id,
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_list_taxonomies_empty(client):
    r = client.get("/taxonomies")
    assert r.status_code == 200
    assert r.json() == []


def test_get_taxonomy_tree(client, seed_taxonomy):
    tx_id = seed_taxonomy["taxonomy_id"]
    r = client.get(f"/taxonomies/{tx_id}/tree")
    assert r.status_code == 200
    tree = r.json()
    assert len(tree) == 1
    root = tree[0]
    assert root["code"] == "assets"
    assert len(root["children"]) == 2
    child_codes = {c["code"] for c in root["children"]}
    assert child_codes == {"current_assets", "non_current_assets"}


def test_clone_system_taxonomy(client, seed_taxonomy):
    tx_id = seed_taxonomy["taxonomy_id"]
    r = client.post(
        f"/taxonomies/{tx_id}/clone",
        json={"name": "My Custom GAAP", "code": "my_custom_gaap"},
    )
    assert r.status_code == 201
    clone = r.json()
    assert clone["is_system"] is False
    assert clone["parent_taxonomy_id"] == tx_id
    assert clone["code"] == "my_custom_gaap"
    assert clone["name"] == "My Custom GAAP"


def test_edit_system_node_rejected(client, seed_taxonomy):
    root_id = seed_taxonomy["root_id"]
    r = client.patch(
        f"/taxonomies/nodes/{root_id}",
        json={"name": "Hacked Assets"},
    )
    assert r.status_code == 409
    assert "system" in r.json()["detail"].lower()


def test_edit_cloned_node_succeeds(client, seed_taxonomy, session_factory):
    tx_id = seed_taxonomy["taxonomy_id"]
    clone_resp = client.post(
        f"/taxonomies/{tx_id}/clone",
        json={"name": "Editable Clone", "code": "editable_clone"},
    )
    assert clone_resp.status_code == 201
    clone_id = clone_resp.json()["id"]

    db = session_factory()
    cloned_node = (
        db.query(TaxonomyNode)
        .filter_by(taxonomy_id=clone_id, code="current_assets")
        .first()
    )
    assert cloned_node is not None
    cloned_node_id = cloned_node.id
    db.close()

    r = client.patch(
        f"/taxonomies/nodes/{cloned_node_id}",
        json={"name": "Current Assets (Renamed)"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Current Assets (Renamed)"


def test_export_csv(client, seed_taxonomy):
    tx_id = seed_taxonomy["taxonomy_id"]
    r = client.get(f"/taxonomies/{tx_id}/export/csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "us_gaap_test_taxonomy.csv" in r.headers.get("content-disposition", "")
    body = r.text
    assert "taxonomy_name" in body
    assert "assets" in body
    assert "current_assets" in body


def test_export_json(client, seed_taxonomy):
    tx_id = seed_taxonomy["taxonomy_id"]
    r = client.get(f"/taxonomies/{tx_id}/export/json")
    assert r.status_code == 200
    payload = r.json()
    assert payload["code"] == "us_gaap_test"
    assert len(payload["nodes"]) == 1
    root = payload["nodes"][0]
    assert root["code"] == "assets"
    assert len(root["children"]) == 2


def test_create_account_mapping(client, seed_taxonomy, session_factory):
    db = session_factory()
    acct = Account(
        account_number="1000",
        account_name="Cash",
        account_type="asset",
        normal_balance="debit",
    )
    db.add(acct)
    db.commit()
    account_id = acct.id
    db.close()

    tx_id = seed_taxonomy["taxonomy_id"]
    node_id = seed_taxonomy["child1_id"]

    r = client.post(
        "/taxonomies/mappings",
        json={
            "account_id": account_id,
            "taxonomy_id": tx_id,
            "taxonomy_node_id": node_id,
            "mapping_source": "user_selected",
            "mapping_type": "manual",
            "is_primary": True,
        },
    )
    assert r.status_code == 201
    mapping = r.json()
    assert mapping["account_id"] == account_id
    assert mapping["taxonomy_node_id"] == node_id

    r2 = client.get(f"/taxonomies/mappings/account/{account_id}")
    assert r2.status_code == 200
    listed = r2.json()
    assert len(listed) == 1
    assert listed[0]["taxonomy"]["code"] == "us_gaap_test"
    assert listed[0]["node"]["code"] == "current_assets"
