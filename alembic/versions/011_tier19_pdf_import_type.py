"""Tier 1.9 — PDF import type/scope, synthetic line flags, taxonomy conflict columns

Adds:
  - pdf_import_batches.import_type, statement_scope
  - pdf_import_lines.synthetic_presentation_line, system_managed, locked
  - pdf_account_mappings.source_taxonomy_code, taxonomy_conflict, conflict_reason, conflict_resolution

Revision ID: 011
Revises: 010
Create Date: 2026-05-25
"""
from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # ------------------------------------------------------------------
    # pdf_import_batches — import classification
    # ------------------------------------------------------------------
    if "pdf_import_batches" in existing_tables:
        existing_cols = {c["name"] for c in inspector.get_columns("pdf_import_batches")}
        new_cols = [
            ("import_type",    sa.Column("import_type",    sa.String(40),  nullable=True)),
            ("statement_scope", sa.Column("statement_scope", sa.String(30), nullable=True)),
        ]
        for col_name, col_def in new_cols:
            if col_name not in existing_cols:
                op.add_column("pdf_import_batches", col_def)

    # ------------------------------------------------------------------
    # pdf_import_lines — synthetic line flags
    # ------------------------------------------------------------------
    if "pdf_import_lines" in existing_tables:
        existing_cols = {c["name"] for c in inspector.get_columns("pdf_import_lines")}
        new_cols = [
            ("synthetic_presentation_line", sa.Column("synthetic_presentation_line", sa.Boolean, nullable=False, server_default="0")),
            ("system_managed",              sa.Column("system_managed",              sa.Boolean, nullable=False, server_default="0")),
            ("locked",                      sa.Column("locked",                      sa.Boolean, nullable=False, server_default="0")),
        ]
        for col_name, col_def in new_cols:
            if col_name not in existing_cols:
                op.add_column("pdf_import_lines", col_def)

    # ------------------------------------------------------------------
    # pdf_account_mappings — conflict tracking
    # ------------------------------------------------------------------
    if "pdf_account_mappings" in existing_tables:
        existing_cols = {c["name"] for c in inspector.get_columns("pdf_account_mappings")}
        new_cols = [
            ("source_taxonomy_code", sa.Column("source_taxonomy_code", sa.String(50),  nullable=True)),
            ("taxonomy_conflict",    sa.Column("taxonomy_conflict",    sa.Boolean,      nullable=False, server_default="0")),
            ("conflict_reason",      sa.Column("conflict_reason",      sa.String(200),  nullable=True)),
            ("conflict_resolution",  sa.Column("conflict_resolution",  sa.String(30),   nullable=True)),
        ]
        for col_name, col_def in new_cols:
            if col_name not in existing_cols:
                op.add_column("pdf_account_mappings", col_def)


def downgrade() -> None:
    # SQLite does not support DROP COLUMN — skip on SQLite
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        return

    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "pdf_account_mappings" in existing_tables:
        for col in ["source_taxonomy_code", "taxonomy_conflict", "conflict_reason", "conflict_resolution"]:
            op.drop_column("pdf_account_mappings", col)

    if "pdf_import_lines" in existing_tables:
        for col in ["synthetic_presentation_line", "system_managed", "locked"]:
            op.drop_column("pdf_import_lines", col)

    if "pdf_import_batches" in existing_tables:
        for col in ["import_type", "statement_scope"]:
            op.drop_column("pdf_import_batches", col)
