from sqlalchemy import CheckConstraint, Column, ForeignKey, Index, Integer, Numeric, Text

from app.database import Base


class JournalEntryLine(Base):
    __tablename__ = "journal_entry_lines"
    __table_args__ = (
        CheckConstraint("debit >= 0", name="ck_jel_debit_nonneg"),
        CheckConstraint("credit >= 0", name="ck_jel_credit_nonneg"),
        CheckConstraint("NOT (debit > 0 AND credit > 0)", name="ck_jel_not_both"),
        Index("idx_jel_je", "journal_entry_id"),
        Index("idx_jel_account", "account_id"),
        Index("idx_jel_entity", "entity_id"),
    )

    id = Column(Integer, primary_key=True)
    journal_entry_id = Column(
        Integer, ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False
    )
    line_number = Column(Integer, nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    debit = Column(Numeric(20, 2), nullable=False, default=0)
    credit = Column(Numeric(20, 2), nullable=False, default=0)
    description = Column(Text, nullable=True)
