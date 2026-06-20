"""
Presentation service (Sprint P3).

Pure presentation-layer functions: sign behavior, scaling, formatting,
subtotal computation, formula evaluation. No classification logic — input
is already-classified numbers; output is display-ready values.

This service is consumed by:
  - taxonomy_reporting_service.get_taxonomy_fs_statement() — delegates
    sign-flip/display-balance computation here (Sprint P3).
  - The future ReportingView reporting engine (Sprint P5).

Functions are stateless and DB-free.
"""
from __future__ import annotations
import re
from decimal import Decimal


# ---------------------------------------------------------------------------
# Sign behavior
# ---------------------------------------------------------------------------

CREDIT_NORMAL_FLIP = "credit"
NEGATIVE_SIGN_BEHAVIOR = "negative"
ABSOLUTE_SIGN_BEHAVIOR = "absolute"


def should_sign_flip(normal_balance: str | None, sign_behavior: str | None = None) -> bool:
    """
    Decide whether to negate a balance for display.

    Credit-normal accounts (liabilities, equity, revenue) carry credit
    balances internally; FS presentation expects positive values, so we
    flip the sign at the display boundary. The optional sign_behavior
    overrides ('negative' = always flip, 'absolute' = handle elsewhere).
    """
    if sign_behavior == NEGATIVE_SIGN_BEHAVIOR:
        return True
    if normal_balance == CREDIT_NORMAL_FLIP:
        return True
    return False


def apply_sign_for_display(
    amount: Decimal | float,
    normal_balance: str | None,
    sign_behavior: str | None = None,
) -> Decimal:
    """Return amount adjusted by sign behavior for display."""
    val = amount if isinstance(amount, Decimal) else Decimal(str(amount))
    if sign_behavior == ABSOLUTE_SIGN_BEHAVIOR:
        return abs(val)
    return -val if should_sign_flip(normal_balance, sign_behavior) else val


# ---------------------------------------------------------------------------
# Scaling
# ---------------------------------------------------------------------------

SCALING_FACTORS: dict[str, Decimal] = {
    "actual": Decimal("1"),
    "thousands": Decimal("1000"),
    "millions": Decimal("1000000"),
    "billions": Decimal("1000000000"),
}


def apply_scaling(amount: Decimal | float, scaling: str = "actual") -> Decimal:
    val = amount if isinstance(amount, Decimal) else Decimal(str(amount))
    factor = SCALING_FACTORS.get(scaling, Decimal("1"))
    return val / factor


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------

def format_amount(
    amount: Decimal | float,
    scaling: str = "actual",
    decimals: int = 0,
    negative_format: str = "parentheses",
    currency_symbol: str = "",
) -> str:
    """
    Render a numeric value for display.

    negative_format:
      parentheses — (1,234)
      minus       — -1,234
      red         — -1,234  (caller styles in red; same text)
    """
    scaled = apply_scaling(amount, scaling)
    quantize = Decimal("1") if decimals == 0 else Decimal("1").scaleb(-decimals)
    rounded = scaled.quantize(quantize)
    abs_str = f"{abs(rounded):,.{decimals}f}"
    sym = currency_symbol or ""
    if rounded < 0:
        if negative_format == "parentheses":
            return f"({sym}{abs_str})"
        return f"-{sym}{abs_str}"
    return f"{sym}{abs_str}"


# ---------------------------------------------------------------------------
# Subtotals / calculations
# ---------------------------------------------------------------------------

def compute_subtotal(values: list[Decimal | float]) -> Decimal:
    """Sum a list of presentation values (after sign-for-display applied)."""
    return sum((v if isinstance(v, Decimal) else Decimal(str(v)) for v in values), Decimal("0"))


_TOKEN_RE = re.compile(r"\{([^}]+)\}")


def compute_calculation(formula: str, named_values: dict[str, Decimal | float]) -> Decimal:
    """
    Evaluate a simple arithmetic formula with named placeholders.

      formula = "{OPERATING_INCOME} + {DEPRECIATION_EXPENSE} + {AMORTIZATION_EXPENSE}"
      named_values = {"OPERATING_INCOME": 100, "DEPRECIATION_EXPENSE": 10, "AMORTIZATION_EXPENSE": 5}
      → Decimal("115")

    Only allows +, -, *, /, parentheses and {NAME} substitutions. Anything
    else raises ValueError. (We deliberately do NOT use eval() with full
    Python semantics — that would be a code injection risk.)
    """
    safe_chars = re.compile(r"^[\d\s\.\+\-\*\/\(\)\,]*$")

    def repl(match: re.Match) -> str:
        name = match.group(1).strip()
        if name not in named_values:
            raise ValueError(f"compute_calculation: unknown name '{name}' in formula")
        val = named_values[name]
        return str(val if isinstance(val, Decimal) else Decimal(str(val)))

    substituted = _TOKEN_RE.sub(repl, formula).replace(",", "")
    if not safe_chars.match(substituted):
        raise ValueError(f"compute_calculation: unsafe characters in formula after substitution: {substituted!r}")
    if not substituted.strip():
        return Decimal("0")
    # Restricted-globals eval; only Decimal-compatible math is reachable.
    try:
        result = eval(substituted, {"__builtins__": {}}, {})  # noqa: S307
    except (SyntaxError, ZeroDivisionError) as exc:
        raise ValueError(f"compute_calculation: {exc}") from exc
    return Decimal(str(result))


# ---------------------------------------------------------------------------
# Variance helpers
# ---------------------------------------------------------------------------

def compute_variance(current: Decimal | float, prior: Decimal | float) -> Decimal:
    """Absolute variance: current - prior."""
    c = current if isinstance(current, Decimal) else Decimal(str(current))
    p = prior if isinstance(prior, Decimal) else Decimal(str(prior))
    return c - p


def compute_variance_pct(current: Decimal | float, prior: Decimal | float) -> Decimal | None:
    """
    Percentage variance: (current - prior) / |prior|.
    Returns None when prior is zero (undefined / infinite).
    """
    p = prior if isinstance(prior, Decimal) else Decimal(str(prior))
    if p == 0:
        return None
    c = current if isinstance(current, Decimal) else Decimal(str(current))
    return (c - p) / abs(p)
