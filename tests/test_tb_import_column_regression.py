"""
Regression tests for the TB import column-mapping bug.

User-reported: a TB upload where Column B held "1000 · Cash" and Column C
held debit amounts (0, 20.16, 2.38, 745.33) was being processed with
Column C mapped as account_number, producing fake accounts like
"20.16 Imported Account 1" in the Mapping Workbench.

These tests lock down:
  1. Combined "1000 · Cash" / "1000-01 · FHB - MLI Operating" splits correctly.
  2. Auto-detection picks the combined column when headers are ambiguous.
  3. Amount-shaped column data is never auto-detected as account_number.
  4. validate_column_mapping_against_data warns when a user maps an amount
     column as account_number.
  5. _interpret_row honors the explicit account_combined field.
"""
import pytest
from decimal import Decimal
from app.services.import_batch_service import (
    parse_combined_account_field,
    auto_detect_column_mapping,
    infer_column_type_from_data,
    validate_column_mapping_against_data,
    _interpret_row,
)


# ---------------------------------------------------------------------------
# 1. Combined field parsing
# ---------------------------------------------------------------------------

class TestParseCombined:
    def test_dot_middle_dot_separator(self):
        # The user's exact format: "1000 · Cash"
        num, name = parse_combined_account_field("1000 · Cash")
        assert num == "1000"
        assert name == "Cash"

    def test_subaccount_with_middot(self):
        num, name = parse_combined_account_field("1000-01 · FHB - MLI Operating")
        assert num == "1000-01"
        assert name == "FHB - MLI Operating"

    def test_subaccount_with_hash(self):
        num, name = parse_combined_account_field("1000-02 · FHB - MLI Merch Acct# 7624")
        assert num == "1000-02"
        assert name == "FHB - MLI Merch Acct# 7624"

    def test_dash_separator(self):
        num, name = parse_combined_account_field("4000 - Revenue")
        assert num == "4000"
        assert name == "Revenue"

    def test_pure_amount_not_parsed_as_account(self):
        # The bug: amount-like values should NOT be split into (number, name).
        # parse_combined_account_field returns (raw, "") when no match — caller
        # detects empty name and keeps the raw, but the upstream guardrail must
        # catch this before it reaches the parser.
        num, name = parse_combined_account_field("20.16")
        assert num == "20.16"
        assert name == ""

    def test_zero_amount_not_parsed(self):
        num, name = parse_combined_account_field("0")
        assert num == "0"
        assert name == ""


# ---------------------------------------------------------------------------
# 2. Data-based column type inference
# ---------------------------------------------------------------------------

class TestInferColumnType:
    def test_amount_column_decimals(self):
        values = ["0", "20.16", "2.38", "745.33", "0", "1234.56"]
        assert infer_column_type_from_data(values) == "amount"

    def test_amount_column_with_currency_symbols(self):
        values = ["$100", "$25.50", "($300.00)", "$1,234.99"]
        assert infer_column_type_from_data(values) == "amount"

    def test_combined_account_column(self):
        values = [
            "1000 · Cash",
            "1000-01 · FHB - MLI Operating",
            "1000-02 · FHB - MLI Merch Acct# 7624",
            "4000 · Revenue",
        ]
        assert infer_column_type_from_data(values) == "account_combined"

    def test_short_code_account_number(self):
        values = ["1000", "1001", "2000", "4000-01", "5100"]
        assert infer_column_type_from_data(values) == "account_number"

    def test_description_text_column(self):
        values = [
            "Initial deposit from owner",
            "Monthly bank fee",
            "Customer payment received",
            "Wire transfer outgoing",
        ]
        assert infer_column_type_from_data(values) == "text"

    def test_empty_column(self):
        assert infer_column_type_from_data(["", "", " ", None or ""]) == "empty"


# ---------------------------------------------------------------------------
# 3. The reported regression — auto-detection of the user's TB shape
# ---------------------------------------------------------------------------

# Simulate the user's CSV:
#   Col A: blank
#   Col B: "1000 · Cash" (account number + name combined)
#   Col C: debit amounts
#   Col D: blank
#   Col E: credit amounts
USER_TB_HEADERS = ["", "B", "C", "", "E"]
USER_TB_ROWS = [
    {"": "", "B": "1000 · Cash", "C": "0", "D": "", "E": "20.16"},
    {"": "", "B": "1000-01 · FHB - MLI Operating", "C": "20.16", "D": "", "E": "0"},
    {"": "", "B": "1000-02 · FHB - MLI Merch Acct# 7624", "C": "2.38", "D": "", "E": "0"},
    {"": "", "B": "4000 · Revenue", "C": "0", "D": "", "E": "745.33"},
]


class TestUserRegression:
    def test_auto_detection_picks_combined_column_b_not_amount_column_c(self):
        mapping = auto_detect_column_mapping(USER_TB_HEADERS, USER_TB_ROWS)
        # Critical: Column B must be detected as account_combined, NOT Column C.
        assert mapping.get("account_combined") == "B", (
            f"Expected Column B as account_combined, got mapping={mapping}"
        )
        # Critical: Column C must NEVER be classified as account_number.
        assert mapping.get("account_number") != "C", (
            f"Column C (debit amounts) was incorrectly mapped as account_number: {mapping}"
        )
        # Debit/credit should map to the amount columns
        assert mapping.get("debit") in ("C", "E")
        assert mapping.get("credit") in ("C", "E")

    def test_explicit_combined_mapping_parses_correctly(self):
        """When user (or auto-detect) maps Column B as account_combined,
        _interpret_row should split it into account_number + account_name."""
        col_map = {"account_combined": "B", "debit": "C", "credit": "E"}
        num, name, debit, credit, balance, desc = _interpret_row(
            USER_TB_ROWS[1], col_map, line_num=1
        )
        assert num == "1000-01"
        assert name == "FHB - MLI Operating"
        assert debit == Decimal("20.16")
        assert credit == Decimal("0")

    def test_validation_warns_if_amount_column_mapped_as_account_number(self):
        """If the user manually picks Column C as account_number, the
        guardrail must produce a warning."""
        bad_map = {"account_number": "C", "debit": "E"}
        warnings = validate_column_mapping_against_data(bad_map, USER_TB_ROWS)
        assert len(warnings) >= 1
        assert any("Account Number" in w and "amount-like" in w for w in warnings), (
            f"Expected a warning about amount-like Account Number column; got {warnings}"
        )

    def test_validation_warns_if_account_column_mapped_as_debit(self):
        bad_map = {"debit": "B", "account_number": "C"}
        warnings = validate_column_mapping_against_data(bad_map, USER_TB_ROWS)
        # Both bad mappings should each produce a warning
        assert len(warnings) >= 2

    def test_validation_clean_for_correct_mapping(self):
        good_map = {"account_combined": "B", "debit": "C", "credit": "E"}
        warnings = validate_column_mapping_against_data(good_map, USER_TB_ROWS)
        assert warnings == []


# ---------------------------------------------------------------------------
# 4. Exact fixture from the user's Agent 1 spec
# ---------------------------------------------------------------------------

SPEC_HEADERS = ["A", "B", "C", "D", "E"]
SPEC_ROWS = [
    {"A": "", "B": "1000 · Cash",                              "C": "0",     "D": "", "E": ""},
    {"A": "", "B": "1000-01 · FHB - MLI Operating",            "C": "0",     "D": "", "E": ""},
    {"A": "", "B": "1000-02 · FHB - MLI Merch Acct# 7624",     "C": "20.16", "D": "", "E": ""},
]


class TestAgent1SpecFixture:
    """The exact fixture from the user's Agent 1 hand-off, asserted
    row-by-row. Hard-stop conditions from the spec:
      - account_number must never become 0, 20.16, 2.38, or 745.33
      - account names must come from Column B, not be 'Imported Account N'
    """

    def test_auto_detect_picks_column_b_as_combined(self):
        mapping = auto_detect_column_mapping(SPEC_HEADERS, SPEC_ROWS)
        assert mapping.get("account_combined") == "B"
        # Column C must NEVER be classified as account_number
        assert mapping.get("account_number") != "C"

    def test_spec_row_1_parses_as_1000_cash(self):
        col_map = {"account_combined": "B", "debit": "C", "credit": "E"}
        num, name, debit, credit, balance, desc = _interpret_row(SPEC_ROWS[0], col_map, line_num=1)
        assert num == "1000"
        assert name == "Cash"
        assert debit == Decimal("0")
        assert credit is None  # blank column → None per current loader semantics

    def test_spec_row_2_parses_as_1000_01_fhb_mli_operating(self):
        col_map = {"account_combined": "B", "debit": "C", "credit": "E"}
        num, name, debit, credit, balance, desc = _interpret_row(SPEC_ROWS[1], col_map, line_num=2)
        assert num == "1000-01"
        assert name == "FHB - MLI Operating"
        assert debit == Decimal("0")
        assert credit is None

    def test_spec_row_3_parses_as_1000_02_with_special_chars(self):
        col_map = {"account_combined": "B", "debit": "C", "credit": "E"}
        num, name, debit, credit, balance, desc = _interpret_row(SPEC_ROWS[2], col_map, line_num=3)
        assert num == "1000-02"
        assert name == "FHB - MLI Merch Acct# 7624"
        assert debit == Decimal("20.16")
        assert credit is None

    def test_hard_stop_account_number_never_becomes_amount(self):
        """Spec hard-stop: account_number must never be 0, 20.16, 2.38, or 745.33."""
        col_map = {"account_combined": "B", "debit": "C", "credit": "E"}
        for row in SPEC_ROWS:
            num, _name, _d, _c, _b, _desc = _interpret_row(row, col_map, line_num=1)
            assert num not in ("0", "20.16", "2.38", "745.33"), (
                f"REGRESSION: parser produced amount value as account number: {num!r}"
            )

    def test_hard_stop_account_name_never_imported_account_n(self):
        """Spec hard-stop: account_name must come from Column B, not be 'Imported Account N'."""
        col_map = {"account_combined": "B", "debit": "C", "credit": "E"}
        for row in SPEC_ROWS:
            _num, name, _d, _c, _b, _desc = _interpret_row(row, col_map, line_num=1)
            assert "imported account" not in name.lower(), (
                f"REGRESSION: parser produced placeholder name: {name!r}"
            )
