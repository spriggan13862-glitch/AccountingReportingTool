"""
Tests for app/services/balance_engine.py — Sprint D accounting balance engine.

Covers:
- Normal balance detection by account type
- Accounting signed balance computation (debit-normal and credit-normal)
- Presentation amount conversion
- AWV display amount (flip credit-normal accounts negative)
- Net income calculation
- Balance sheet equation
"""
from decimal import Decimal

import pytest

from app.services.balance_engine import (
    BalanceView,
    get_normal_balance,
    get_accounting_signed_balance,
    get_presentation_amount,
    get_awv_display_amount,
    compute_net_income,
    format_accounting_view_amount,
)


# ---------------------------------------------------------------------------
# Normal balance
# ---------------------------------------------------------------------------

def test_asset_normal_balance():
    assert get_normal_balance('asset') == 'debit'


def test_expense_normal_balance():
    assert get_normal_balance('expense') == 'debit'


def test_cogs_normal_balance():
    assert get_normal_balance('cogs') == 'debit'


def test_revenue_normal_balance():
    assert get_normal_balance('revenue') == 'credit'


def test_liability_normal_balance():
    assert get_normal_balance('liability') == 'credit'


def test_equity_normal_balance():
    assert get_normal_balance('equity') == 'credit'


def test_other_income_normal_balance():
    assert get_normal_balance('other_income') == 'credit'


def test_contra_asset_normal_balance():
    assert get_normal_balance('contra_asset') == 'credit'


def test_unknown_type_defaults_debit():
    assert get_normal_balance('unknown_type') == 'debit'


# ---------------------------------------------------------------------------
# Accounting signed balance
# ---------------------------------------------------------------------------

def test_asset_accounting_balance():
    # Asset debit=1000, credit=200 → 800
    assert get_accounting_signed_balance('asset', 1000, 200) == 800.0


def test_asset_zero_credit():
    assert get_accounting_signed_balance('asset', 5000, 0) == 5000.0


def test_revenue_accounting_balance():
    # Revenue credit-normal: credit=5000, debit=0 → 5000 (positive = earned)
    assert get_accounting_signed_balance('revenue', 0, 5000) == 5000.0


def test_expense_accounting_balance():
    # Expense debit=3000, credit=0 → 3000
    assert get_accounting_signed_balance('expense', 3000, 0) == 3000.0


def test_liability_accounting_balance():
    # Liability credit-normal: credit=10200, debit=200 → 10000
    assert get_accounting_signed_balance('liability', 200, 10200) == 10000.0


def test_equity_accounting_balance():
    assert get_accounting_signed_balance('equity', 0, 40000) == 40000.0


def test_contra_asset_accounting_balance():
    # Accumulated depreciation: credit=5000, debit=0 → 5000 (positive = offsets asset)
    assert get_accounting_signed_balance('contra_asset', 0, 5000) == 5000.0


def test_abnormal_balance_returns_negative():
    # Asset with credit > debit → negative (abnormal)
    assert get_accounting_signed_balance('asset', 0, 500) == -500.0


def test_decimal_inputs_accepted():
    result = get_accounting_signed_balance('asset', Decimal('1000'), Decimal('200'))
    assert result == 800.0


# ---------------------------------------------------------------------------
# Presentation amount
# ---------------------------------------------------------------------------

def test_asset_presentation_no_flip():
    # Asset: presentation = accounting (both positive)
    assert get_presentation_amount('asset', 800.0) == 800.0


def test_revenue_presentation_no_flip():
    # Revenue accounting_balance=5000 → presentation=5000 (no flip needed at this layer)
    # Both views show the same number; AWV does the flip at display time
    assert get_presentation_amount('revenue', 5000.0) == 5000.0


def test_liability_presentation_no_flip():
    accounting = get_accounting_signed_balance('liability', 200, 10200)
    presentation = get_presentation_amount('liability', accounting)
    assert presentation == 10000.0


def test_sign_behavior_negative_flips():
    # sign_behavior='negative' forces flip regardless of type
    assert get_presentation_amount('asset', 800.0, sign_behavior='negative') == -800.0


def test_sign_behavior_contra_flips():
    assert get_presentation_amount('asset', 500.0, sign_behavior='contra') == -500.0


def test_sign_behavior_positive_no_flip():
    assert get_presentation_amount('revenue', 5000.0, sign_behavior='positive') == 5000.0


# ---------------------------------------------------------------------------
# AWV display amount
# ---------------------------------------------------------------------------

def test_asset_awv_positive():
    # Asset debit-normal → stays positive in AWV
    assert get_awv_display_amount('asset', 800.0) == 800.0


def test_expense_awv_positive():
    assert get_awv_display_amount('expense', 3000.0) == 3000.0


def test_revenue_awv_negative():
    # Revenue credit-normal → flipped negative in AWV (debit-dominant world)
    assert get_awv_display_amount('revenue', 5000.0) == -5000.0


def test_liability_awv_negative():
    assert get_awv_display_amount('liability', 10000.0) == -10000.0


def test_equity_awv_negative():
    assert get_awv_display_amount('equity', 40000.0) == -40000.0


def test_contra_asset_awv_negative():
    # Contra-asset has credit normal balance → flipped in AWV
    assert get_awv_display_amount('contra_asset', 5000.0) == -5000.0


# ---------------------------------------------------------------------------
# Net income
# ---------------------------------------------------------------------------

def test_net_income_basic():
    # Revenue=50000, COGS=20000, Expenses=15000 → NI=15000
    assert compute_net_income(50000, 20000, 15000) == 15000.0


def test_net_income_zero():
    assert compute_net_income(0, 0, 0) == 0.0


def test_net_income_loss():
    # Revenue=10000, COGS=8000, Expenses=5000 → NI=-3000
    assert compute_net_income(10000, 8000, 5000) == -3000.0


def test_net_income_from_je_data():
    # Revenue: credit=1000, debit=0 → accounting_balance=1000
    # COGS: debit=600, credit=0 → accounting_balance=600
    # Depr: debit=100, credit=0 → accounting_balance=100
    rev = get_accounting_signed_balance('revenue', 0, 1000)    # 1000
    cogs = get_accounting_signed_balance('expense', 600, 0)    # 600
    depr = get_accounting_signed_balance('expense', 100, 0)    # 100
    ni = compute_net_income(rev, cogs + depr, 0)
    assert ni == 300.0


# ---------------------------------------------------------------------------
# Balance sheet equation: Assets = Liabilities + Equity
# ---------------------------------------------------------------------------

def test_balance_sheet_equation():
    assets = get_accounting_signed_balance('asset', 100000, 0)      # 100000
    liabilities = get_accounting_signed_balance('liability', 0, 60000)  # 60000
    equity = get_accounting_signed_balance('equity', 0, 40000)      # 40000
    assert assets == liabilities + equity


def test_double_entry_balance():
    # All sides of a balanced JE: total net_debit == 0
    # JE: debit Cash 1000, credit Revenue 1000
    cash_nd = 1000 - 0       # net debit for cash
    rev_nd = 0 - 1000        # net debit for revenue (negative = credit)
    assert cash_nd + rev_nd == 0


# ---------------------------------------------------------------------------
# BalanceView enum
# ---------------------------------------------------------------------------

def test_balance_view_enum_values():
    assert BalanceView.ACCOUNTING == "accounting"
    assert BalanceView.PRESENTATION == "presentation"


# ---------------------------------------------------------------------------
# format_accounting_view_amount
# ---------------------------------------------------------------------------

def test_format_awv_positive_amount():
    result = format_accounting_view_amount(800.0, 'asset')
    assert result['amount'] == 800.0
    assert result['is_normal'] is True
    assert result['display_sign'] == '+'
    assert result['color_hint'] == 'positive'


def test_format_awv_negative_amount():
    # Abnormal balance (asset with credit > debit)
    result = format_accounting_view_amount(-200.0, 'asset')
    assert result['is_normal'] is False
    assert result['display_sign'] == '-'
    assert result['color_hint'] == 'negative'


def test_format_awv_zero_amount():
    result = format_accounting_view_amount(0.0, 'asset')
    assert result['color_hint'] == 'neutral'
