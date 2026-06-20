"""Tests for import_intelligence_service (Sprint P4)."""
import pytest
from unittest.mock import patch
from app.services import import_intelligence_service as iis


def _status(**overrides) -> dict:
    """Default 'nothing imported' status dict; overrides flip flags on."""
    base = {
        "coa_available": False,
        "coa_account_count": 0,
        "tb_available": False,
        "tb_has_balances": False,
        "gl_available": False,
        "fs_available": False,
        "taxonomy_mapped_pct": 0.0,
        "unmapped_account_count": 0,
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Empty state
# ---------------------------------------------------------------------------

def test_empty_import_state_zero_score():
    with patch.object(iis, "get_readiness_status", return_value=_status()):
        result = iis.compute_readiness_score(entity_id=1, period_id=None, db=None)  # type: ignore[arg-type]
    assert result.score == 0
    assert result.grade == "empty"
    assert result.recommended_next_import == "coa"
    assert result.can_generate_financial_statements is False
    assert result.can_drilldown is False


# ---------------------------------------------------------------------------
# COA only
# ---------------------------------------------------------------------------

def test_coa_only_unlocks_mapping():
    with patch.object(iis, "get_readiness_status", return_value=_status(coa_available=True, coa_account_count=50)):
        result = iis.compute_readiness_score(1, None, None)  # type: ignore[arg-type]
    assert result.score == 10            # only the "mapping" capability
    assert result.grade == "limited"
    by_key = {c.key: c for c in result.capabilities}
    assert by_key["mapping"].ready is True
    assert by_key["financial_statements"].ready is False
    assert result.recommended_next_import == "tb"
    assert "trial_balance" in result.missing_data


# ---------------------------------------------------------------------------
# TB unlocks statements, comparatives, draft impact, bridge, consolidation
# ---------------------------------------------------------------------------

def test_tb_with_full_mapping_unlocks_statements():
    with patch.object(iis, "get_readiness_status", return_value=_status(
        coa_available=True, coa_account_count=100, tb_has_balances=True, taxonomy_mapped_pct=90.0,
    )):
        result = iis.compute_readiness_score(1, None, None)  # type: ignore[arg-type]
    # mapping(10) + financial_statements(25) + comparative(10) + consolidation(5) + draft(10) + bridge(5) = 65
    assert result.score == 65
    assert result.grade == "strong"
    assert result.can_generate_financial_statements is True
    assert result.can_drilldown is False                      # GL not imported
    assert result.recommended_next_import == "gl"


def test_tb_with_incomplete_mapping_blocks_fs():
    with patch.object(iis, "get_readiness_status", return_value=_status(
        coa_available=True, tb_has_balances=True, taxonomy_mapped_pct=50.0,
    )):
        result = iis.compute_readiness_score(1, None, None)  # type: ignore[arg-type]
    by_key = {c.key: c for c in result.capabilities}
    fs_cap = by_key["financial_statements"]
    assert fs_cap.ready is False
    assert fs_cap.partial is True                              # blocked only by threshold
    assert any("50%" in m for m in fs_cap.missing)
    assert "taxonomy_mapping_to_80pct" in " ".join(result.missing_data)


# ---------------------------------------------------------------------------
# GL unlocks everything
# ---------------------------------------------------------------------------

def test_gl_plus_tb_unlocks_drilldown_and_rollforwards():
    with patch.object(iis, "get_readiness_status", return_value=_status(
        coa_available=True, tb_has_balances=True, gl_available=True, taxonomy_mapped_pct=95.0,
    )):
        result = iis.compute_readiness_score(1, None, None)  # type: ignore[arg-type]
    # mapping(10) + fs(25) + comp(10) + drilldown(15) + rollforward(10) + recon(10) + consol(5) + draft(10) + bridge(5) = 100
    assert result.score == 100
    assert result.grade == "complete"
    assert result.can_drilldown is True
    assert result.can_rollforward is True
    assert result.can_reconcile is True
    assert result.recommended_next_import is None


# ---------------------------------------------------------------------------
# Recommended next import logic
# ---------------------------------------------------------------------------

def test_recommend_coa_when_nothing():
    with patch.object(iis, "get_readiness_status", return_value=_status()):
        result = iis.compute_readiness_score(1, None, None)  # type: ignore[arg-type]
    assert result.recommended_next_import == "coa"


def test_recommend_tb_when_coa_only():
    with patch.object(iis, "get_readiness_status", return_value=_status(coa_available=True)):
        result = iis.compute_readiness_score(1, None, None)  # type: ignore[arg-type]
    assert result.recommended_next_import == "tb"


def test_recommend_taxonomy_mapping_when_tb_but_low_coverage():
    with patch.object(iis, "get_readiness_status", return_value=_status(
        coa_available=True, tb_has_balances=True, gl_available=True, taxonomy_mapped_pct=20.0,
    )):
        result = iis.compute_readiness_score(1, None, None)  # type: ignore[arg-type]
    assert result.recommended_next_import == "taxonomy_mapping"


# ---------------------------------------------------------------------------
# Output shape — to_dict
# ---------------------------------------------------------------------------

def test_to_dict_contains_all_capability_keys():
    with patch.object(iis, "get_readiness_status", return_value=_status(coa_available=True)):
        d = iis.compute_readiness_score(1, None, None).to_dict()  # type: ignore[arg-type]
    assert "score" in d
    assert "grade" in d
    assert "capabilities" in d
    assert "missing_data" in d
    assert "recommended_next_import" in d
    expected_caps = {
        "mapping", "financial_statements", "comparative_reports", "drilldown",
        "rollforwards", "reconciliations", "consolidation", "draft_impact", "bridge",
    }
    actual_caps = {c["key"] for c in d["capabilities"]}
    assert expected_caps.issubset(actual_caps)


# ---------------------------------------------------------------------------
# Weights sum to 100
# ---------------------------------------------------------------------------

def test_capability_weights_sum_to_100():
    """The total achievable score should always be exactly 100."""
    assert sum(c.weight for c in iis.CAPABILITIES) == 100


# ---------------------------------------------------------------------------
# Grade thresholds
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("score,expected_grade", [
    (0, "empty"),
    (10, "limited"),
    (34, "limited"),
    (35, "workable"),
    (64, "workable"),
    (65, "strong"),
    (89, "strong"),
    (90, "complete"),
    (100, "complete"),
])
def test_grade_thresholds(score, expected_grade):
    assert iis._grade(score) == expected_grade
