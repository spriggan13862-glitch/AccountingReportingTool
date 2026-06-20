"""
Tests for app.services.account_matching.
Uses an in-memory SQLite DB with seeded accounts.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.account import Account
from app.services.account_parser import ParsedAccount, parse_account_label
from app.services.account_matching import (
    MatchStatus,
    find_best_match,
    names_are_compatible,
    types_conflict,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


ENTITY_ID = 99


@pytest.fixture(scope="module")
def seeded(db):
    accounts = [
        Account(account_number="1000", account_name="Cash",
                account_type="asset", normal_balance="debit", entity_id=ENTITY_ID),
        Account(account_number="1100", account_name="Accounts Receivable",
                account_type="asset", normal_balance="debit", entity_id=ENTITY_ID),
        Account(account_number="1200", account_name="Inventory",
                account_type="asset", normal_balance="debit", entity_id=ENTITY_ID),
        Account(account_number="2000", account_name="Accounts Payable",
                account_type="liability", normal_balance="credit", entity_id=ENTITY_ID),
        Account(account_number="4000", account_name="Revenue",
                account_type="revenue", normal_balance="credit", entity_id=ENTITY_ID),
    ]
    for a in accounts:
        db.add(a)
    db.flush()
    return accounts


# ---------------------------------------------------------------------------
# find_best_match tests
# ---------------------------------------------------------------------------

def test_exact_match(db, seeded):
    parsed = parse_account_label("1000 Cash")
    result = find_best_match(parsed, ENTITY_ID, db)
    assert result.status == MatchStatus.EXACT
    assert result.confidence == 1.0
    assert result.matched_account is not None
    assert result.matched_account.account_number == "1000"


def test_exact_match_ar(db, seeded):
    parsed = parse_account_label("1100 Accounts Receivable")
    result = find_best_match(parsed, ENTITY_ID, db)
    assert result.status == MatchStatus.EXACT
    assert result.matched_account.account_number == "1100"


def test_number_only_same_type(db, seeded):
    # 1200 exists as Inventory (asset); we parse "1200 Accounts Receivable" (asset type)
    parsed = parse_account_label("1200 Accounts Receivable")
    result = find_best_match(parsed, ENTITY_ID, db, account_type_hint="asset")
    assert result.status == MatchStatus.NUMBER_ONLY
    assert result.confidence == 0.9
    assert result.matched_account.account_number == "1200"


def test_conflict_type_mismatch(db, seeded):
    # 4000 is revenue; if we try to match it as asset → CONFLICT
    parsed = parse_account_label("4000 Cash")
    result = find_best_match(parsed, ENTITY_ID, db, account_type_hint="asset")
    assert result.status == MatchStatus.CONFLICT
    assert result.confidence == 0.0
    assert result.conflict_reason is not None
    assert "4000" in result.conflict_reason


def test_no_match(db, seeded):
    parsed = parse_account_label("9999 Unknown Account")
    result = find_best_match(parsed, ENTITY_ID, db)
    assert result.status == MatchStatus.NO_MATCH
    assert result.confidence == 0.0
    assert result.matched_account is None


def test_name_only_match(db, seeded):
    parsed = ParsedAccount(account_number=None, account_name="Revenue", raw="Revenue")
    result = find_best_match(parsed, ENTITY_ID, db)
    assert result.status == MatchStatus.NAME_ONLY
    assert result.confidence == 0.7
    assert result.matched_account.account_number == "4000"


def test_parent_match(db, seeded):
    # 1000 exists as Cash; parse "1000-01 Operating" → parent match to 1000
    parsed = parse_account_label("1000-01 Operating")
    result = find_best_match(parsed, ENTITY_ID, db)
    assert result.status == MatchStatus.PARENT
    assert result.confidence == 0.6
    assert result.matched_account.account_number == "1000"
    assert result.suggested_number == "1000"


def test_no_match_different_entity(db, seeded):
    parsed = parse_account_label("1000 Cash")
    result = find_best_match(parsed, 9999, db)
    assert result.status == MatchStatus.NO_MATCH


# ---------------------------------------------------------------------------
# names_are_compatible tests
# ---------------------------------------------------------------------------

def test_names_compatible_equal():
    assert names_are_compatible("Cash", "Cash") is True


def test_names_compatible_substring():
    assert names_are_compatible("Accounts Receivable Trade", "Accounts Receivable") is True


def test_names_compatible_blank_proposed():
    assert names_are_compatible("Cash", "") is True


def test_names_compatible_blank_existing():
    assert names_are_compatible("", "Cash") is True


def test_names_not_compatible():
    assert names_are_compatible("Inventory", "Revenue") is False


# ---------------------------------------------------------------------------
# types_conflict tests
# ---------------------------------------------------------------------------

def test_types_no_conflict_same():
    assert types_conflict("asset", "asset") is False


def test_types_no_conflict_blank():
    assert types_conflict("asset", None) is False
    assert types_conflict("asset", "") is False


def test_types_conflict_asset_vs_revenue():
    assert types_conflict("revenue", "asset") is True


def test_types_conflict_liability_vs_revenue():
    assert types_conflict("liability", "revenue") is True


def test_types_no_conflict_expense_and_revenue_same_group():
    # Both income statement items — mapped to the same group, so no fundamental type conflict
    assert types_conflict("revenue", "expense") is False


def test_types_no_conflict_asset_and_liability():
    # Both balance sheet items — not a type group conflict
    assert types_conflict("asset", "liability") is False
