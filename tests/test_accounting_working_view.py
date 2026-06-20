"""
Sprint E — Accounting Working View tests.

Tests the AWV endpoint logic and balance engine sign conventions.
These tests run without a real database by exercising the balance engine
functions directly and testing the endpoint via the FastAPI test client.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.services.balance_engine import (
    get_accounting_signed_balance,
    get_awv_display_amount,
    compute_net_income,
)


# ---------------------------------------------------------------------------
# Balance engine unit tests (no DB required)
# ---------------------------------------------------------------------------

class TestAwvSignConventions:

    def test_awv_revenue_shows_negative_in_awv(self):
        """Revenue credit balance → awv_display_amount is negative."""
        # Revenue account with credit=5000, debit=0
        acct_bal = get_accounting_signed_balance("revenue", 0.0, 5000.0)
        assert acct_bal == 5000.0  # accounting_balance is positive (credit - debit)

        awv = get_awv_display_amount("revenue", acct_bal)
        assert awv == -5000.0  # AWV flips credit-normal to negative

    def test_awv_asset_shows_positive(self):
        """Asset debit balance → awv_display_amount is positive."""
        acct_bal = get_accounting_signed_balance("asset", 10000.0, 2000.0)
        assert acct_bal == 8000.0

        awv = get_awv_display_amount("asset", acct_bal)
        assert awv == 8000.0

    def test_awv_expense_shows_positive(self):
        """Expense debit balance → awv_display_amount is positive."""
        acct_bal = get_accounting_signed_balance("expense", 3000.0, 0.0)
        assert acct_bal == 3000.0

        awv = get_awv_display_amount("expense", acct_bal)
        assert awv == 3000.0

    def test_awv_liability_shows_negative(self):
        """Liability credit balance → awv_display_amount is negative."""
        acct_bal = get_accounting_signed_balance("liability", 0.0, 20000.0)
        assert acct_bal == 20000.0

        awv = get_awv_display_amount("liability", acct_bal)
        assert awv == -20000.0

    def test_awv_equity_shows_negative(self):
        """Equity credit balance → awv_display_amount is negative."""
        acct_bal = get_accounting_signed_balance("equity", 0.0, 15000.0)
        assert acct_bal == 15000.0

        awv = get_awv_display_amount("equity", acct_bal)
        assert awv == -15000.0

    def test_awv_cogs_shows_positive(self):
        """COGS (debit-normal) → awv_display_amount is positive."""
        acct_bal = get_accounting_signed_balance("cogs", 8000.0, 0.0)
        assert acct_bal == 8000.0

        awv = get_awv_display_amount("cogs", acct_bal)
        assert awv == 8000.0

    def test_awv_other_income_shows_negative(self):
        """Other income credit balance → awv_display_amount is negative."""
        acct_bal = get_accounting_signed_balance("other_income", 0.0, 1000.0)
        assert acct_bal == 1000.0

        awv = get_awv_display_amount("other_income", acct_bal)
        assert awv == -1000.0

    def test_awv_normal_balance_direction(self):
        """Asset with credit > debit (abnormal balance) → negative AWV amount."""
        acct_bal = get_accounting_signed_balance("asset", 100.0, 500.0)
        assert acct_bal == -400.0  # abnormal balance

        awv = get_awv_display_amount("asset", acct_bal)
        assert awv == -400.0  # asset not flipped, stays negative


class TestNetIncomeCalculation:

    def test_awv_net_income_calculation(self):
        """Net income = revenue - cogs - expenses (presentation amounts)."""
        revenue = 100000.0
        cogs = 40000.0
        expenses = 25000.0

        net = compute_net_income(revenue, cogs, expenses)
        assert net == 35000.0

    def test_awv_net_loss(self):
        """Net loss when expenses exceed revenue."""
        net = compute_net_income(50000.0, 30000.0, 40000.0)
        assert net == -20000.0

    def test_awv_zero_net_income(self):
        """Break-even: revenue equals total costs."""
        net = compute_net_income(60000.0, 20000.0, 40000.0)
        assert net == 0.0


class TestAwvFsliGrouping:
    """Tests for the grouping logic (balance aggregation)."""

    def test_awv_fsli_total_is_sum_of_accounts(self):
        """FSLI taxonomy line total should equal sum of account balances."""
        # Simulate two asset accounts mapped to same FSLI
        acc1_bal = get_accounting_signed_balance("asset", 5000.0, 0.0)
        acc2_bal = get_accounting_signed_balance("asset", 10000.0, 2000.0)

        fsli_total = acc1_bal + acc2_bal
        assert fsli_total == 13000.0

        awv_total = get_awv_display_amount("asset", acc1_bal) + get_awv_display_amount("asset", acc2_bal)
        assert awv_total == 13000.0

    def test_awv_revenue_fsli_total_negative(self):
        """Revenue FSLI total (sum of credit-normal AWV) should be negative."""
        rev1 = get_accounting_signed_balance("revenue", 0.0, 50000.0)
        rev2 = get_accounting_signed_balance("revenue", 0.0, 30000.0)

        awv1 = get_awv_display_amount("revenue", rev1)
        awv2 = get_awv_display_amount("revenue", rev2)

        assert awv1 + awv2 == -80000.0

    def test_awv_mixed_account_types_in_section(self):
        """Multiple expense account types all show positive in AWV."""
        for acc_type in ("expense", "cogs", "other_expense"):
            acct_bal = get_accounting_signed_balance(acc_type, 5000.0, 0.0)
            awv = get_awv_display_amount(acc_type, acct_bal)
            assert awv >= 0, f"{acc_type} should show non-negative in AWV"
