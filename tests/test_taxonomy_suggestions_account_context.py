"""
Agent 2 regression: MappingSuggestionOut must embed source account_number
and account_name so the Auto-Map modal never falls back to internal row IDs.
"""
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base
from app.main import app
from app.api.deps import get_db, get_required_user, get_current_user
from app.models.organization import Organization
from app.models.entity import Entity
from app.models.account import Account
from app.models.taxonomy import Taxonomy, TaxonomyNode


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
def Session(engine):
    return sessionmaker(bind=engine)


@pytest.fixture
def client(engine, Session):
    def override():
        db = Session()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    app.dependency_overrides[get_required_user] = lambda: type("U", (), {"id": 1})()
    app.dependency_overrides[get_current_user] = lambda: type("U", (), {"id": 1})()
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def fixture_data(Session):
    s = Session()
    org = Organization(name="T", slug="t"); s.add(org); s.flush()
    entity = Entity(code="E1", name="E1", entity_type="operating", organization_id=org.id, currency="USD")
    s.add(entity); s.flush()
    # Use the exact reported account names so we lock in the regression target.
    accounts = [
        Account(entity_id=entity.id, account_number="1000",
                account_name="Cash", account_type="asset", normal_balance="debit"),
        Account(entity_id=entity.id, account_number="1000-01",
                account_name="FHB - MLI Operating", account_type="asset", normal_balance="debit"),
    ]
    for a in accounts: s.add(a)
    s.flush()
    tx = Taxonomy(code="us_gaap", name="US GAAP", is_system=True, is_active=True)
    s.add(tx); s.flush()
    node = TaxonomyNode(
        taxonomy_id=tx.id, code="CASH", name="Cash",
        statement_type="Balance Sheet", financial_statement_section="Assets",
        normal_balance="debit", sort_order=100, level=0, is_system=True,
    )
    s.add(node); s.commit()
    out = {
        "entity_id": entity.id,
        "taxonomy_id": tx.id,
        "node_id": node.id,
        "account_ids": [a.id for a in accounts],
        "expected": [
            (accounts[0].id, "1000", "Cash"),
            (accounts[1].id, "1000-01", "FHB - MLI Operating"),
        ],
    }
    s.close()
    return out


def test_suggest_single_includes_account_number_and_name(client, fixture_data):
    aid = fixture_data["account_ids"][0]
    tx_id = fixture_data["taxonomy_id"]
    r = client.get(f"/api/v1/taxonomies/suggest/{aid}", params={"taxonomy_ids": str(tx_id)})
    assert r.status_code == 200
    suggestions = r.json()
    assert len(suggestions) >= 1
    s = suggestions[0]
    # Agent 2 hard-stop: source identifiers must come through the API.
    assert s["account_id"] == aid
    assert s["account_number"] == "1000"
    assert s["account_name"] == "Cash"


def test_bulk_suggest_embeds_per_account_context(client, fixture_data):
    aids = fixture_data["account_ids"]
    tx_id = fixture_data["taxonomy_id"]
    r = client.post(
        "/api/v1/taxonomies/suggest/bulk",
        json={"account_ids": aids, "taxonomy_ids": [tx_id]},
    )
    assert r.status_code == 200
    suggestions_by_aid = r.json()["suggestions"]
    for aid, expected_num, expected_name in fixture_data["expected"]:
        sugs = suggestions_by_aid.get(str(aid)) or suggestions_by_aid.get(aid)
        assert sugs, f"no suggestions for account {aid}"
        for s in sugs:
            # Every suggestion must carry the account context, not just the first.
            assert s["account_id"] == aid
            assert s["account_number"] == expected_num
            assert s["account_name"] == expected_name


def test_suggestion_account_fields_never_null_when_account_exists(client, fixture_data):
    """Hard stop: if the account exists, account_number must not be null
    in the API response. (This is what caused #277-style placeholders to
    appear in the UI.)"""
    aid = fixture_data["account_ids"][0]
    tx_id = fixture_data["taxonomy_id"]
    r = client.get(f"/api/v1/taxonomies/suggest/{aid}", params={"taxonomy_ids": str(tx_id)})
    suggestions = r.json()
    for s in suggestions:
        assert s["account_number"] is not None, (
            "REGRESSION: API returned a suggestion with no account_number — "
            "the UI will fall back to '#<id>' placeholders."
        )
        assert s["account_name"] is not None
