"""M36b — PDF stable codes + mapping layer

Adds:
  - name_hash and official_account_code to pdf_import_lines
  - pdf_account_mappings table (four-layer linkage)

Revision ID: 010
Revises: 009
Create Date: 2026-05-22
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # ------------------------------------------------------------------
    # Extend pdf_import_lines with stable-code columns
    # ------------------------------------------------------------------
    if "pdf_import_lines" in existing_tables:
        existing_cols = {c["name"] for c in inspector.get_columns("pdf_import_lines")}
        new_cols = [
            ("name_hash",             sa.Column("name_hash", sa.String(64), nullable=True)),
            ("official_account_code", sa.Column("official_account_code", sa.String(50), nullable=True)),
        ]
        for col_name, col_def in new_cols:
            if col_name not in existing_cols:
                op.add_column("pdf_import_lines", col_def)

    # ------------------------------------------------------------------
    # pdf_account_mappings (mapping layer)
    # ------------------------------------------------------------------
    if "pdf_account_mappings" not in existing_tables:
        op.create_table(
            "pdf_account_mappings",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("batch_id", sa.Integer, sa.ForeignKey("pdf_import_batches.id"), nullable=False),
            sa.Column("line_id", sa.Integer, sa.ForeignKey("pdf_import_lines.id"), nullable=True),
            # Layer 1 — source account identity
            sa.Column("source_account_code", sa.String(50), nullable=False),
            sa.Column("official_account_code", sa.String(50), nullable=True),
            sa.Column("account_name", sa.String(200), nullable=False),
            sa.Column("name_hash", sa.String(64), nullable=False),
            # Layer 2 — taxonomy
            sa.Column("taxonomy_code", sa.String(50), nullable=True),
            sa.Column("taxonomy_source", sa.String(20), nullable=False, server_default="auto"),
            sa.Column("taxonomy_locked", sa.Boolean, nullable=False, server_default="0"),
            # Layer 3 — legal entity alignment
            sa.Column("entity_account_id", sa.Integer, sa.ForeignKey("accounts.id"), nullable=True),
            sa.Column("legal_entity_code", sa.String(20), nullable=True),
            # Layer 4 — consolidation grouping
            sa.Column("consolidation_group", sa.String(50), nullable=True),
            # Audit
            sa.Column("mapping_notes", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_pdf_mappings_batch", "pdf_account_mappings", ["batch_id"])
        op.create_index("ix_pdf_mappings_source_code", "pdf_account_mappings", ["source_account_code"])
        op.create_index("ix_pdf_mappings_name_hash", "pdf_account_mappings", ["name_hash"])


def downgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "pdf_account_mappings" in existing_tables:
        op.drop_table("pdf_account_mappings")

    # SQLite doesn't support DROP COLUMN — skip column removal on downgrade
    if bind.dialect.name != "sqlite" and "pdf_import_lines" in existing_tables:
        for col in ["name_hash", "official_account_code"]:
            op.drop_column("pdf_import_lines", col)
