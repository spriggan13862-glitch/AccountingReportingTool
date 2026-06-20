"""
Tests for app.services.account_parser.
Covers all separator formats, edge cases, and the detect_account_number_format helper.
"""
import pytest
from app.services.account_parser import (
    ParsedAccount,
    parse_account_label,
    normalize_account_name,
    detect_account_number_format,
)


# ---------------------------------------------------------------------------
# parse_account_label — basic formats
# ---------------------------------------------------------------------------

def test_parse_space_separated():
    result = parse_account_label("1000 Cash")
    assert result.account_number == "1000"
    assert result.account_name == "Cash"


def test_parse_dash_separator():
    result = parse_account_label("1000 - Cash")
    assert result.account_number == "1000"
    assert result.account_name == "Cash"


def test_parse_colon_separator():
    result = parse_account_label("1000: Cash")
    assert result.account_number == "1000"
    assert result.account_name == "Cash"


def test_parse_em_dash():
    result = parse_account_label("1000 — Cash")
    assert result.account_number == "1000"
    assert result.account_name == "Cash"


def test_parse_en_dash():
    result = parse_account_label("1000 – Cash")
    assert result.account_number == "1000"
    assert result.account_name == "Cash"


def test_parse_middle_dot():
    result = parse_account_label("1000 · Cash")
    assert result.account_number == "1000"
    assert result.account_name == "Cash"


def test_parse_dot_separator():
    result = parse_account_label("1000.Cash")
    assert result.account_number == "1000"
    assert result.account_name == "Cash"


def test_parse_subaccount_dash():
    result = parse_account_label("1000-01 · Operating Account")
    assert result.account_number == "1000-01"
    assert result.account_name == "Operating Account"


def test_parse_name_only():
    result = parse_account_label("Total Assets")
    assert result.account_number is None
    assert result.account_name == "Total Assets"


def test_parse_number_only():
    result = parse_account_label("1000")
    assert result.account_number == "1000"
    assert result.account_name is None


def test_parse_extra_whitespace():
    result = parse_account_label("  1000  -  Cash  ")
    assert result.account_number == "1000"
    assert result.account_name == "Cash"


def test_parse_decimal_subaccount():
    result = parse_account_label("1000.01")
    assert result.account_number == "1000.01"
    assert result.account_name is None


def test_parse_total_row():
    result = parse_account_label("Total Assets")
    assert result.account_number is None


def test_parse_ar_trade():
    result = parse_account_label("1200-01 Accounts Receivable — Trade")
    assert result.account_number == "1200-01"
    assert result.account_name == "Accounts Receivable — Trade"


def test_parse_4digit_number_with_long_name():
    result = parse_account_label("4000 Revenue")
    assert result.account_number == "4000"
    assert result.account_name == "Revenue"


def test_parse_empty_string():
    result = parse_account_label("")
    assert result.account_number is None
    assert result.account_name is None


def test_parse_only_whitespace():
    result = parse_account_label("   ")
    assert result.account_number is None
    assert result.account_name is None


def test_parse_raw_preserved():
    raw = "  1000  -  Cash  "
    result = parse_account_label(raw)
    assert result.raw == raw


def test_parse_colon_subaccount():
    result = parse_account_label("1000:05 Petty Cash")
    assert result.account_number == "1000:05"
    assert result.account_name == "Petty Cash"


def test_parse_5digit_number():
    result = parse_account_label("10000 Cash And Equivalents")
    assert result.account_number == "10000"
    assert result.account_name == "Cash And Equivalents"


def test_parse_name_starts_with_letter():
    result = parse_account_label("Cash")
    assert result.account_number is None
    assert result.account_name == "Cash"


def test_parse_alphanumeric_number_treated_as_name():
    result = parse_account_label("REV-01 Revenue")
    assert result.account_number is None
    assert result.account_name == "REV-01 Revenue"


# ---------------------------------------------------------------------------
# normalize_account_name
# ---------------------------------------------------------------------------

def test_normalize_lowercase():
    assert normalize_account_name("Accounts Receivable") == "accounts receivable"


def test_normalize_collapse_whitespace():
    assert normalize_account_name("Cash  And   Equivalents") == "cash and equivalents"


def test_normalize_strip():
    assert normalize_account_name("  Cash  ") == "cash"


def test_normalize_removes_punctuation():
    assert normalize_account_name("Accounts Receivable, Trade") == "accounts receivable trade"


def test_normalize_keeps_hyphens():
    assert normalize_account_name("Long-term Debt") == "long-term debt"


def test_normalize_empty():
    assert normalize_account_name("") == ""


# ---------------------------------------------------------------------------
# detect_account_number_format
# ---------------------------------------------------------------------------

def test_detect_4digit():
    samples = ["1000 Cash", "2000 Accounts Payable", "3000 Equity"]
    assert detect_account_number_format(samples) == "numeric_4digit"


def test_detect_5digit():
    samples = ["10000 Cash", "20000 Payable", "30000 Equity"]
    assert detect_account_number_format(samples) == "numeric_5digit"


def test_detect_decimal():
    # Pure decimal account numbers with no name (whole string is number)
    samples = ["1.01", "2.03", "3.00"]
    assert detect_account_number_format(samples) == "decimal"


def test_detect_none():
    samples = ["Total Assets", "Subtotal", "Grand Total"]
    assert detect_account_number_format(samples) == "none"


def test_detect_empty_list():
    assert detect_account_number_format([]) == "none"
