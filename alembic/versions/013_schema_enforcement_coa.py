"""Schema enforcement: canonical COA fields + expanded account_type values

Revision ID: 013
Revises: 012
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None

_NEW_COLUMNS = [
    ("is_header",          sa.Boolean(),     False,  "0"),
    ("is_postable",        sa.Boolean(),     False,  "1"),
    ("fs_sign_convention", sa.Integer(),     True,   None),
    ("cfs_section",        sa.String(20),    True,   None),
    ("fs_statement",       sa.String(30),    True,   None),
    ("fs_section",         sa.String(100),   True,   None),
    ("fs_line_label",      sa.String(255),   True,   None),
    ("fs_line_order",      sa.Integer(),     True,   None),
    ("account_path",       sa.String(500),   True,   None),
    ("depth_level",        sa.Integer(),     True,   None),
    ("sort_order",         sa.Integer(),     True,   None),
]


def upgrade() -> None:
    bind = op.get_bind()
    from sqlalchemy import inspect as sa_inspect
    inspector = sa_inspect(bind)
    existing_cols = {c["name"] for c in inspector.get_columns("accounts")}

    for col_name, col_type, nullable, default in _NEW_COLUMNS:
        if col_name in existing_cols:
            continue
        kwargs: dict = {"nullable": nullable}
        if default is not None:
            kwargs["server_default"] = default
        op.add_column("accounts", sa.Column(col_name, col_type, **kwargs))

    # Recreate accounts table with expanded account_type CHECK constraint.
    # SQLite does not support ALTER TABLE DROP CONSTRAINT, so we use batch mode
    # which recreates the table transparently.
    _ACCOUNT_TYPES = (
        "'asset', 'liability', 'equity', 'revenue', 'cogs', "
        "'expense', 'other_income', 'other_expense', 'tax', 'intercompany'"
    )
    with op.batch_alter_table("accounts", recreate="always") as batch_op:
        batch_op.drop_constraint("ck_accounts_type", type_="check")
        batch_op.create_check_constraint(
            "ck_accounts_type",
            f"account_type IN ({_ACCOUNT_TYPES})",
        )
        batch_op.create_check_constraint(
            "ck_accounts_fs_sign",
            "fs_sign_convention IS NULL OR fs_sign_convention IN (-1, 1)",
        )


def downgrade() -> None:
    with op.batch_alter_table("accounts", recreate="always") as batch_op:
        batch_op.drop_constraint("ck_accounts_fs_sign", type_="check")
        batch_op.drop_constraint("ck_accounts_type", type_="check")
        batch_op.create_check_constraint(
            "ck_accounts_type",
            "account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')",
        )

    for col_name, *_ in reversed(_NEW_COLUMNS):
        op.drop_column("accounts", col_name)
