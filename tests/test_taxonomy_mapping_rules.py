"""Tests for the default taxonomy mapping rule engine."""
from unittest.mock import MagicMock

from app.services.taxonomy_mapping_rules import (
    MappingSuggestion,
    suggest_mapping,
)


def _make_taxonomy(taxonomy_id: int = 1, code: str = "US_GAAP") -> MagicMock:
    tx = MagicMock()
    tx.id = taxonomy_id
    tx.code = code
    tx.name = code
    return tx


def _make_node(node_id: int, code: str, name: str | None = None) -> MagicMock:
    node = MagicMock()
    node.id = node_id
    node.code = code
    node.name = name or code.replace("_", " ").title()
    return node


def _make_account(
    account_id: int = 1,
    number: str = "",
    name: str = "",
    account_type: str = "",
) -> MagicMock:
    acct = MagicMock()
    acct.id = account_id
    acct.account_number = number
    acct.account_name = name
    acct.account_type = account_type
    return acct


def _make_db(nodes_by_code: dict[str, MagicMock]) -> MagicMock:
    """Mock a Session whose TaxonomyNode lookup returns by code, else None."""
    db = MagicMock()

    def filter_by(**kwargs):
        result = MagicMock()
        code = kwargs.get("code")
        result.first.return_value = nodes_by_code.get(code)
        return result

    query_obj = MagicMock()
    query_obj.filter_by.side_effect = filter_by
    db.query.return_value = query_obj
    return db


def test_keyword_match_high_confidence():
    """Account name 'Cash on Hand' matches CASH node with high confidence."""
    cash_node = _make_node(10, "CASH", "Cash")
    db = _make_db({"CASH": cash_node})
    tx = _make_taxonomy()
    acct = _make_account(name="Cash on Hand", account_type="asset")

    suggestion = suggest_mapping(acct, tx, db)

    assert suggestion is not None
    assert suggestion.node_code == "CASH"
    assert suggestion.confidence_score == 0.90
    assert suggestion.taxonomy_id == 1
    assert suggestion.taxonomy_node_id == 10


def test_keyword_match_partial_confidence():
    """Long account name with embedded keyword scores 0.75."""
    cash_node = _make_node(11, "CASH")
    db = _make_db({"CASH": cash_node})
    tx = _make_taxonomy()
    # "cash" is 4 chars; full name is much longer so keyword < half
    acct = _make_account(
        name="Main Operating Bank Account With Cash Held In Escrow Reserves",
        account_type="asset",
    )

    suggestion = suggest_mapping(acct, tx, db)

    assert suggestion is not None
    assert suggestion.node_code == "CASH"
    assert suggestion.confidence_score == 0.75


def test_number_range_match():
    """Account number 1050 with no name match falls back to CASH range."""
    cash_node = _make_node(12, "CASH")
    db = _make_db({"CASH": cash_node})
    tx = _make_taxonomy()
    acct = _make_account(number="1050", name="Zzz Untitled", account_type="asset")

    suggestion = suggest_mapping(acct, tx, db)

    assert suggestion is not None
    assert suggestion.node_code == "CASH"
    assert suggestion.confidence_score == 0.60


def test_account_type_fallback():
    """account_type='revenue' with no other match -> REVENUE_SALES at 0.40."""
    sales_node = _make_node(20, "REVENUE_SALES", "Sales Revenue")
    db = _make_db({"REVENUE_SALES": sales_node})
    tx = _make_taxonomy()
    acct = _make_account(name="Zzz Untitled", account_type="revenue")

    suggestion = suggest_mapping(acct, tx, db)

    assert suggestion is not None
    assert suggestion.node_code == "REVENUE_SALES"
    assert suggestion.confidence_score == 0.40


def test_no_match_returns_none():
    """Account with no matchable keyword/number/type returns None."""
    db = _make_db({})
    tx = _make_taxonomy()
    acct = _make_account(name="Zzz Untitled", account_type="")

    suggestion = suggest_mapping(acct, tx, db)

    assert suggestion is None


def test_payroll_tax_keyword():
    """'6100 Payroll Tax' resolves to PAYROLL_TAXES with high confidence."""
    payroll_tax_node = _make_node(30, "PAYROLL_TAXES", "Payroll Taxes")
    db = _make_db({"PAYROLL_TAXES": payroll_tax_node})
    tx = _make_taxonomy()
    acct = _make_account(number="6100", name="6100 Payroll Tax", account_type="expense")

    suggestion = suggest_mapping(acct, tx, db)

    assert suggestion is not None
    assert suggestion.node_code == "PAYROLL_TAXES"
    assert suggestion.confidence_score >= 0.75


def test_deferred_revenue_keyword():
    """'Deferred Revenue - Q4 SaaS' resolves to DEFERRED_REVENUE high confidence."""
    deferred_node = _make_node(40, "DEFERRED_REVENUE", "Deferred Revenue")
    db = _make_db({"DEFERRED_REVENUE": deferred_node})
    tx = _make_taxonomy()
    acct = _make_account(
        number="2900",
        name="Deferred Revenue - Q4 SaaS",
        account_type="liability",
    )

    suggestion = suggest_mapping(acct, tx, db)

    assert suggestion is not None
    assert suggestion.node_code == "DEFERRED_REVENUE"
    assert suggestion.confidence_score >= 0.75
    assert isinstance(suggestion, MappingSuggestion)
