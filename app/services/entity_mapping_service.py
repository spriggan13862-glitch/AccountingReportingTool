"""Entity mapping service — Legal Entity Mapping workflow.

Maps PDF source accounts → standardized reporting taxonomy buckets,
optionally aligning to a target entity's existing COA taxonomy.

Flow:
  1. Take extracted PDF lines (from pdf_extraction_service)
  2. Group by suggested_taxonomy_code
  3. For each bucket: total the balances, flag mismatches
  4. Optionally: map to a target entity's taxonomy (for consolidation prep)
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any


# ---------------------------------------------------------------------------
# Bucket roll-up
# ---------------------------------------------------------------------------

def build_entity_mapping(
    lines: list[dict[str, Any]],
    target_entity_accounts: list[dict[str, Any]] | None = None,
    target_accounts: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Produce a legal entity mapping summary from extracted PDF lines.

    Args:
        lines: Output from pdf_extraction_service.extract_pdf_financials()["lines"]
        target_entity_accounts: Optional list of target entity account dicts
            (id, code, name, taxonomy_code) for consolidation alignment.

    Returns:
        Dict with buckets (by taxonomy code), unmapped lines, and
        consolidation_mapping if target_entity_accounts provided.
    """
    buckets: dict[str, dict[str, Any]] = {}

    for line in lines:
        if line.get("is_subtotal"):
            continue

        code = line.get("suggested_taxonomy_code") or "unmapped"
        if code not in buckets:
            buckets[code] = {
                "taxonomy_code": code,
                "source_lines": [],
                "total_amount": Decimal("0"),
                "confidence": line.get("mapping_confidence", "low"),
                "evidence": line.get("mapping_evidence", ""),
            }

        amount = Decimal(str(line.get("amount", "0")))
        buckets[code]["source_lines"].append({
            "temp_account_code": line["temp_account_code"],
            "account_name": line["account_name"],
            "amount": str(amount),
            "statement_type": line["statement_type"],
            "section": line["section"],
            "confidence": line.get("mapping_confidence", "low"),
            "evidence": line.get("mapping_evidence", ""),
        })
        buckets[code]["total_amount"] += amount

        # Keep lowest confidence for the bucket
        conf_rank = {"high": 3, "medium": 2, "low": 1}
        existing_rank = conf_rank.get(buckets[code]["confidence"], 1)
        new_rank = conf_rank.get(line.get("mapping_confidence", "low"), 1)
        if new_rank < existing_rank:
            buckets[code]["confidence"] = line.get("mapping_confidence", "low")

    # Convert Decimal totals to str
    for b in buckets.values():
        b["total_amount"] = str(b["total_amount"])

    unmapped = buckets.pop("unmapped", None)
    result: dict[str, Any] = {
        "buckets": list(buckets.values()),
        "unmapped_lines": unmapped["source_lines"] if unmapped else [],
        "bucket_count": len(buckets),
        "unmapped_count": len(unmapped["source_lines"]) if unmapped else 0,
    }

    effective_targets = target_accounts if target_accounts is not None else target_entity_accounts
    if effective_targets is not None:
        result["consolidation_mapping"] = _build_consolidation_map(
            list(buckets.values()), effective_targets
        )

    return result


# ---------------------------------------------------------------------------
# Consolidation alignment
# ---------------------------------------------------------------------------

def _build_consolidation_map(
    buckets: list[dict[str, Any]],
    target_accounts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Align source buckets to target entity accounts by taxonomy code."""
    # Build lookup: taxonomy_code → list of target accounts
    target_by_taxonomy: dict[str, list[dict[str, Any]]] = {}
    for acct in target_accounts:
        tc = acct.get("taxonomy_code") or "unmapped"
        target_by_taxonomy.setdefault(tc, []).append(acct)

    mapping: list[dict[str, Any]] = []
    for bucket in buckets:
        tc = bucket["taxonomy_code"]
        matched = target_by_taxonomy.get(tc, [])
        mapping.append({
            "taxonomy_code": tc,
            "source_total": bucket["total_amount"],
            "source_line_count": len(bucket["source_lines"]),
            "target_accounts": [
                {"id": a["id"], "code": a.get("code", ""), "name": a.get("name", "")}
                for a in matched
            ],
            "match_status": "matched" if matched else "no_target",
        })

    return mapping
