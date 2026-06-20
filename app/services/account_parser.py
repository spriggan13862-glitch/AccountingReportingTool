"""
Shared account label parser.
Handles all common formats used in TB/COA/GL imports.
"""
import re
from dataclasses import dataclass

SEPARATORS = re.compile(r'[\s]*(?:[-:\.–—·])+[\s]*')

# Matches an account number prefix: digits, optionally followed by subaccount
# suffix (-NN, :NN) but NOT a decimal followed by another number (handled separately).
_ACCT_NUM_RE = re.compile(
    r'^(\d{1,10}(?:[:\-]\d{1,6})*)'  # e.g. 1000, 1000-01, 1000:05
)

# Matches a separator token between number and name.
# The separator can be: space(s), dash, colon, em-dash, en-dash, middle-dot, period
# BUT only if followed by a non-digit (to distinguish "1000.01" from "1000.Cash").
_SPLIT_RE = re.compile(
    r'^(\d{1,10}(?:[:\-]\d{1,6})*)'         # account number portion
    r'(?:'
        r'\s*[-–—·:]\s*'                     # explicit separator (any of: - – — · :)
        r'|'
        r'\.'                                # dot-separator: 1000.Cash
        r'(?=[A-Za-z])'                      # only if followed by a letter
        r'|'
        r'\s+'                               # plain whitespace separator
    r')'
    r'(.+)$',                                # account name (rest of string)
    re.DOTALL,
)


@dataclass
class ParsedAccount:
    account_number: str | None   # "1000", "1000-01", "1200.1", None if not found
    account_name: str | None     # "Cash", "Accounts Receivable", None if not found
    raw: str                     # original input string


def parse_account_label(raw: str) -> ParsedAccount:
    """
    Parse an account label in any of these formats:
      1000 Cash
      1000 - Cash
      1000: Cash
      1000.Cash
      1000 · Cash
      1000 — Cash  (em dash)
      1000-01 · Operating Account  (subaccount)
      Cash  (name only, no number)
      1000  (number only)
      1000.01  (decimal subaccount — number is "1000.01")

    Rules:
    - If string starts with digits (possibly with subaccount suffix -NN or .NN or :NN),
      treat leading portion as account_number
    - After separator, remainder is account_name (stripped)
    - If no leading digits, entire string is account_name, account_number=None
    - Account numbers: allow digits, hyphens, dots, colons in number part
      but must START with a digit
    - Strip whitespace from both parts
    """
    s = raw.strip()
    if not s:
        return ParsedAccount(account_number=None, account_name=None, raw=raw)

    # Must start with a digit to have an account number
    if not s[0].isdigit():
        return ParsedAccount(account_number=None, account_name=s, raw=raw)

    # Try to split number + name using the split regex
    m = _SPLIT_RE.match(s)
    if m:
        number = m.group(1).strip()
        name = m.group(2).strip()
        return ParsedAccount(
            account_number=number or None,
            account_name=name or None,
            raw=raw,
        )

    # No separator found — the whole string is the account number
    # (handles "1000", "1000.01", "1000-01", "1000:05")
    # Confirm it looks purely numeric with allowed separators
    num_only_re = re.compile(r'^\d[\d\.\-:]*$')
    if num_only_re.match(s):
        return ParsedAccount(account_number=s, account_name=None, raw=raw)

    # Fallback: starts with digit but has text after non-separator — treat as name only
    return ParsedAccount(account_number=None, account_name=s, raw=raw)


def normalize_account_name(name: str) -> str:
    """
    Normalize for matching: lowercase, collapse whitespace,
    remove punctuation except hyphens, strip.
    """
    if not name:
        return ''
    n = name.lower().strip()
    n = re.sub(r'[^\w\s\-]', '', n)
    n = re.sub(r'\s+', ' ', n)
    return n.strip()


def detect_account_number_format(samples: list[str]) -> str:
    """
    Detect the numbering scheme used in a batch:
    'numeric_4digit' — 1000, 1200, 2000
    'numeric_5digit' — 10000, 12000
    'alphanumeric' — A001, REV-01
    'decimal' — 1.01, 2.03.01
    'none' — no numbers detected
    """
    if not samples:
        return 'none'

    numeric_4 = 0
    numeric_5 = 0
    alphanumeric = 0
    decimal = 0
    none_count = 0

    for raw in samples:
        parsed = parse_account_label(raw)
        num = parsed.account_number
        if num is None:
            none_count += 1
            continue
        if re.match(r'^\d+\.\d', num):
            decimal += 1
        elif re.match(r'^\d{5,}$', num):
            numeric_5 += 1
        elif re.match(r'^\d{4}$', num):
            numeric_4 += 1
        elif re.match(r'^\d+$', num) and len(num) != 4 and len(num) < 5:
            numeric_4 += 1
        elif re.match(r'^[A-Za-z]', num) or re.match(r'^\d+[A-Za-z]', num):
            alphanumeric += 1
        elif re.match(r'^\d', num):
            numeric_4 += 1
        else:
            none_count += 1

    total = len(samples) - none_count
    if total == 0:
        return 'none'

    counts = {
        'decimal': decimal,
        'numeric_5digit': numeric_5,
        'numeric_4digit': numeric_4,
        'alphanumeric': alphanumeric,
    }
    return max(counts, key=lambda k: counts[k])
