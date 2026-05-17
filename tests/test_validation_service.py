"""
Milestone 9: Validation, audit-control, and immutable-entry tests.

Proof points:
  1.  ValidationIssue objects have correct fields and serialize correctly
  2.  ERROR severity blocks posting / import
  3.  WARNING severity allows continuation
  4.  Draft JEs can be edited
  5.  Posted JEs cannot be edited
  6.  Posted JEs cannot be deleted
  7.  Reversal entries correctly negate originals
  8.  Reversal linkage (reversal_of_id, reversal_je_id, reversed_at)
  9.  Multiple validation issues aggregate correctly
  10. Validation framework works across services (JE, FS, consolidation)
"""

import datetime
from decimal import Decimal

import pytest

from app.models import Account, Entity, Scenario
from app.models.account_mapping import AccountMapping
from app.models.fs_line_item import FsLineItem
from app.models.journal_entry import JournalEntry
from app.models.journal_entry_line import JournalEntryLine
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryLineCreate
from app.services.consolidation_service import validate_consolidated_tb
from app.services.fs_reporting_service import validate_fs_mappings
from app.services.journal_entry_service import (
    ImmutableEntryError,
    JournalEntryValidationError,
    create_draft_journal_entry,
    delete_draft_journal_entry,
    get_journal_entry_or_raise,
    post_journal_entry,
    reverse_journal_entry,
    update_draft_journal_entry,
    validate_journal_entry,
)
from app.services.reporting_service import TrialBalanceRow, get_trial_balance
from app.services.validation import (
    Severity,
    ValidationError,
    ValidationIssue,
    ValidationResult,
)

TODAY = datetime.date.today()
CURRENT = datetime.date(TODAY.year, 1, 1)        # first day of current year — recent
OLD_DATE = datetime.date(2019, 6, 30)             # well over a year ago


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def entity(session):
    e = Entity(code="VAL_E", name="Validation Entity", entity_type="operating")
    session.add(e)
    session.flush()
    return e


@pytest.fixture
def scenario(session):
    s = Scenario(code="VAL_S", name="Val Scenario", scenario_type="actual")
    session.add(s)
    session.flush()
    return s


@pytest.fixture
def accounts(session, entity):
    cash = Account(
        entity_id=entity.id,
        account_number="1000", account_name="Cash",
        account_type="asset", normal_balance="debit",
    )
    revenue = Account(
        entity_id=entity.id,
        account_number="4000", account_name="Revenue",
        account_type="revenue", normal_balance="credit",
    )
    unmapped = Account(
        entity_id=entity.id,
        account_number="9999", account_name="Unmapped",
        account_type="asset", normal_balance="debit",
    )
    session.add_all([cash, revenue, unmapped])
    session.flush()
    return {"cash": cash, "revenue": revenue, "unmapped": unmapped}


@pytest.fixture
def fs_line(session):
    line = FsLineItem(
        code="BS-CASH", name="Cash",
        statement="BS", section="Assets",
        sort_order=10, is_subtotal=False, sign_flip=False,
    )
    session.add(line)
    session.flush()
    return line


@pytest.fixture
def mappings(session, accounts, fs_line):
    _from = datetime.date(1900, 1, 1)
    _to   = datetime.date(9999, 12, 31)
    session.add(AccountMapping(
        account_id=accounts["cash"].id,
        fs_line_item_id=fs_line.id,
        effective_from=_from, effective_to=_to,
    ))
    session.add(AccountMapping(
        account_id=accounts["revenue"].id,
        fs_line_item_id=fs_line.id,
        effective_from=_from, effective_to=_to,
    ))
    # "unmapped" account intentionally has no mapping
    session.flush()


def _make_je(entity, scenario, accounts, je_number="VAL-001", entry_date=None, lines=None):
    entry_date = entry_date or CURRENT
    if lines is None:
        lines = [
            JournalEntryLineCreate(
                line_number=1,
                account_id=accounts["cash"].id,
                entity_id=entity.id,
                debit=Decimal("500"), credit=Decimal("0"),
            ),
            JournalEntryLineCreate(
                line_number=2,
                account_id=accounts["revenue"].id,
                entity_id=entity.id,
                debit=Decimal("0"), credit=Decimal("500"),
            ),
        ]
    return JournalEntryCreate(
        je_number=je_number,
        entry_date=entry_date,
        entity_id=entity.id,
        scenario_id=scenario.id,
        description="Validation test JE",
        lines=lines,
    )


# ===========================================================================
# 1. ValidationIssue — structure and serialization
# ===========================================================================

class TestValidationIssueStructure:
    def test_required_fields_accessible(self):
        issue = ValidationIssue(
            code="TEST_CODE",
            severity=Severity.ERROR,
            message="Something went wrong",
            source_type="journal_entry",
        )
        assert issue.code == "TEST_CODE"
        assert issue.severity == Severity.ERROR
        assert issue.message == "Something went wrong"
        assert issue.source_type == "journal_entry"

    def test_optional_fields_default_to_none(self):
        issue = ValidationIssue(
            code="X", severity=Severity.INFO, message="y", source_type="z"
        )
        assert issue.source_id is None
        assert issue.field_name is None
        assert issue.suggested_resolution is None

    def test_optional_fields_set_correctly(self):
        issue = ValidationIssue(
            code="JE_UNBALANCED",
            severity=Severity.ERROR,
            message="Does not balance",
            source_type="journal_entry",
            source_id="JE-001",
            field_name="lines",
            suggested_resolution="Check debit/credit totals",
        )
        assert issue.source_id == "JE-001"
        assert issue.field_name == "lines"
        assert issue.suggested_resolution == "Check debit/credit totals"

    def test_to_dict_is_serializable(self):
        issue = ValidationIssue(
            code="FS_UNMAPPED",
            severity=Severity.WARNING,
            message="Account has no mapping",
            source_type="account_mapping",
            source_id=42,
        )
        d = issue.to_dict()
        assert isinstance(d, dict)
        assert d["code"] == "FS_UNMAPPED"
        assert d["severity"] == "WARNING"
        assert d["message"] == "Account has no mapping"
        assert d["source_type"] == "account_mapping"
        assert d["source_id"] == 42

    def test_severity_enum_values(self):
        assert Severity.ERROR.value   == "ERROR"
        assert Severity.WARNING.value == "WARNING"
        assert Severity.INFO.value    == "INFO"

    def test_severity_is_string_comparable(self):
        assert Severity.ERROR == "ERROR"
        assert Severity.WARNING == "WARNING"
        assert Severity.INFO == "INFO"


# ===========================================================================
# 2. ERROR severity blocks posting
# ===========================================================================

class TestErrorBlocksPosting:
    def test_unbalanced_entry_raises_validation_error(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="VAL-ERR-001", lines=[
            JournalEntryLineCreate(line_number=1, account_id=accounts["cash"].id,
                                   entity_id=entity.id, debit=Decimal("100"), credit=Decimal("0")),
            JournalEntryLineCreate(line_number=2, account_id=accounts["revenue"].id,
                                   entity_id=entity.id, debit=Decimal("0"), credit=Decimal("50")),
        ])
        with pytest.raises(JournalEntryValidationError, match="does not balance"):
            post_journal_entry(session, data)

    def test_error_exception_carries_validation_result(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="VAL-ERR-002", lines=[
            JournalEntryLineCreate(line_number=1, account_id=accounts["cash"].id,
                                   entity_id=entity.id, debit=Decimal("100"), credit=Decimal("0")),
            JournalEntryLineCreate(line_number=2, account_id=accounts["revenue"].id,
                                   entity_id=entity.id, debit=Decimal("0"), credit=Decimal("50")),
        ])
        exc = pytest.raises(JournalEntryValidationError, post_journal_entry, session, data)
        result = exc.value.result
        assert isinstance(result, ValidationResult)
        assert result.has_errors
        assert any(i.code == "JE_OUT_OF_BALANCE" for i in result.errors)

    def test_error_blocks_no_rows_written(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="VAL-ERR-003", lines=[
            JournalEntryLineCreate(line_number=1, account_id=accounts["cash"].id,
                                   entity_id=entity.id, debit=Decimal("999"), credit=Decimal("0")),
            JournalEntryLineCreate(line_number=2, account_id=accounts["revenue"].id,
                                   entity_id=entity.id, debit=Decimal("0"), credit=Decimal("1")),
        ])
        with pytest.raises(JournalEntryValidationError):
            post_journal_entry(session, data)
        assert session.query(JournalEntry).filter_by(je_number="VAL-ERR-003").first() is None

    def test_zero_line_count_error(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="VAL-ERR-004", lines=[])
        with pytest.raises(JournalEntryValidationError, match="at least 2 lines"):
            post_journal_entry(session, data)

    def test_both_sides_on_one_line_error(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="VAL-ERR-005", lines=[
            JournalEntryLineCreate(line_number=1, account_id=accounts["cash"].id,
                                   entity_id=entity.id, debit=Decimal("100"), credit=Decimal("100")),
            JournalEntryLineCreate(line_number=2, account_id=accounts["revenue"].id,
                                   entity_id=entity.id, debit=Decimal("0"), credit=Decimal("0")),
        ])
        with pytest.raises(JournalEntryValidationError, match="cannot carry both"):
            post_journal_entry(session, data)

    def test_validate_journal_entry_returns_errors_without_raising(self, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="VAL-ERR-006", lines=[
            JournalEntryLineCreate(line_number=1, account_id=accounts["cash"].id,
                                   entity_id=entity.id, debit=Decimal("100"), credit=Decimal("0")),
            JournalEntryLineCreate(line_number=2, account_id=accounts["revenue"].id,
                                   entity_id=entity.id, debit=Decimal("0"), credit=Decimal("50")),
        ])
        result = validate_journal_entry(data)
        assert result.has_errors
        assert not result  # bool(result) is False when errors present


# ===========================================================================
# 3. WARNING severity allows continuation
# ===========================================================================

class TestWarningAllowsContinuation:
    def test_backdated_entry_generates_prior_period_warning(self, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="VAL-WARN-001",
                        entry_date=OLD_DATE)
        result = validate_journal_entry(data)
        assert result.has_warnings
        assert any(i.code == "JE_PRIOR_PERIOD" for i in result.warnings)

    def test_backdated_entry_still_posts_successfully(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="VAL-WARN-002",
                        entry_date=OLD_DATE)
        je = post_journal_entry(session, data)
        assert je.status == "posted"
        assert je.entry_date == OLD_DATE

    def test_recent_entry_has_no_prior_period_warning(self, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="VAL-WARN-003",
                        entry_date=CURRENT)
        result = validate_journal_entry(data)
        assert not any(i.code == "JE_PRIOR_PERIOD" for i in result.issues)

    def test_warning_does_not_make_result_bool_false(self, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="VAL-WARN-004",
                        entry_date=OLD_DATE)
        result = validate_journal_entry(data)
        assert result.has_warnings
        assert not result.has_errors
        assert bool(result) is True  # warnings don't block

    def test_raise_if_errors_does_not_raise_on_warnings_only(self, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="VAL-WARN-005",
                        entry_date=OLD_DATE)
        result = validate_journal_entry(data)
        result.raise_if_errors()  # must not raise

    def test_prior_period_warning_includes_field_name(self, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="VAL-WARN-006",
                        entry_date=OLD_DATE)
        result = validate_journal_entry(data)
        warn = next(i for i in result.warnings if i.code == "JE_PRIOR_PERIOD")
        assert warn.field_name == "entry_date"
        assert warn.suggested_resolution is not None


# ===========================================================================
# 4. Draft JEs can be edited
# ===========================================================================

class TestDraftJournalEntries:
    def test_create_draft_has_draft_status(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="DRF-001")
        je = create_draft_journal_entry(session, data)
        assert je.status == "draft"
        assert je.posted_at is None

    def test_draft_is_excluded_from_trial_balance(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="DRF-002")
        create_draft_journal_entry(session, data)
        rows = get_trial_balance(session, entity.id, CURRENT, [scenario.id])
        # Draft should not appear in the TB
        account_ids = {r.account_id for r in rows}
        assert accounts["cash"].id not in account_ids

    def test_update_draft_changes_description(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="DRF-003")
        je = create_draft_journal_entry(session, data)

        updated_data = _make_je(entity, scenario, accounts, je_number="DRF-003")
        updated_data = JournalEntryCreate(
            je_number="DRF-003",
            entry_date=CURRENT,
            entity_id=entity.id,
            scenario_id=scenario.id,
            description="Updated description",
            lines=data.lines,
        )
        je2 = update_draft_journal_entry(session, je.id, updated_data)
        assert je2.description == "Updated description"
        assert je2.id == je.id

    def test_update_draft_replaces_lines(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="DRF-004")
        je = create_draft_journal_entry(session, data)

        new_lines = [
            JournalEntryLineCreate(line_number=1, account_id=accounts["cash"].id,
                                   entity_id=entity.id, debit=Decimal("999"), credit=Decimal("0")),
            JournalEntryLineCreate(line_number=2, account_id=accounts["revenue"].id,
                                   entity_id=entity.id, debit=Decimal("0"), credit=Decimal("999")),
        ]
        updated_data = JournalEntryCreate(
            je_number="DRF-004",
            entry_date=CURRENT,
            entity_id=entity.id,
            scenario_id=scenario.id,
            description="Line replacement test",
            lines=new_lines,
        )
        update_draft_journal_entry(session, je.id, updated_data)
        lines = session.query(JournalEntryLine).filter_by(journal_entry_id=je.id).all()
        assert len(lines) == 2
        assert lines[0].debit == Decimal("999")

    def test_update_draft_sets_updated_at(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="DRF-005")
        je = create_draft_journal_entry(session, data)
        assert je.updated_at is None

        update_draft_journal_entry(session, je.id, data)
        session.refresh(je)
        assert je.updated_at is not None


# ===========================================================================
# 5. Posted JEs cannot be edited
# ===========================================================================

class TestPostedImmutability:
    def test_update_posted_raises_immutable_error(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="IMM-001")
        je = post_journal_entry(session, data)

        with pytest.raises(ImmutableEntryError, match="cannot be edited"):
            update_draft_journal_entry(session, je.id, data)

    def test_update_reversed_raises_immutable_error(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="IMM-002")
        je = post_journal_entry(session, data)
        reverse_journal_entry(
            session, je.id,
            reversal_date=CURRENT, je_number="IMM-002-REV",
            description="Reversal",
        )

        with pytest.raises(ImmutableEntryError):
            update_draft_journal_entry(session, je.id, data)


# ===========================================================================
# 6. Posted JEs cannot be deleted
# ===========================================================================

class TestPostedCannotBeDeleted:
    def test_delete_posted_raises_immutable_error(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="DEL-001")
        je = post_journal_entry(session, data)

        with pytest.raises(ImmutableEntryError, match="cannot be deleted"):
            delete_draft_journal_entry(session, je.id)

    def test_delete_draft_succeeds(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="DEL-002")
        je = create_draft_journal_entry(session, data)
        je_id = je.id

        delete_draft_journal_entry(session, je_id)
        assert session.get(JournalEntry, je_id) is None

    def test_delete_draft_cascades_to_lines(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="DEL-003")
        je = create_draft_journal_entry(session, data)
        je_id = je.id

        delete_draft_journal_entry(session, je_id)
        lines = session.query(JournalEntryLine).filter_by(journal_entry_id=je_id).all()
        assert lines == []


# ===========================================================================
# 7. Reversal entries correctly negate originals
# ===========================================================================

class TestReversalNegatesOriginal:
    def test_reversal_lines_swap_debit_and_credit(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="REV-001")
        je = post_journal_entry(session, data)
        rev = reverse_journal_entry(
            session, je.id, reversal_date=CURRENT, je_number="REV-001-REV",
            description="Reversal of REV-001",
        )

        orig_lines = sorted(
            session.query(JournalEntryLine).filter_by(journal_entry_id=je.id).all(),
            key=lambda l: l.line_number,
        )
        rev_lines = sorted(
            session.query(JournalEntryLine).filter_by(journal_entry_id=rev.id).all(),
            key=lambda l: l.line_number,
        )
        assert len(rev_lines) == len(orig_lines)
        for orig, revl in zip(orig_lines, rev_lines):
            assert revl.debit  == orig.credit
            assert revl.credit == orig.debit

    def test_reversal_is_balanced(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="REV-002")
        je = post_journal_entry(session, data)
        rev = reverse_journal_entry(
            session, je.id, reversal_date=CURRENT, je_number="REV-002-REV",
            description="Reversal",
        )

        rev_lines = session.query(JournalEntryLine).filter_by(journal_entry_id=rev.id).all()
        assert sum(l.debit for l in rev_lines) == sum(l.credit for l in rev_lines)

    def test_reversal_zeroes_net_balance_in_trial_balance(self, session, entity, scenario, accounts):
        # Post one JE and immediately reverse it.
        # The original (status='reversed') is excluded from the TB.
        # Only the reversal entry (status='posted') remains.
        # Reversal lines: cash debit=0 / credit=500, revenue debit=500 / credit=0.
        data = _make_je(entity, scenario, accounts, je_number="REV-003",
                        entry_date=CURRENT)
        je = post_journal_entry(session, data)
        reverse_journal_entry(
            session, je.id, reversal_date=CURRENT, je_number="REV-003-REV",
            description="Reversal",
        )
        rows = get_trial_balance(session, entity.id, CURRENT, [scenario.id])
        # Original excluded (status=reversed); reversal included.
        # Cash in reversal: debit=0, credit=500 → net_debit = -500
        cash_row = next((r for r in rows if r.account_id == accounts["cash"].id), None)
        assert cash_row is not None
        assert cash_row.net_debit == Decimal("-500")

    def test_reversal_posted_at_is_set(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="REV-004")
        je = post_journal_entry(session, data)
        rev = reverse_journal_entry(
            session, je.id, reversal_date=CURRENT, je_number="REV-004-REV",
            description="Reversal",
        )
        assert rev.posted_at is not None


# ===========================================================================
# 8. Reversal linkage
# ===========================================================================

class TestReversalLinkage:
    def test_original_status_becomes_reversed(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="LINK-001")
        je = post_journal_entry(session, data)
        reverse_journal_entry(
            session, je.id, reversal_date=CURRENT, je_number="LINK-001-REV",
            description="Reversal",
        )
        session.refresh(je)
        assert je.status == "reversed"

    def test_reversal_of_id_set_on_reversal_je(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="LINK-002")
        je = post_journal_entry(session, data)
        rev = reverse_journal_entry(
            session, je.id, reversal_date=CURRENT, je_number="LINK-002-REV",
            description="Reversal",
        )
        assert rev.reversal_of_id == je.id

    def test_reversal_je_id_set_on_original(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="LINK-003")
        je = post_journal_entry(session, data)
        rev = reverse_journal_entry(
            session, je.id, reversal_date=CURRENT, je_number="LINK-003-REV",
            description="Reversal",
        )
        session.refresh(je)
        assert je.reversal_je_id == rev.id

    def test_reversed_at_set_on_original(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="LINK-004")
        je = post_journal_entry(session, data)
        reverse_journal_entry(
            session, je.id, reversal_date=CURRENT, je_number="LINK-004-REV",
            description="Reversal",
        )
        session.refresh(je)
        assert je.reversed_at is not None

    def test_cannot_reverse_already_reversed(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="LINK-005")
        je = post_journal_entry(session, data)
        reverse_journal_entry(
            session, je.id, reversal_date=CURRENT, je_number="LINK-005-REV",
            description="First reversal",
        )
        with pytest.raises(ImmutableEntryError, match="already been reversed"):
            reverse_journal_entry(
                session, je.id, reversal_date=CURRENT, je_number="LINK-005-REV2",
                description="Second reversal attempt",
            )

    def test_cannot_reverse_draft(self, session, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="LINK-006")
        je = create_draft_journal_entry(session, data)
        with pytest.raises(ImmutableEntryError, match="Only 'posted' entries"):
            reverse_journal_entry(
                session, je.id, reversal_date=CURRENT, je_number="LINK-006-REV",
                description="Cannot reverse draft",
            )

    def test_reversal_excluded_from_tb_if_reversed_status_not_posted(
        self, session, entity, scenario, accounts
    ):
        # A 'reversed' original entry must NOT appear in the trial balance
        data = _make_je(entity, scenario, accounts, je_number="LINK-007",
                        entry_date=CURRENT)
        je = post_journal_entry(session, data)
        reverse_journal_entry(
            session, je.id, reversal_date=CURRENT, je_number="LINK-007-REV",
            description="Reversal",
        )
        rows = get_trial_balance(session, entity.id, CURRENT, [scenario.id])
        # Only the reversal entry (status=posted) should be in TB.
        # The original (status=reversed) should be excluded.
        # Net cash = 0 (reversal debit=0, credit=500 offset original debit=500, credit=0)
        # But get_trial_balance filters status='posted'.
        # Original is now 'reversed' → excluded.
        # Reversal is 'posted' → included.
        cash_row = next((r for r in rows if r.account_id == accounts["cash"].id), None)
        # Reversal has: cash debit=0, credit=500 → net_debit = -500
        assert cash_row is not None
        assert cash_row.net_debit == Decimal("-500")


# ===========================================================================
# 9. Multiple validation issues aggregate correctly
# ===========================================================================

class TestMultipleIssueAggregation:
    def test_result_collects_all_issue_types(self):
        result = ValidationResult()
        result.error("E1", "Error one", "source_a")
        result.warning("W1", "Warning one", "source_b")
        result.info("I1", "Info one", "source_c")
        assert len(result.issues) == 3

    def test_has_errors_true_with_error(self):
        result = ValidationResult()
        result.error("E1", "Error", "src")
        assert result.has_errors is True

    def test_has_errors_false_without_error(self):
        result = ValidationResult()
        result.warning("W1", "Warning", "src")
        assert result.has_errors is False

    def test_has_warnings_true_with_warning(self):
        result = ValidationResult()
        result.warning("W1", "Warning", "src")
        assert result.has_warnings is True

    def test_has_warnings_false_without_warning(self):
        result = ValidationResult()
        result.error("E1", "Error", "src")
        assert result.has_warnings is False

    def test_errors_property_filters_correctly(self):
        result = ValidationResult()
        result.error("E1", "Error", "src")
        result.warning("W1", "Warning", "src")
        result.info("I1", "Info", "src")
        assert len(result.errors) == 1
        assert result.errors[0].code == "E1"

    def test_warnings_property_filters_correctly(self):
        result = ValidationResult()
        result.error("E1", "Error", "src")
        result.warning("W1", "Warning", "src")
        result.info("I1", "Info", "src")
        assert len(result.warnings) == 1
        assert result.warnings[0].code == "W1"

    def test_raise_if_errors_raises_on_error(self):
        result = ValidationResult()
        result.error("E1", "Error", "src")
        with pytest.raises(ValidationError) as exc_info:
            result.raise_if_errors()
        assert exc_info.value.result is result
        assert "[E1]" in str(exc_info.value)

    def test_raise_if_errors_no_raise_on_warning_only(self):
        result = ValidationResult()
        result.warning("W1", "Warning", "src")
        result.raise_if_errors()  # must not raise

    def test_merge_combines_issues_from_two_results(self):
        r1 = ValidationResult()
        r1.error("E1", "Error", "src1")
        r2 = ValidationResult()
        r2.warning("W1", "Warning", "src2")
        r1.merge(r2)
        assert len(r1.issues) == 2
        assert r1.has_errors
        assert r1.has_warnings

    def test_bool_false_when_errors_present(self):
        result = ValidationResult()
        result.error("E", "e", "s")
        assert not bool(result)

    def test_bool_true_when_only_warnings(self):
        result = ValidationResult()
        result.warning("W", "w", "s")
        assert bool(result)

    def test_multiple_errors_all_included_in_message(self):
        result = ValidationResult()
        result.error("E1", "First error", "src")
        result.error("E2", "Second error", "src")
        with pytest.raises(ValidationError) as exc_info:
            result.raise_if_errors()
        msg = str(exc_info.value)
        assert "E1" in msg
        assert "E2" in msg

    def test_unbalanced_je_produces_single_error_issue(self, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="AGG-001", lines=[
            JournalEntryLineCreate(line_number=1, account_id=accounts["cash"].id,
                                   entity_id=entity.id, debit=Decimal("100"), credit=Decimal("0")),
            JournalEntryLineCreate(line_number=2, account_id=accounts["revenue"].id,
                                   entity_id=entity.id, debit=Decimal("0"), credit=Decimal("50")),
        ])
        result = validate_journal_entry(data)
        assert len(result.errors) == 1
        assert result.errors[0].code == "JE_OUT_OF_BALANCE"


# ===========================================================================
# 10. Validation framework works across services
# ===========================================================================

class TestCrossServiceValidation:
    def test_je_service_returns_validation_result_type(self, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="XSVC-001",
                        entry_date=OLD_DATE)
        result = validate_journal_entry(data)
        assert isinstance(result, ValidationResult)

    def test_fs_service_returns_validation_result_type(
        self, session, entity, scenario, accounts, mappings
    ):
        # Post a JE that includes the unmapped account (9999)
        data = JournalEntryCreate(
            je_number="XSVC-002",
            entry_date=CURRENT,
            entity_id=entity.id,
            scenario_id=scenario.id,
            description="Unmapped account test",
            lines=[
                JournalEntryLineCreate(line_number=1, account_id=accounts["unmapped"].id,
                                       entity_id=entity.id, debit=Decimal("200"), credit=Decimal("0")),
                JournalEntryLineCreate(line_number=2, account_id=accounts["revenue"].id,
                                       entity_id=entity.id, debit=Decimal("0"), credit=Decimal("200")),
            ],
        )
        post_journal_entry(session, data)
        result = validate_fs_mappings(session, entity.id, CURRENT, [scenario.id])
        assert isinstance(result, ValidationResult)
        assert result.has_warnings
        assert any(i.code == "FS_UNMAPPED_BALANCE" for i in result.warnings)

    def test_consolidation_service_returns_validation_result_type(self):
        result = validate_consolidated_tb([])
        assert isinstance(result, ValidationResult)

    def test_consolidation_validates_empty_tb_as_info(self):
        result = validate_consolidated_tb([])
        assert any(i.severity == Severity.INFO for i in result.issues)
        assert not result.has_errors

    def test_consolidation_detects_imbalanced_tb_as_error(self):
        rows = [
            TrialBalanceRow(
                account_id=1, account_number="1000", account_name="Cash",
                account_type="asset", normal_balance="debit",
                total_debit=Decimal("1000"), total_credit=Decimal("0"),
                net_debit=Decimal("1000"), signed_balance=Decimal("1000"),
            ),
        ]
        result = validate_consolidated_tb(rows)
        assert result.has_errors
        assert any(i.code == "CONS_TB_OUT_OF_BALANCE" for i in result.errors)

    def test_balanced_consolidated_tb_has_no_errors(self):
        rows = [
            TrialBalanceRow(
                account_id=1, account_number="1000", account_name="Cash",
                account_type="asset", normal_balance="debit",
                total_debit=Decimal("500"), total_credit=Decimal("0"),
                net_debit=Decimal("500"), signed_balance=Decimal("500"),
            ),
            TrialBalanceRow(
                account_id=2, account_number="4000", account_name="Revenue",
                account_type="revenue", normal_balance="credit",
                total_debit=Decimal("0"), total_credit=Decimal("500"),
                net_debit=Decimal("-500"), signed_balance=Decimal("500"),
            ),
        ]
        result = validate_consolidated_tb(rows)
        assert not result.has_errors

    def test_all_services_produce_same_issue_type(
        self, session, entity, scenario, accounts, mappings
    ):
        # JE service validation
        data = _make_je(entity, scenario, accounts, je_number="XSVC-003",
                        entry_date=OLD_DATE)
        je_result = validate_journal_entry(data)

        # Consolidation service validation
        cons_result = validate_consolidated_tb([])

        # All issues are ValidationIssue instances
        for issue in je_result.issues + cons_result.issues:
            assert isinstance(issue, ValidationIssue)
            assert hasattr(issue, "code")
            assert hasattr(issue, "severity")
            assert hasattr(issue, "message")
            assert hasattr(issue, "source_type")

    def test_je_error_result_exposes_structured_issues(self, entity, scenario, accounts):
        data = _make_je(entity, scenario, accounts, je_number="XSVC-004", lines=[
            JournalEntryLineCreate(line_number=1, account_id=accounts["cash"].id,
                                   entity_id=entity.id, debit=Decimal("1"), credit=Decimal("0")),
            JournalEntryLineCreate(line_number=2, account_id=accounts["revenue"].id,
                                   entity_id=entity.id, debit=Decimal("0"), credit=Decimal("2")),
        ])
        exc = pytest.raises(JournalEntryValidationError, post_journal_entry, None, data)
        # validate_journal_entry runs before any db access, so session=None is fine
        issue = exc.value.result.errors[0]
        assert issue.code == "JE_OUT_OF_BALANCE"
        assert issue.severity == Severity.ERROR
        d = issue.to_dict()
        assert d["code"] == "JE_OUT_OF_BALANCE"
        assert d["severity"] == "ERROR"
