from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, ForeignKey,
    Index, Integer, String, UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("entity_id", "account_number", name="uq_accounts_entity_number"),
        CheckConstraint(
            "account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')",
            name="ck_accounts_type",
        ),
        CheckConstraint(
            "normal_balance IN ('debit', 'credit')",
            name="ck_accounts_normal_balance",
        ),
        Index("idx_accounts_number", "account_number"),
        Index("idx_accounts_type", "account_type"),
    )

    id = Column(Integer, primary_key=True)
    account_number = Column(String(50), nullable=False)
    account_name = Column(String(200), nullable=False)
    account_type = Column(String(20), nullable=False)
    normal_balance = Column(String(6), nullable=False)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True)
    parent_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
