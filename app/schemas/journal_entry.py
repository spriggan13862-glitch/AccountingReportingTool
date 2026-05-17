import datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator


class JournalEntryLineCreate(BaseModel):
    line_number: int
    account_id: int
    entity_id: int
    debit: Decimal = Decimal("0")
    credit: Decimal = Decimal("0")
    description: str | None = None

    @field_validator("debit", "credit")
    @classmethod
    def must_be_non_negative(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("amount must be non-negative")
        return v


class JournalEntryCreate(BaseModel):
    je_number: str
    entry_date: datetime.date
    entity_id: int
    scenario_id: int
    description: str
    source: str = "manual"
    source_ref: str | None = None
    created_by: str | None = None
    lines: list[JournalEntryLineCreate]
