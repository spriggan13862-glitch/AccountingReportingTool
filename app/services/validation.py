"""
Centralized validation framework.

ValidationIssue  — a single diagnostic item with code, severity, and context.
ValidationResult — an ordered collection of issues with error/warning accessors.
ValidationError  — raised by raise_if_errors() when ERRORs are present.

Severity semantics
------------------
ERROR   — blocks the operation (posting, import, report generation).
WARNING — surfaces to the caller but does not block continuation.
INFO    — informational only; no action required.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


class Severity(str, Enum):
    ERROR   = "ERROR"
    WARNING = "WARNING"
    INFO    = "INFO"


@dataclass
class ValidationIssue:
    code: str
    severity: Severity
    message: str
    source_type: str
    source_id: Any = None
    field_name: str | None = None
    suggested_resolution: str | None = None

    def to_dict(self) -> dict:
        """Return a JSON-serializable dict representation."""
        d = asdict(self)
        d["severity"] = self.severity.value
        return d


class ValidationResult:
    """
    Accumulates ValidationIssues.

    Usage
    -----
    result = ValidationResult()
    result.error("CODE", "message", source_type="journal_entry")
    result.warning("CODE", "message", source_type="account_mapping")
    result.raise_if_errors()   # raises ValidationError if any ERROR present
    """

    def __init__(self) -> None:
        self.issues: list[ValidationIssue] = []

    # ------------------------------------------------------------------
    # Adders
    # ------------------------------------------------------------------

    def add(self, issue: ValidationIssue) -> "ValidationResult":
        self.issues.append(issue)
        return self

    def error(
        self,
        code: str,
        message: str,
        source_type: str,
        source_id: Any = None,
        field_name: str | None = None,
        suggested_resolution: str | None = None,
    ) -> "ValidationResult":
        return self.add(ValidationIssue(
            code=code,
            severity=Severity.ERROR,
            message=message,
            source_type=source_type,
            source_id=source_id,
            field_name=field_name,
            suggested_resolution=suggested_resolution,
        ))

    def warning(
        self,
        code: str,
        message: str,
        source_type: str,
        source_id: Any = None,
        field_name: str | None = None,
        suggested_resolution: str | None = None,
    ) -> "ValidationResult":
        return self.add(ValidationIssue(
            code=code,
            severity=Severity.WARNING,
            message=message,
            source_type=source_type,
            source_id=source_id,
            field_name=field_name,
            suggested_resolution=suggested_resolution,
        ))

    def info(
        self,
        code: str,
        message: str,
        source_type: str,
        source_id: Any = None,
        field_name: str | None = None,
        suggested_resolution: str | None = None,
    ) -> "ValidationResult":
        return self.add(ValidationIssue(
            code=code,
            severity=Severity.INFO,
            message=message,
            source_type=source_type,
            source_id=source_id,
            field_name=field_name,
            suggested_resolution=suggested_resolution,
        ))

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------

    @property
    def has_errors(self) -> bool:
        return any(i.severity == Severity.ERROR for i in self.issues)

    @property
    def has_warnings(self) -> bool:
        return any(i.severity == Severity.WARNING for i in self.issues)

    @property
    def errors(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == Severity.ERROR]

    @property
    def warnings(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == Severity.WARNING]

    @property
    def infos(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == Severity.INFO]

    # ------------------------------------------------------------------
    # Control flow
    # ------------------------------------------------------------------

    def raise_if_errors(self) -> None:
        """Raise ValidationError if any ERROR-severity issues are present."""
        if self.has_errors:
            msg = "; ".join(f"[{e.code}] {e.message}" for e in self.errors)
            raise ValidationError(msg, result=self)

    def merge(self, other: "ValidationResult") -> "ValidationResult":
        """Append all issues from *other* into this result in-place."""
        self.issues.extend(other.issues)
        return self

    def __bool__(self) -> bool:
        """True when the result has no ERROR-severity issues."""
        return not self.has_errors

    def __repr__(self) -> str:
        counts = {"ERROR": 0, "WARNING": 0, "INFO": 0}
        for i in self.issues:
            counts[i.severity.value] += 1
        return (
            f"ValidationResult(errors={counts['ERROR']}, "
            f"warnings={counts['WARNING']}, infos={counts['INFO']})"
        )


class ValidationError(ValueError):
    """
    Raised by ValidationResult.raise_if_errors() when one or more
    ERROR-severity issues are present.

    Attributes
    ----------
    result : ValidationResult
        The full result including all collected issues.
    """

    def __init__(self, message: str, result: ValidationResult) -> None:
        super().__init__(message)
        self.result = result
