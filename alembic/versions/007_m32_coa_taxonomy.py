"""M32 — COA-first architecture: taxonomy, COA import, extended account fields

Revision ID: 007
Revises: 006
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # ------------------------------------------------------------------
    # reporting_taxonomy_lines
    # ------------------------------------------------------------------
    if "reporting_taxonomy_lines" not in existing_tables:
        op.create_table(
            "reporting_taxonomy_lines",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("code", sa.String(50), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("section", sa.String(30), nullable=False),
            sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
            sa.Column("is_subtotal", sa.Boolean, nullable=False, server_default="0"),
            sa.Column("parent_id", sa.Integer, sa.ForeignKey("reporting_taxonomy_lines.id"), nullable=True),
            sa.UniqueConstraint("code", name="uq_taxonomy_code"),
        )

    # ------------------------------------------------------------------
    # coa_import_batches
    # ------------------------------------------------------------------
    if "coa_import_batches" not in existing_tables:
        op.create_table(
            "coa_import_batches",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("entity_id", sa.Integer, sa.ForeignKey("entities.id"), nullable=False),
            sa.Column("filename", sa.String(255), nullable=False),
            sa.Column("source_system", sa.String(50), nullable=True),
            sa.Column("row_count", sa.Integer, nullable=True),
            sa.Column("accounts_created", sa.Integer, nullable=True),
            sa.Column("accounts_updated", sa.Integer, nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="uploaded"),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column("raw_preview", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    # ------------------------------------------------------------------
    # accounts — new columns (skip if already added by baseline create_all)
    # ------------------------------------------------------------------
    existing_cols = {c["name"] for c in inspector.get_columns("accounts")}

    if "detail_type" not in existing_cols:
        op.add_column("accounts", sa.Column("detail_type", sa.String(100), nullable=True))
    if "account_status" not in existing_cols:
        op.add_column("accounts", sa.Column("account_status", sa.String(20), nullable=False, server_default="active"))
    if "description" not in existing_cols:
        op.add_column("accounts", sa.Column("description", sa.String(500), nullable=True))
    if "tax_line" not in existing_cols:
        op.add_column("accounts", sa.Column("tax_line", sa.String(200), nullable=True))
    if "source_system" not in existing_cols:
        op.add_column("accounts", sa.Column("source_system", sa.String(50), nullable=True))
    if "source_account_id" not in existing_cols:
        op.add_column("accounts", sa.Column("source_account_id", sa.String(100), nullable=True))
    if "reporting_taxonomy_line_id" not in existing_cols:
        # SQLite: ALTER TABLE cannot carry FK constraint definitions.
        # Add as plain Integer; the FK is declared on the model and SQLite
        # does not enforce it at the DB level regardless.
        if bind.dialect.name == "sqlite":
            op.add_column(
                "accounts",
                sa.Column("reporting_taxonomy_line_id", sa.Integer, nullable=True),
            )
        else:
            op.add_column(
                "accounts",
                sa.Column(
                    "reporting_taxonomy_line_id",
                    sa.Integer,
                    sa.ForeignKey("reporting_taxonomy_lines.id"),
                    nullable=True,
                ),
            )

    # SQLite doesn't enforce CHECK constraints added via ALTER TABLE — skip for SQLite
    dialect = bind.dialect.name
    if dialect != "sqlite":
        existing_constraints = {c["name"] for c in inspector.get_check_constraints("accounts")}
        if "ck_accounts_status" not in existing_constraints:
            op.create_check_constraint(
                "ck_accounts_status",
                "accounts",
                "account_status IN ('active', 'inactive', 'archived', 'deprecated')",
            )


def downgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)

    # SQLite: 001's downgrade calls Base.metadata.drop_all which handles cleanup.
    # Column drops on SQLite with FK constraints are unreliable via ALTER TABLE.
    if bind.dialect.name == "sqlite":
        return

    existing_constraints = {c["name"] for c in inspector.get_check_constraints("accounts")}
    if "ck_accounts_status" in existing_constraints:
        op.drop_constraint("ck_accounts_status", "accounts", type_="check")

    existing_cols = {c["name"] for c in inspector.get_columns("accounts")}
    for col in ("reporting_taxonomy_line_id", "source_account_id", "source_system",
                "tax_line", "description", "account_status", "detail_type"):
        if col in existing_cols:
            op.drop_column("accounts", col)

    existing_tables = set(inspector.get_table_names())
    if "coa_import_batches" in existing_tables:
        op.drop_table("coa_import_batches")
    if "reporting_taxonomy_lines" in existing_tables:
        op.drop_table("reporting_taxonomy_lines")
