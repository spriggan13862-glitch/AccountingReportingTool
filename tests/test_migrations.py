"""
Migration discipline tests.

Proof points
------------
9.  Alembic upgrade head succeeds on a fresh database
10. Alembic downgrade base succeeds (destructive, tested on temp DB)
11. Round-trip: upgrade → downgrade → upgrade leaves DB in consistent state
"""

from __future__ import annotations

import os
import tempfile

import pytest
from alembic import command
from alembic.config import Config


def _make_alembic_cfg(db_path: str) -> Config:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    # Suppress alembic's stdout during tests
    import logging
    logging.getLogger("alembic").setLevel(logging.ERROR)
    return cfg


# ---------------------------------------------------------------------------
# 9. Upgrade succeeds on fresh database
# ---------------------------------------------------------------------------

def test_9_alembic_upgrade_head():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        cfg = _make_alembic_cfg(db_path)
        command.upgrade(cfg, "head")
        # If no exception was raised, upgrade succeeded
    finally:
        os.unlink(db_path)


# ---------------------------------------------------------------------------
# 10. Downgrade to base succeeds
# ---------------------------------------------------------------------------

def test_10_alembic_downgrade_base():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        cfg = _make_alembic_cfg(db_path)
        command.upgrade(cfg, "head")
        command.downgrade(cfg, "base")
    finally:
        os.unlink(db_path)


# ---------------------------------------------------------------------------
# 11. Round-trip: upgrade → downgrade → upgrade
# ---------------------------------------------------------------------------

def test_11_migration_roundtrip():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    try:
        cfg = _make_alembic_cfg(db_path)
        command.upgrade(cfg, "head")
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")
        # Verify the DB is functional after round-trip using a fresh engine
        from sqlalchemy import create_engine, text, pool as sa_pool
        verify_engine = create_engine(
            f"sqlite:///{db_path}",
            poolclass=sa_pool.StaticPool,
            connect_args={"check_same_thread": False},
        )
        with verify_engine.connect() as conn:
            result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
            tables = {row[0] for row in result}
        verify_engine.dispose()
        assert "users" in tables
        assert "organizations" in tables
        assert "journal_entries" in tables
    finally:
        try:
            os.unlink(db_path)
        except PermissionError:
            pass  # Windows: file may still be held briefly; CI will clean it up
