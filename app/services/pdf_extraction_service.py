"""PDF financial statement extraction service.

Extracts BS/IS line items from a compiled financial statement PDF using
pdfplumber (text extraction, no OCR required).

Account code pattern: {PREFIX}-{STMT}-{CAT}-{HASH8}
  PREFIX: entity prefix (e.g. "HERO") derived from source_entity_name or passed explicitly
  STMT:   BS = balance sheet, IS = income statement
  CAT:    CASH, PPE, OTA, LCL, LLT, EQ, REV, COGS, OPEX, OTH
  HASH8:  first 8 hex chars (uppercase) of SHA-256("{STMT}:{CAT}:{NORMALIZED_NAME}")
          where NORMALIZED_NAME = account_name.strip().upper()

Stability guarantee: given the same account name in the same section, the code is
always identical regardless of extraction order, line count, or surrounding context.
Collisions (two distinct names producing the same 8-char prefix) are detected and
resolved by appending "-2", "-3", … within the same extraction run.

Parsing rules:
  - Lines with dollar amounts are always data/subtotal lines (never section headers).
  - Lines without amounts are checked for section header keywords.
  - IS pages have two amount columns (1-month, 12-month) plus two percent columns.
    The 12-month YTD amount is the 3rd numeric token (index -2 of 4 matches).
"""
from __future__ import annotations

import hashlib
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Taxonomy mapping: section → (taxonomy_code, confidence)
# ---------------------------------------------------------------------------

_SECTION_TAXONOMY: dict[str, tuple[str, str]] = {
    "current_assets":         ("cash_equivalents",         "medium"),
    "fixed_assets":           ("property_equipment",       "high"),
    "other_assets":           ("other_noncurrent_assets",  "high"),
    "current_liabilities":    ("other_current_liabilities","medium"),
    "long_term_liabilities":  ("long_term_debt",           "medium"),
    "equity":                 ("retained_earnings",        "medium"),
    "revenue":                ("revenue",                  "high"),
    "cogs":                   ("cogs",                     "high"),
    "operating_expenses":     ("operating_expenses",       "high"),
    "other_income":           ("other_income",             "high"),
}

# Name-level overrides (checked in order; first match wins)
_NAME_TAXONOMY_OVERRIDES: list[tuple[str, str, str]] = [
    # More-specific patterns must precede broader ones that would otherwise match first.
    ("petty cash",             "cash_equivalents",         "high"),
    ("accounts receivable",    "accounts_receivable",      "high"),
    # Long-term debt — must precede generic "bank" / "n/p" matches
    ("mortgage payable",       "long_term_debt",           "high"),
    ("mortgage",               "long_term_debt",           "high"),
    ("n/p - wells",            "long_term_debt",           "high"),
    ("n/p - bank",             "long_term_debt",           "high"),
    ("n/p - sba",              "long_term_debt",           "high"),
    ("n/p wells",              "long_term_debt",           "high"),
    ("n/p bank",               "long_term_debt",           "high"),
    ("n/p sba",                "long_term_debt",           "high"),
    # Interest income/expense — must come before "credit card" to avoid
    # "INTEREST EXP - CREDIT CARDS" matching as short_term_debt
    ("interest income",        "other_income",             "high"),
    ("interest expense",       "interest_expense",         "high"),
    ("interest exp",           "interest_expense",         "high"),
    # Short-term debt
    ("n/p - shareholder",      "short_term_debt",          "high"),
    ("n/p shareholder",        "short_term_debt",          "high"),
    ("credit card",            "short_term_debt",          "high"),
    # Cash — generic "bank" after debt patterns so mortgage payable bank accounts don't match here
    ("mmkt",                   "cash_equivalents",         "high"),
    ("money market",           "cash_equivalents",         "high"),
    ("bank",                   "cash_equivalents",         "high"),
    # PP&E
    ("furniture",              "property_equipment",       "high"),
    ("building",               "property_equipment",       "high"),
    ("land",                   "property_equipment",       "high"),
    ("improvements",           "property_equipment",       "high"),
    ("equipment",              "property_equipment",       "high"),
    ("accumulated deprec",     "property_equipment",       "high"),
    # Intangibles
    ("loan costs",             "intangible_assets",        "high"),
    ("accumulated amort",      "intangible_assets",        "high"),
    # Current liabilities
    ("sales tax payable",      "other_current_liabilities","high"),
    # Equity
    ("common stock",           "common_stock",             "high"),
    ("distributions",          "retained_earnings",        "high"),
    ("accumulated adjustments","retained_earnings",        "high"),
    ("net income",             "retained_earnings",        "high"),
    ("net loss",               "retained_earnings",        "high"),
    # Revenue — more specific before generic
    ("sales - revenue",        "revenue",                  "high"),
    ("sales revenue",          "revenue",                  "high"),
    # COGS
    ("cogs -",                 "cogs",                     "high"),
    ("commissions",            "cogs",                     "high"),
    # Depreciation/amortization
    ("depreciation",           "depreciation_amort",       "high"),
    ("amortization",           "depreciation_amort",       "high"),
    # Payroll
    ("salaries",               "salaries_wages",           "high"),
    ("payroll",                "salaries_wages",           "high"),
    # Other income
    ("rental",                 "other_income",             "high"),
    ("hurricane",              "other_income",             "high"),
    ("reimbursements",         "other_income",             "high"),
]


def _suggest_taxonomy(account_name: str, section: str) -> tuple[str | None, str, str]:
    name_lower = account_name.strip().lower()
    for keyword, code, conf in _NAME_TAXONOMY_OVERRIDES:
        if keyword in name_lower:
            return code, conf, f"Name: {keyword}"
    base = _SECTION_TAXONOMY.get(section)
    if base:
        return base[0], base[1], f"Section: {section}"
    return None, "low", "no match"


# ---------------------------------------------------------------------------
# Amount parsing
# ---------------------------------------------------------------------------

# Matches optional leading paren, digits+commas, two decimal digits, optional trailing paren
_AMT_RE = re.compile(r"\(?([\d,]{1,15}\.\d{2})\)?")

# Dollar sign with optional space that precedes an amount
_DOLLAR_SIGN_RE = re.compile(r"\$\s*")


def _parse_amount(raw: str) -> Decimal | None:
    """Parse 'NN,NNN.NN' or '(NN,NNN.NN)' → Decimal."""
    raw = raw.strip()
    negative = raw.startswith("(") and raw.endswith(")")
    m = _AMT_RE.search(raw)
    if not m:
        return None
    try:
        val = Decimal(m.group(1).replace(",", ""))
        return -val if negative else val
    except InvalidOperation:
        return None


def _all_amounts(line: str) -> list[re.Match]:
    return list(_AMT_RE.finditer(line))


def _has_amount(line: str) -> bool:
    return bool(_AMT_RE.search(line))


def _extract_bs_amount(line: str) -> Decimal | None:
    """BS lines have one amount (last match)."""
    matches = _all_amounts(line)
    if not matches:
        return None
    raw = matches[-1].group(0)
    return _parse_amount(raw)


def _extract_is_ytd_amount(line: str) -> Decimal | None:
    """IS lines have 4 numeric columns: month_amt, month_pct, ytd_amt, ytd_pct.
    YTD amount is the 3rd column = index -2.
    If fewer than 4 matches, fall back to last match.
    """
    matches = _all_amounts(line)
    if not matches:
        return None
    if len(matches) >= 4:
        raw = matches[-2].group(0)
    else:
        raw = matches[-1].group(0)
    return _parse_amount(raw)


def _clean_name(line: str) -> str:
    """Remove amounts, dollar signs, percentages, and trailing whitespace from a line."""
    # Remove amounts (including parenthesized negatives)
    cleaned = _AMT_RE.sub("", line)
    # Remove dollar signs
    cleaned = _DOLLAR_SIGN_RE.sub("", cleaned)
    # Collapse extra whitespace
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    # Remove trailing punctuation artifacts
    cleaned = re.sub(r"[\s\.]+$", "", cleaned).strip()
    return cleaned


# ---------------------------------------------------------------------------
# Section detection
# ---------------------------------------------------------------------------

_BS_SECTION_HEADERS: list[tuple[str, str]] = [
    ("current assets",           "current_assets"),
    ("fixed assets",             "fixed_assets"),
    ("other assets",             "other_assets"),
    ("current liabilities",      "current_liabilities"),
    ("long term liabilities",    "long_term_liabilities"),
    ("long-term liabilities",    "long_term_liabilities"),
    ("stockholders' equity",     "equity"),
    ("shareholders' equity",     "equity"),
    # generic equity catch — only if none of the above matched
    ("stockholders",             "equity"),
    ("shareholders",             "equity"),
]

_IS_SECTION_HEADERS: list[tuple[str, str]] = [
    ("cost of goods sold",       "cogs"),
    ("cost of sales",            "cogs"),
    ("operating expenses",       "operating_expenses"),
    ("general and administrative","operating_expenses"),
    ("other income",             "other_income"),
    ("other expense",            "other_income"),
    ("income",                   "revenue"),
    ("revenue",                  "revenue"),
]


def _detect_section(text: str, headers: list[tuple[str, str]]) -> str | None:
    t = text.strip().lower()
    for keyword, section in headers:
        if t.startswith(keyword) or keyword in t:
            return section
    return None


_SUBTOTAL_PREFIXES = (
    "total",
    "net fixed",
    "gross profit",
    "income from operations",
    "operating income",
    "net income",
    "net loss",
    "subtotal",
    "ebitda",
    "earnings before",
    "net revenue",
    "net sales",
)


def _is_subtotal_line(name: str) -> bool:
    t = name.strip().lower()
    return any(t.startswith(p) or t.endswith(p) for p in _SUBTOTAL_PREFIXES)


# ---------------------------------------------------------------------------
# Category code for temp account generation
# ---------------------------------------------------------------------------

_SECTION_CATEGORY: dict[str, str] = {
    "current_assets":        "CASH",
    "fixed_assets":          "PPE",
    "other_assets":          "OTA",
    "current_liabilities":   "LCL",
    "long_term_liabilities": "LLT",
    "equity":                "EQ",
    "revenue":               "REV",
    "cogs":                  "COGS",
    "operating_expenses":    "OPEX",
    "other_income":          "OTH",
}

_STMT_ABBREV: dict[str, str] = {
    "balance_sheet":    "BS",
    "income_statement": "IS",
}


# ---------------------------------------------------------------------------
# Deterministic code generation
# ---------------------------------------------------------------------------

def _normalize_name(name: str) -> str:
    """Canonical form used as hash input: stripped, uppercased."""
    return name.strip().upper()


def _name_hash(stmt_abbrev: str, cat: str, normalized_name: str) -> str:
    """Full SHA-256 hex digest of "{STMT}:{CAT}:{NORMALIZED_NAME}"."""
    key = f"{stmt_abbrev}:{cat}:{normalized_name}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _stable_code(
    prefix: str,
    stmt_abbrev: str,
    cat: str,
    account_name: str,
    is_subtotal: bool,
    seen_hashes: dict[str, int],
) -> tuple[str, str]:
    """Return (temp_account_code, full_name_hash).

    The code is:
      {prefix}-{stmt_abbrev}-{cat}-{HASH8}          for detail lines
      {prefix}-{stmt_abbrev}-{cat}-SUB-{HASH8}       for subtotals

    Collision handling: if two different names produce the same HASH8 within
    the same seen_hashes scope, the second gets HASH8-2, third HASH8-3, etc.
    seen_hashes is mutated in place (maps full_hex_hash → collision_count).
    """
    normalized = _normalize_name(account_name)
    full_hash = _name_hash(stmt_abbrev, cat, normalized)
    short = full_hash[:8].upper()

    # Collision detection within this extraction run
    collision_count = seen_hashes.get(full_hash, 0) + 1
    seen_hashes[full_hash] = collision_count
    if collision_count > 1:
        short = f"{short}-{collision_count}"

    sub_marker = "SUB-" if is_subtotal else ""
    code = f"{prefix}-{stmt_abbrev}-{cat}-{sub_marker}{short}"
    return code, full_hash


# ---------------------------------------------------------------------------
# Main extraction entry point
# ---------------------------------------------------------------------------

def extract_pdf_financials(
    pdf_path: str | Path,
    entity_prefix: str | None = None,
) -> dict[str, Any]:
    """Extract financial statement lines from a PDF.

    Args:
        pdf_path: Path to the PDF file.
        entity_prefix: Override for the entity code prefix used in temp account codes
            (e.g. "HERO"). If None, derived from the first word of the detected entity name.
    """
    import pdfplumber

    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    with pdfplumber.open(pdf_path) as pdf:
        page_count = len(pdf.pages)
        pages_text = [p.extract_text() or "" for p in pdf.pages]

    result: dict[str, Any] = {
        "source_entity_name": None,
        "statement_date": None,
        "basis_of_accounting": None,
        "page_count": page_count,
        "entity_prefix": None,
        "lines": [],
        "validation": {},
        "warnings": [],
    }

    page1 = pages_text[0] if pages_text else ""
    result["source_entity_name"] = _detect_entity_name(page1)
    result["statement_date"] = _detect_statement_date(page1)
    result["basis_of_accounting"] = _detect_basis(pages_text)

    # Determine prefix: explicit override > first word of detected name > "SRC"
    if entity_prefix:
        prefix = entity_prefix.upper().strip()
    elif result["source_entity_name"]:
        prefix = re.sub(r"[^A-Z0-9]", "", result["source_entity_name"].upper().split()[0])[:8]
    else:
        prefix = "SRC"
    result["entity_prefix"] = prefix

    # Shared seen_hashes dict — collision detection spans BS + IS within one extraction run
    seen_hashes: dict[str, int] = {}

    bs_lines = _parse_balance_sheet(page1, page_num=1, prefix=prefix, seen_hashes=seen_hashes)
    is_text = "\n".join(pages_text[1:3]) if len(pages_text) >= 3 else ""
    is_lines = _parse_income_statement(is_text, page_num=2, prefix=prefix, seen_hashes=seen_hashes)

    all_lines = bs_lines + is_lines
    result["lines"] = all_lines
    result["validation"] = _build_validation(all_lines)
    result["warnings"] = _collect_warnings(all_lines, result["validation"])

    return result


# ---------------------------------------------------------------------------
# Entity / date / basis detection
# ---------------------------------------------------------------------------

_SKIP_HEADER_WORDS = {
    "balance sheet", "income statement", "statement of", "statement of assets",
    "statement of revenues", "december", "year ended", "month ended",
    "income tax basis", "gaap", "unaudited", "audited",
    "see accountants", "compilation",
}


def _detect_entity_name(text: str) -> str | None:
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        low = stripped.lower()
        if any(kw in low for kw in _SKIP_HEADER_WORDS):
            continue
        if _has_amount(stripped):
            continue
        return stripped
    return None


def _detect_statement_date(text: str) -> str | None:
    m = re.search(r"december\s+31,?\s+(\d{4})", text, re.IGNORECASE)
    if m:
        return f"{m.group(1)}-12-31"
    m = re.search(r"(\w+\s+\d{1,2},?\s+\d{4})", text, re.IGNORECASE)
    if m:
        return m.group(1)
    return None


def _detect_basis(pages_text: list[str]) -> str | None:
    full = " ".join(pages_text).lower()
    if "income tax basis" in full:
        return "income_tax"
    if "cash basis" in full:
        return "cash"
    if "accrual" in full:
        return "accrual"
    return "unknown"


# ---------------------------------------------------------------------------
# Balance Sheet parsing
# ---------------------------------------------------------------------------

def _parse_balance_sheet(
    text: str,
    page_num: int,
    prefix: str = "SRC",
    seen_hashes: dict[str, int] | None = None,
) -> list[dict[str, Any]]:
    if seen_hashes is None:
        seen_hashes = {}
    lines: list[dict[str, Any]] = []
    current_section: str | None = None
    sort_order = 0

    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue

        if _has_amount(stripped):
            if current_section is None:
                continue
            amount = _extract_bs_amount(stripped)
            if amount is None:
                continue
            name = _clean_name(stripped)
            if not name:
                continue
            is_sub = _is_subtotal_line(name)
            is_contra = (
                stripped.strip().startswith("(")
                or "accumulated" in name.lower()
                or "distributions" in name.lower()
                or name.lower().startswith("(")
            )
            cat = _SECTION_CATEGORY.get(current_section, "OTH")
            stmt_abbrev = _STMT_ABBREV["balance_sheet"]
            code, full_hash = _stable_code(prefix, stmt_abbrev, cat, name, is_sub, seen_hashes)
            tax_code, confidence, evidence = _suggest_taxonomy(name, current_section)

            lines.append({
                "temp_account_code": code,
                "name_hash": full_hash,
                "account_name": name,
                "statement_type": "balance_sheet",
                "section": current_section,
                "amount": str(amount),
                "is_subtotal": is_sub,
                "is_contra": is_contra,
                "sort_order": sort_order,
                "suggested_taxonomy_code": tax_code,
                "mapping_confidence": confidence,
                "mapping_evidence": evidence,
                "page_number": page_num,
                "source_line_text": stripped,
            })
            sort_order += 1
        else:
            new_section = _detect_section(stripped, _BS_SECTION_HEADERS)
            if new_section:
                current_section = new_section

    return lines


# ---------------------------------------------------------------------------
# Income Statement parsing
# ---------------------------------------------------------------------------

def _parse_income_statement(
    text: str,
    page_num: int,
    prefix: str = "SRC",
    seen_hashes: dict[str, int] | None = None,
) -> list[dict[str, Any]]:
    if seen_hashes is None:
        seen_hashes = {}
    lines: list[dict[str, Any]] = []
    current_section: str | None = None
    sort_order = 1000

    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue

        if _has_amount(stripped):
            if current_section is None:
                continue
            amount = _extract_is_ytd_amount(stripped)
            if amount is None:
                continue
            name = _clean_name(stripped)
            if not name:
                continue
            if re.fullmatch(r"[\d\.]+", name):
                continue
            is_sub = _is_subtotal_line(name)
            cat = _SECTION_CATEGORY.get(current_section, "OTH")
            stmt_abbrev = _STMT_ABBREV["income_statement"]
            code, full_hash = _stable_code(prefix, stmt_abbrev, cat, name, is_sub, seen_hashes)
            tax_code, confidence, evidence = _suggest_taxonomy(name, current_section)

            lines.append({
                "temp_account_code": code,
                "name_hash": full_hash,
                "account_name": name,
                "statement_type": "income_statement",
                "section": current_section,
                "amount": str(amount),
                "is_subtotal": is_sub,
                "is_contra": False,
                "sort_order": sort_order,
                "suggested_taxonomy_code": tax_code,
                "mapping_confidence": confidence,
                "mapping_evidence": evidence,
                "page_number": page_num,
                "source_line_text": stripped,
            })
            sort_order += 1
        else:
            new_section = _detect_section(stripped, _IS_SECTION_HEADERS)
            if new_section:
                current_section = new_section

    return lines


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

_TOLERANCE = Decimal("1.01")

import re as _re

# Ordered label→key patterns (first match wins; more-specific patterns listed first).
_SUBTOTAL_KEY_PATTERNS: list[tuple[_re.Pattern[str], str]] = [
    (_re.compile(r'total\s+current\s+assets?', _re.I), 'total_current_assets'),
    (_re.compile(r'net\s+fixed\s+assets?', _re.I), 'net_fixed_assets'),
    (_re.compile(r'total\s+other\s+assets?', _re.I), 'total_other_assets'),
    (_re.compile(r'total\s+assets?\b', _re.I), 'total_assets'),
    (_re.compile(r'total\s+current\s+liabilit', _re.I), 'total_current_liabilities'),
    (_re.compile(r'total\s+(long[\s\-]?term|long)\s+liabilit', _re.I), 'total_long_term_liabilities'),
    (_re.compile(r'total\s+(stockholders?|equity|shareholders?)', _re.I), 'total_equity'),
    (_re.compile(r'total\s+(income|revenue)(?!\s+tax)', _re.I), 'total_income'),
    (_re.compile(r'total\s+cost\s+of\s+(sales|goods)', _re.I), 'total_cogs'),
    (_re.compile(r'gross\s+profit', _re.I), 'gross_profit'),
    (_re.compile(r'total\s+operating\s+exp', _re.I), 'total_operating_expenses'),
    (_re.compile(r'total\s+other\s+income', _re.I), 'total_other_income'),
    (_re.compile(r'\bnet\s+(income|loss)\b', _re.I), 'net_income'),
]

_CANONICAL_KEY_ORDER = [
    'total_current_assets', 'net_fixed_assets', 'total_other_assets', 'total_assets',
    'total_current_liabilities', 'total_long_term_liabilities', 'total_equity',
    'total_income', 'total_cogs', 'gross_profit', 'total_operating_expenses',
    'total_other_income', 'net_income',
]


def _map_subtotal_key(name: str) -> str | None:
    for pat, key in _SUBTOTAL_KEY_PATTERNS:
        if pat.search(name):
            return key
    return None


def _safe_dec(raw: Any) -> Decimal:
    if raw is None:
        return Decimal("0")
    s = str(raw).strip()
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    s = s.replace(",", "").replace("$", "").strip()
    try:
        return Decimal(s) if s else Decimal("0")
    except InvalidOperation:
        return Decimal("0")


def _build_validation(lines: list[dict[str, Any]]) -> dict[str, Any]:
    """Map PDF subtotals to 13 canonical check keys and verify internal consistency."""
    from collections import defaultdict

    # Index: canonical_key → {label, extracted, section}
    subtotals: dict[str, dict[str, Any]] = {}
    # Detail lines grouped by section
    section_details: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for line in lines:
        sect = f"{line.get('statement_type', '')}::{line.get('section', '')}"
        if line.get("is_subtotal"):
            mapped = _map_subtotal_key(line.get("account_name", ""))
            if mapped and mapped not in subtotals:
                subtotals[mapped] = {
                    "section": sect,
                    "label": line.get("account_name", ""),
                    "extracted": _safe_dec(line.get("amount")),
                }
        else:
            section_details[sect].append(line)

    def sum_sect(sect: str) -> Decimal:
        return sum((_safe_dec(d.get("amount")) for d in section_details.get(sect, [])), Decimal("0"))

    def get_ext(key: str) -> Decimal:
        return subtotals.get(key, {}).get("extracted", Decimal("0"))

    # Expected values by canonical key
    expected: dict[str, Decimal] = {
        "total_current_assets":       sum_sect("balance_sheet::current_assets"),
        "net_fixed_assets":           sum_sect("balance_sheet::fixed_assets"),
        "total_other_assets":         sum_sect("balance_sheet::other_assets"),
        "total_assets":               get_ext("total_current_assets") + get_ext("net_fixed_assets") + get_ext("total_other_assets"),
        "total_current_liabilities":  sum_sect("balance_sheet::current_liabilities"),
        "total_long_term_liabilities": sum_sect("balance_sheet::long_term_liabilities"),
        "total_equity":               sum_sect("balance_sheet::equity"),
        "total_income":               sum_sect("income_statement::revenue"),
        "total_cogs":                 sum_sect("income_statement::cogs"),
        "gross_profit":               get_ext("total_income") - get_ext("total_cogs"),
        "total_operating_expenses":   sum_sect("income_statement::operating_expenses"),
        "total_other_income":         sum_sect("income_statement::other_income"),
        "net_income":                 get_ext("gross_profit") - get_ext("total_operating_expenses") + get_ext("total_other_income"),
    }

    checks: list[dict[str, Any]] = []
    for key in _CANONICAL_KEY_ORDER:
        if key not in subtotals:
            continue
        extracted = subtotals[key]["extracted"]
        exp = expected.get(key, Decimal("0"))
        diff = abs(extracted - exp)
        status = "pass" if diff <= _TOLERANCE else "fail"
        checks.append({
            "key": key,
            "label": subtotals[key]["label"],
            "extracted": str(extracted),
            "expected": str(exp),
            "difference": str(diff),
            "status": status,
        })

    passing = sum(1 for c in checks if c["status"] == "pass")
    failing = sum(1 for c in checks if c["status"] == "fail")
    return {"checks": checks, "passing": passing, "failing": failing, "total": len(checks)}


def _collect_warnings(lines: list[dict[str, Any]], validation: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    for c in validation.get("checks", []):
        if c["status"] == "fail":
            warnings.append(
                f"Subtotal mismatch: {c['label']} — extracted {c['extracted']}, expected {c['expected']}"
            )
    low_conf = [l for l in lines if not l["is_subtotal"] and l.get("mapping_confidence") == "low"]
    if low_conf:
        warnings.append(f"{len(low_conf)} line(s) have low-confidence taxonomy mapping")
    return warnings
