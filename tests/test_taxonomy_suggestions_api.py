"""
Sprint O6 — Taxonomy mapping suggestion API tests.

Covers:
  - GET  /taxonomies/suggest/{account_id}  (single account, multi-taxonomy)
  - POST /taxonomies/suggest/bulk
  - POST /taxonomies/suggest/apply
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
from app.models.taxonomy import AccountTaxonomyMapping, Taxonomy, TaxonomyNode


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


def _seed_taxonomy(db, code: str, node_codes: list[str]) -> dict:
    tx = Taxonomy(
        code=code, name=code.upper(), description="test",
        is_system=True, is_active=True,
    )
    db.add(tx)
    db.flush()
    node_ids: dict[str, int] = {}
    for i, nc in enumerate(node_codes):
        n = TaxonomyNode(
            taxonomy_id=tx.id, parent_id=None, code=nc, name=nc.replace("_", " ").title(),
            statement_type="balance_sheet", normal_balance="debit",
            sort_order=i * 10, level=0, is_active=True, is_system=True,
        )
        db.add(n)
        db.flush()
        node_ids[nc] = n.id
    db.commit()
    return {"taxonomy_id": tx.id, "node_ids": node_ids}


def _seed_account(db, number: str, name: str, atype: str = "asset", normal: str = "debit") -> int:
    a = Account(
        account_number=number,
        account_name=name,
        account_type=atype,
        normal_balance=normal,
    )
    db.add(a)
    db.commit()
    return a.id


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_suggest_returns_for_known_account(client, session_factory):
    db = session_factory()
    seed = _seed_taxonomy(db, "us_gaap_s", ["CASH", "AR", "INVENTORY"])
    aid = _seed_account(db, "1000", "Cash and Cash Equivalents")
    tx_id = seed["taxonomy_id"]
    db.close()

    r = client.get(f"/taxonomies/suggest/{aid}", params={"taxonomy_ids": str(tx_id)})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) == 1
    assert body[0]["taxonomy_id"] == tx_id
    assert body[0]["node_code"] in ("CASH", "CASH_EQUIV")
    assert body[0]["confidence_score"] > 0


def test_suggest_unknown_account_404(client, session_factory):
    db = session_factory()
    seed = _seed_taxonomy(db, "us_gaap_s2", ["CASH"])
    tx_id = seed["taxonomy_id"]
    db.close()

    r = client.get("/taxonomies/suggest/9999", params={"taxonomy_ids": str(tx_id)})
    assert r.status_code == 404


def test_bulk_suggest_multi_account(client, session_factory):
    db = session_factory()
    seed_a = _seed_taxonomy(db, "us_gaap_s3", ["CASH", "AR", "INVENTORY"])
    seed_b = _seed_taxonomy(db, "ifrs_s3", ["CASH", "AR", "INVENTORY"])
    a1 = _seed_account(db, "1000", "Cash")
    a2 = _seed_account(db, "1100", "Accounts Receivable")
    a3 = _seed_account(db, "1200", "Inventory")
    db.close()

    r = client.post(
        "/taxonomies/suggest/bulk",
        json={
            "account_ids": [a1, a2, a3],
            "taxonomy_ids": [seed_a["taxonomy_id"], seed_b["taxonomy_id"]],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "suggestions" in body
    assert len(body["suggestions"]) == 3
    assert str(a1) in body["suggestions"] or a1 in body["suggestions"]


def test_apply_suggestions_creates_mappings(client, session_factory):
    db = session_factory()
    seed = _seed_taxonomy(db, "us_gaap_apply", ["CASH", "AR"])
    a1 = _seed_account(db, "1000", "Cash")
    a2 = _seed_account(db, "1100", "Accounts Receivable")
    tx_id = seed["taxonomy_id"]
    cash_node = seed["node_ids"]["CASH"]
    ar_node = seed["node_ids"]["AR"]
    db.close()

    r = client.post(
        "/taxonomies/suggest/apply",
        json={
            "suggestions": [
                {"account_id": a1, "taxonomy_id": tx_id, "taxonomy_node_id": cash_node, "confidence_score": 0.9},
                {"account_id": a2, "taxonomy_id": tx_id, "taxonomy_node_id": ar_node, "confidence_score": 0.85},
            ],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["applied"] == 2
    assert body["skipped"] == 0

    db = session_factory()
    rows = db.query(AccountTaxonomyMapping).filter_by(taxonomy_id=tx_id).all()
    assert len(rows) == 2
    assert {m.mapping_source for m in rows} == {"ai_suggested"}
    db.close()


def test_apply_suggestions_skips_existing(client, session_factory):
    db = session_factory()
    seed = _seed_taxonomy(db, "us_gaap_skip", ["CASH"])
    aid = _seed_account(db, "1000", "Cash")
    tx_id = seed["taxonomy_id"]
    cash_node = seed["node_ids"]["CASH"]

    pre = AccountTaxonomyMapping(
        account_id=aid,
        taxonomy_id=tx_id,
        taxonomy_node_id=cash_node,
        mapping_source="user_selected",
        mapping_type="manual",
    )
    db.add(pre)
    db.commit()
    db.close()

    r = client.post(
        "/taxonomies/suggest/apply",
        json={
            "suggestions": [
                {"account_id": aid, "taxonomy_id": tx_id, "taxonomy_node_id": cash_node, "confidence_score": 0.9},
            ],
            "overwrite_existing": False,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["applied"] == 0
    assert body["skipped"] == 1

    db = session_factory()
    rows = db.query(AccountTaxonomyMapping).filter_by(account_id=aid, taxonomy_id=tx_id).all()
    assert len(rows) == 1
    assert rows[0].mapping_source == "user_selected"
    db.close()
