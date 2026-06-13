"""Tests for Sprint 3.15 — Advisor Scenarios API."""
from __future__ import annotations

import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base
from app.api.deps import get_db, get_current_user
from app.main import app
from app.models.advisor_scenario import AdvisorScenario, AdvisorScenarioPackage
from app.models.adjustment_workspace import AdjustmentPackage

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
        try:
            yield db_session
        finally:
            db_session.flush()

    class FakeUser:
        id = 1
        organization_id = "test-org"
        is_superuser = False

    app.dependency_overrides[get_db] = override
    app.dependency_overrides[get_current_user] = lambda: FakeUser()
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def pkg(db_session) -> AdjustmentPackage:
    p = AdjustmentPackage(
        organization_id="test-org",
        name="Audit Package",
        package_type="audit",
    )
    db_session.add(p)
    db_session.flush()
    return p


@pytest.fixture()
def pkg2(db_session) -> AdjustmentPackage:
    p = AdjustmentPackage(
        organization_id="test-org",
        name="Management Package",
        package_type="management",
    )
    db_session.add(p)
    db_session.flush()
    return p


# ---------------------------------------------------------------------------
# Scenario CRUD
# ---------------------------------------------------------------------------

class TestAdvisorScenarioCRUD:
    def test_create_scenario(self, client):
        r = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "As Reported",
            "scenario_type": "as_reported",
        })
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "As Reported"
        assert data["scenario_type"] == "as_reported"
        assert data["packages"] == []

    def test_create_scenario_default_type_custom(self, client):
        r = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "My Scenario",
        })
        assert r.status_code == 201
        assert r.json()["scenario_type"] == "custom"

    def test_create_scenario_with_description(self, client):
        r = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "SBA View",
            "scenario_type": "sba",
            "description": "SBA adjusted view",
        })
        assert r.status_code == 201
        assert r.json()["description"] == "SBA adjusted view"

    def test_create_scenario_invalid_type(self, client):
        r = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "Bad",
            "scenario_type": "invalid_type",
        })
        assert r.status_code == 422

    def test_list_scenarios_empty(self, client):
        r = client.get(f"{BASE}/adjustment-workspace/advisor-scenarios")
        assert r.status_code == 200
        assert r.json() == []

    def test_list_scenarios_returns_created(self, client):
        client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={"name": "S1"})
        client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={"name": "S2"})
        r = client.get(f"{BASE}/adjustment-workspace/advisor-scenarios")
        assert r.status_code == 200
        names = [s["name"] for s in r.json()]
        assert "S1" in names
        assert "S2" in names

    def test_get_scenario_by_id(self, client):
        created = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "Management View",
            "scenario_type": "management",
        }).json()
        r = client.get(f"{BASE}/adjustment-workspace/advisor-scenarios/{created['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == created["id"]
        assert r.json()["name"] == "Management View"

    def test_get_scenario_not_found(self, client):
        r = client.get(f"{BASE}/adjustment-workspace/advisor-scenarios/99999")
        assert r.status_code == 404

    def test_update_scenario_name(self, client):
        created = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "Old Name",
        }).json()
        r = client.put(f"{BASE}/adjustment-workspace/advisor-scenarios/{created['id']}", json={
            "name": "New Name",
        })
        assert r.status_code == 200
        assert r.json()["name"] == "New Name"

    def test_update_scenario_type(self, client):
        created = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "Test",
            "scenario_type": "custom",
        }).json()
        r = client.put(f"{BASE}/adjustment-workspace/advisor-scenarios/{created['id']}", json={
            "scenario_type": "management_tax",
        })
        assert r.status_code == 200
        assert r.json()["scenario_type"] == "management_tax"

    def test_delete_scenario(self, client):
        created = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "To Delete",
        }).json()
        r = client.delete(f"{BASE}/adjustment-workspace/advisor-scenarios/{created['id']}")
        assert r.status_code == 204
        r2 = client.get(f"{BASE}/adjustment-workspace/advisor-scenarios/{created['id']}")
        assert r2.status_code == 404

    def test_delete_scenario_not_found(self, client):
        r = client.delete(f"{BASE}/adjustment-workspace/advisor-scenarios/99999")
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Package composition
# ---------------------------------------------------------------------------

class TestScenarioPackageComposition:
    def test_add_package_to_scenario(self, client, pkg):
        scen = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "With Packages",
        }).json()
        r = client.post(
            f"{BASE}/adjustment-workspace/advisor-scenarios/{scen['id']}/packages",
            json={"package_id": pkg.id, "included": True, "include_order": 0},
        )
        assert r.status_code == 201
        assert r.json().get("added") is True

    def test_add_package_idempotent_updates(self, client, pkg):
        scen = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "Idempotent",
        }).json()
        url = f"{BASE}/adjustment-workspace/advisor-scenarios/{scen['id']}/packages"
        client.post(url, json={"package_id": pkg.id, "included": True, "include_order": 0})
        r = client.post(url, json={"package_id": pkg.id, "included": False, "include_order": 1})
        assert r.status_code == 201
        assert r.json().get("updated") is True

    def test_add_nonexistent_package(self, client):
        scen = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "Test",
        }).json()
        r = client.post(
            f"{BASE}/adjustment-workspace/advisor-scenarios/{scen['id']}/packages",
            json={"package_id": 99999, "included": True},
        )
        assert r.status_code == 404

    def test_remove_package_from_scenario(self, client, pkg):
        scen = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "With Pkg",
        }).json()
        client.post(
            f"{BASE}/adjustment-workspace/advisor-scenarios/{scen['id']}/packages",
            json={"package_id": pkg.id, "included": True},
        )
        r = client.delete(
            f"{BASE}/adjustment-workspace/advisor-scenarios/{scen['id']}/packages/{pkg.id}",
        )
        assert r.status_code == 204

    def test_remove_nonexistent_package_link(self, client, pkg):
        scen = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "Test",
        }).json()
        r = client.delete(
            f"{BASE}/adjustment-workspace/advisor-scenarios/{scen['id']}/packages/{pkg.id}",
        )
        assert r.status_code == 404

    def test_toggle_package_included(self, client, pkg):
        scen = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "Toggle Test",
        }).json()
        client.post(
            f"{BASE}/adjustment-workspace/advisor-scenarios/{scen['id']}/packages",
            json={"package_id": pkg.id, "included": True},
        )
        r = client.patch(
            f"{BASE}/adjustment-workspace/advisor-scenarios/{scen['id']}/packages/{pkg.id}/toggle",
            json={"included": False},
        )
        assert r.status_code == 200
        pkgs = r.json()["packages"]
        found = next((p for p in pkgs if p["package_id"] == pkg.id), None)
        assert found is not None
        assert found["included"] is False

    def test_scenario_out_includes_packages(self, client, pkg, pkg2):
        scen = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "Multi Pkg",
        }).json()
        client.post(
            f"{BASE}/adjustment-workspace/advisor-scenarios/{scen['id']}/packages",
            json={"package_id": pkg.id, "included": True, "include_order": 0},
        )
        client.post(
            f"{BASE}/adjustment-workspace/advisor-scenarios/{scen['id']}/packages",
            json={"package_id": pkg2.id, "included": True, "include_order": 1},
        )
        r = client.get(f"{BASE}/adjustment-workspace/advisor-scenarios/{scen['id']}")
        assert r.status_code == 200
        pkg_ids = [p["package_id"] for p in r.json()["packages"]]
        assert pkg.id in pkg_ids
        assert pkg2.id in pkg_ids


# ---------------------------------------------------------------------------
# Comparison endpoint
# ---------------------------------------------------------------------------

class TestScenarioComparison:
    def test_compare_returns_result_structure(self, client):
        s1 = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "As Reported",
            "scenario_type": "as_reported",
        }).json()
        s2 = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "Management",
            "scenario_type": "management",
        }).json()
        r = client.get(
            f"{BASE}/adjustment-workspace/advisor-scenarios/compare",
            params={"scenario_ids": [s1["id"], s2["id"]], "entity_id": 1},
        )
        assert r.status_code == 200
        data = r.json()
        assert "scenarios" in data
        assert len(data["scenarios"]) == 2

    def test_compare_skips_missing_scenario(self, client):
        s1 = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "Real",
        }).json()
        r = client.get(
            f"{BASE}/adjustment-workspace/advisor-scenarios/compare",
            params={"scenario_ids": [s1["id"], 99999], "entity_id": 1},
        )
        assert r.status_code == 200
        assert len(r.json()["scenarios"]) == 1

    def test_compare_zero_impact_with_no_packages(self, client):
        s1 = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": "Empty",
        }).json()
        r = client.get(
            f"{BASE}/adjustment-workspace/advisor-scenarios/compare",
            params={"scenario_ids": [s1["id"]], "entity_id": 1},
        )
        assert r.status_code == 200
        impact = r.json()["scenarios"][0]["impact"]
        assert float(impact["ni_impact"]) == 0.0
        assert float(impact["ebitda_impact"]) == 0.0


# ---------------------------------------------------------------------------
# All scenario types accepted
# ---------------------------------------------------------------------------

class TestScenarioTypeValidation:
    @pytest.mark.parametrize("stype", [
        "as_reported", "management", "management_tax", "management_tax_qoe", "sba", "custom"
    ])
    def test_all_valid_types_accepted(self, client, stype):
        r = client.post(f"{BASE}/adjustment-workspace/advisor-scenarios", json={
            "name": f"Test {stype}",
            "scenario_type": stype,
        })
        assert r.status_code == 201
        assert r.json()["scenario_type"] == stype
