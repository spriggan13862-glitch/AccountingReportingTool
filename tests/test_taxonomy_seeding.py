"""
Tests for system taxonomy seed JSON files and the seed loader.

Covers:
- JSON validity and required keys
- Presence of all 11 expected taxonomy seed files
- End-to-end seeding into an in-memory SQLite database
- Uniqueness of node codes within each taxonomy
- Idempotency of seed_system_taxonomies()
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 — registers all models with Base.metadata
from app.database import Base
from app.models.taxonomy import Taxonomy, TaxonomyNode
from app.services.taxonomy_library_service import seed_system_taxonomies


SEED_DIR = Path(__file__).resolve().parent.parent / "data" / "taxonomies"

EXPECTED_TAXONOMY_CODES = {
    "us_gaap",
    "ifrs",
    "management",
    "saas",
    "healthcare",
    "manufacturing",
    "construction",
    "real_estate",
    "financial_services",
    "nonprofit",
    "spac_public",
}


def _flatten_codes(nodes: list[dict]) -> list[str]:
    out: list[str] = []
    for n in nodes:
        out.append(n["code"])
        out.extend(_flatten_codes(n.get("children", [])))
    return out


def _fresh_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _set_pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys = ON")
        cur.close()

    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session(), engine


def test_all_seed_files_valid_json():
    json_files = sorted(SEED_DIR.glob("*.json"))
    assert json_files, f"No seed JSON files found in {SEED_DIR}"
    for path in json_files:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for required_key in ("code", "name", "nodes"):
            assert required_key in data, f"{path.name} missing required key '{required_key}'"
        assert isinstance(data["nodes"], list) and data["nodes"], (
            f"{path.name} 'nodes' must be a non-empty list"
        )


def test_all_eleven_taxonomies_present():
    json_files = sorted(SEED_DIR.glob("*.json"))
    file_stems = {p.stem for p in json_files}
    assert file_stems == EXPECTED_TAXONOMY_CODES, (
        f"Seed file mismatch.\n"
        f"  Missing: {EXPECTED_TAXONOMY_CODES - file_stems}\n"
        f"  Extra:   {file_stems - EXPECTED_TAXONOMY_CODES}"
    )

    seen_codes = set()
    for path in json_files:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        assert data["code"] == path.stem, (
            f"{path.name} top-level code '{data['code']}' does not match filename"
        )
        seen_codes.add(data["code"])
    assert seen_codes == EXPECTED_TAXONOMY_CODES


def test_seed_loads_into_db():
    session, engine = _fresh_session()
    try:
        results = seed_system_taxonomies(session)
        assert len(results) == 11, f"Expected 11 taxonomies seeded, got {len(results)}"

        taxonomies = session.query(Taxonomy).filter_by(is_system=True).all()
        assert len(taxonomies) == 11
        assert {tx.code for tx in taxonomies} == EXPECTED_TAXONOMY_CODES

        for tx in taxonomies:
            node_count = session.query(TaxonomyNode).filter_by(taxonomy_id=tx.id).count()
            assert node_count > 0, f"Taxonomy {tx.code} has no nodes"
            assert results[tx.code] == node_count
    finally:
        session.close()
        engine.dispose()


def test_no_duplicate_codes_within_taxonomy():
    for path in sorted(SEED_DIR.glob("*.json")):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        codes = _flatten_codes(data["nodes"])
        duplicates = {c for c in codes if codes.count(c) > 1}
        assert not duplicates, (
            f"{path.name} contains duplicate node codes: {sorted(duplicates)}"
        )


def test_idempotent_seeding():
    session, engine = _fresh_session()
    try:
        first = seed_system_taxonomies(session)
        first_taxonomy_count = session.query(Taxonomy).count()
        first_node_count = session.query(TaxonomyNode).count()

        second = seed_system_taxonomies(session)
        second_taxonomy_count = session.query(Taxonomy).count()
        second_node_count = session.query(TaxonomyNode).count()

        assert first == second
        assert first_taxonomy_count == second_taxonomy_count == 11
        assert first_node_count == second_node_count
    finally:
        session.close()
        engine.dispose()
