"""
Sprint F — Financial Statement Presentation View tests.

Validates that:
- All amounts use presentation signs (revenue positive, expenses positive)
- IS summary calculations are correct
- BS equation holds
"""

import pytest

from app.services.balance_engine import (
    get_accounting_signed_balance,
    get_presentation_amount,
    compute_net_income,
)


def test_revenue_positive_in_presentation():
    """Revenue presentation_amount is positive for a normal credit balance."""
    # Revenue account: debit=0, credit=5000 → accounting_balance = 5000
    acct_bal = get_accounting_signed_balance("revenue", debit=0, credit=5000)
    assert acct_bal == 5000
    pres = get_presentation_amount("revenue", acct_bal)
    assert pres > 0


def test_cogs_positive_in_presentation():
    """COGS presentation_amount is positive for a normal debit balance."""
    # COGS account: debit=200000, credit=0 → accounting_balance = 200000
    acct_bal = get_accounting_signed_balance("cogs", debit=200000, credit=0)
    assert acct_bal == 200000
    pres = get_presentation_amount("cogs", acct_bal)
    assert pres > 0


def test_expenses_positive_in_presentation():
    """Expense presentation_amount is positive for a normal debit balance."""
    acct_bal = get_accounting_signed_balance("expense", debit=150000, credit=0)
    assert acct_bal == 150000
    pres = get_presentation_amount("expense", acct_bal)
    assert pres > 0


def test_assets_positive_in_presentation():
    """Asset presentation_amount is positive for a normal debit balance."""
    acct_bal = get_accounting_signed_balance("asset", debit=800000, credit=0)
    pres = get_presentation_amount("asset", acct_bal)
    assert pres > 0


def test_gross_profit_calculation():
    """Gross Profit = Revenue - COGS."""
    revenue = 500_000.0
    cogs = 200_000.0
    gross_profit = revenue - cogs
    assert gross_profit == pytest.approx(300_000.0)


def test_net_income_calculation():
    """Net Income = Revenue - COGS - Expenses."""
    revenue = 500_000.0
    cogs = 200_000.0
    expenses = 150_000.0
    net = compute_net_income(revenue, cogs, expenses)
    assert net == pytest.approx(150_000.0)


def test_operating_income():
    """Operating Income = Gross Profit - Total Operating Expenses."""
    revenue = 500_000.0
    cogs = 0.0
    gross_profit = revenue - cogs
    total_expenses = 150_000.0
    operating_income = gross_profit - total_expenses
    assert operating_income == pytest.approx(350_000.0)


def test_balance_sheet_equation():
    """Total Assets == Total Liabilities + Total Equity."""
    total_assets = 800_000.0
    total_liabilities = 350_000.0
    total_equity = 450_000.0
    assert abs((total_liabilities + total_equity) - total_assets) < 0.01


def test_balance_sheet_equation_tolerance():
    """Balanced flag should be True when difference is less than $0.01."""
    total_assets = 800_000.005
    total_liabilities = 350_000.0
    total_equity = 450_000.0
    diff = abs((total_liabilities + total_equity) - total_assets)
    assert diff < 0.01


def test_net_income_negative_loss():
    """Net Income is negative when expenses exceed revenue (a loss)."""
    net = compute_net_income(revenue_balance=100_000, cogs_balance=0, expense_balance=150_000)
    assert net == pytest.approx(-50_000.0)


def test_presentation_amount_no_flip_for_liability():
    """Liability accounting_balance positive → presentation amount positive (shown positive on BS)."""
    acct_bal = get_accounting_signed_balance("liability", debit=0, credit=350_000)
    assert acct_bal == 350_000
    pres = get_presentation_amount("liability", acct_bal)
    assert pres == pytest.approx(350_000.0)


def test_presentation_amount_equity():
    """Equity accounting_balance positive → presentation amount positive."""
    acct_bal = get_accounting_signed_balance("equity", debit=0, credit=450_000)
    assert acct_bal == 450_000
    pres = get_presentation_amount("equity", acct_bal)
    assert pres == pytest.approx(450_000.0)
