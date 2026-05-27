from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, ForeignKey,
    Index, Integer, String, UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base

_ACCOUNT_TYPES = (
    "'asset', 'liability', 'equity', 'revenue', 'cogs', "
    "'expense', 'other_income', 'other_expense', 'tax', 'intercompany'"
)


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("entity_id", "account_number", name="uq_accounts_entity_number"),
        CheckConstraint(
            f"account_type IN ({_ACCOUNT_TYPES})",
            name="ck_accounts_type",
        ),
        CheckConstraint(
            "normal_balance IN ('debit', 'credit')",
            name="ck_accounts_normal_balance",
        ),
        CheckConstraint(
            "account_status IN ('active', 'inactive', 'archived', 'deprecated')",
            name="ck_accounts_status",
        ),
        CheckConstraint(
            "fs_sign_convention IS NULL OR fs_sign_convention IN (-1, 1)",
            name="ck_accounts_fs_sign",
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

    # M32 additions — COA-first architecture
    detail_type = Column(String(100), nullable=True)
    account_status = Column(String(20), nullable=False, default="active")
    description = Column(String(500), nullable=True)
    tax_line = Column(String(200), nullable=True)
    source_system = Column(String(50), nullable=True)
    source_account_id = Column(String(100), nullable=True)
    reporting_taxonomy_line_id = Column(
        Integer, ForeignKey("reporting_taxonomy_lines.id"), nullable=True
    )

    # Schema enforcement — canonical COA fields
    is_header = Column(Boolean, nullable=False, default=False)
    is_postable = Column(Boolean, nullable=False, default=True)
    fs_sign_convention = Column(Integer, nullable=True)   # -1 or 1
    cfs_section = Column(String(20), nullable=True)       # Operating|Investing|Financing|NotApplicable
    fs_statement = Column(String(30), nullable=True)      # IncomeStatement|BalanceSheet|CashFlow|etc.
    fs_section = Column(String(100), nullable=True)       # "Current Assets", "Operating Expenses"
    fs_line_label = Column(String(255), nullable=True)    # label on financial statement
    fs_line_order = Column(Integer, nullable=True)        # sort position on FS
    account_path = Column(String(500), nullable=True)     # materialized path: "1/5/12"
    depth_level = Column(Integer, nullable=True)          # 0 = root
    sort_order = Column(Integer, nullable=True)           # display ordering within siblings
