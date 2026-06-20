"""
Tests for je_impact_service.compute_je_impact().

Sprint K: NI and BS impact computed from actual JE lines via balance engine.
"""
import pytest
from unittest.mock import MagicMock
from app.services.je_impact_service import compute_je_impact


def _make_line(account_id, debit=0.0, credit=0.0):
    line = MagicMock()
    line.account_id = account_id
    line.debit = debit
    line.credit = credit
    return line


def _make_account(account_id, account_type, number='1000', name='Test Account'):
    acct = MagicMock()
    acct.id = account_id
    acct.account_type = account_type
    acct.account_number = number
    acct.account_name = name
    return acct


def _make_db(lines, accounts):
    db = MagicMock()

    class LineQuery:
        def filter_by(self, **kw):
            return self
        def all(self):
            return lines

    class AcctQuery:
        def filter(self, *a):
            return self
        def all(self):
            return accounts

    db.query.side_effect = lambda model: LineQuery() if 'JournalEntryLine' in str(model) else AcctQuery()
    return db


def test_revenue_credit_positive_ni():
    """Revenue credit entry increases NI."""
    lines = [_make_line(1, credit=1000.0)]
    accounts = [_make_account(1, 'revenue', '4000', 'Sales Revenue')]
    db = _make_db(lines, accounts)
    result = compute_je_impact(99, db)
    assert result['ni_impact'] == pytest.approx(1000.0)
    assert result['bs_impact'] == pytest.approx(0.0)


def test_expense_debit_negative_ni():
    """Expense debit entry decreases NI."""
    lines = [_make_line(1, debit=500.0)]
    accounts = [_make_account(1, 'expense', '6000', 'Rent Expense')]
    db = _make_db(lines, accounts)
    result = compute_je_impact(99, db)
    assert result['ni_impact'] == pytest.approx(-500.0)


def test_asset_debit_positive_bs():
    """Asset debit increases asset_impact and BS impact."""
    lines = [_make_line(1, debit=2000.0)]
    accounts = [_make_account(1, 'asset', '1000', 'Cash')]
    db = _make_db(lines, accounts)
    result = compute_je_impact(99, db)
    assert result['asset_impact'] == pytest.approx(2000.0)
    assert result['bs_impact'] == pytest.approx(2000.0)
    assert result['ni_impact'] == pytest.approx(0.0)


def test_standard_aje_revenue_cash():
    """Classic AJE: Dr Cash / Cr Revenue — should show +NI and +Asset."""
    lines = [
        _make_line(1, debit=1000.0),   # Cash (asset)
        _make_line(2, credit=1000.0),  # Revenue
    ]
    accounts = [
        _make_account(1, 'asset', '1000', 'Cash'),
        _make_account(2, 'revenue', '4000', 'Revenue'),
    ]
    db = _make_db(lines, accounts)
    result = compute_je_impact(99, db)
    assert result['ni_impact'] == pytest.approx(1000.0)
    assert result['asset_impact'] == pytest.approx(1000.0)
    assert result['bs_impact'] == pytest.approx(1000.0)


def test_empty_je_returns_zeros():
    """JE with no lines returns all zeros."""
    db = _make_db([], [])
    result = compute_je_impact(99, db)
    assert result['ni_impact'] == 0.0
    assert result['bs_impact'] == 0.0
    assert result['line_details'] == []


def test_line_details_populated():
    """line_details contains one entry per line with correct fields."""
    lines = [_make_line(1, credit=300.0)]
    accounts = [_make_account(1, 'revenue', '4100', 'Service Revenue')]
    db = _make_db(lines, accounts)
    result = compute_je_impact(99, db)
    assert len(result['line_details']) == 1
    detail = result['line_details'][0]
    assert detail['account_number'] == '4100'
    assert detail['debit'] == 0.0
    assert detail['credit'] == 300.0
    assert detail['presentation_amount'] == pytest.approx(300.0)


def test_liability_credit_impact():
    """Dr Expense / Cr Liability — negative NI, positive liability."""
    lines = [
        _make_line(1, debit=1000.0),   # Expense
        _make_line(2, credit=1000.0),  # Liability
    ]
    accounts = [
        _make_account(1, 'expense', '6000', 'Accrued Expense'),
        _make_account(2, 'liability', '2000', 'Accrued Liability'),
    ]
    db = _make_db(lines, accounts)
    result = compute_je_impact(99, db)
    assert result['ni_impact'] == pytest.approx(-1000.0)
    assert result['liability_impact'] == pytest.approx(1000.0)
    assert result['bs_impact'] == pytest.approx(-1000.0)


def test_double_entry_is_only_entry_bs_net_zero():
    """IS-only entry (Dr Expense / Cr Revenue) — no BS account lines, bs_impact=0."""
    lines = [
        _make_line(1, debit=800.0),    # Expense (IS)
        _make_line(2, credit=800.0),   # Revenue (IS)
    ]
    accounts = [
        _make_account(1, 'expense', '6000', 'Expense'),
        _make_account(2, 'revenue', '4000', 'Revenue'),
    ]
    db = _make_db(lines, accounts)
    result = compute_je_impact(99, db)
    assert result['asset_impact'] == pytest.approx(0.0)
    assert result['liability_impact'] == pytest.approx(0.0)
    assert result['equity_impact'] == pytest.approx(0.0)
    assert result['bs_impact'] == pytest.approx(0.0)


def test_bridge_row_structure():
    """Result always includes all required keys."""
    lines = [_make_line(1, debit=100.0)]
    accounts = [_make_account(1, 'asset', '1000', 'Cash')]
    db = _make_db(lines, accounts)
    result = compute_je_impact(99, db)
    for key in ('ni_impact', 'bs_impact', 'asset_impact', 'liability_impact', 'equity_impact', 'line_details'):
        assert key in result
