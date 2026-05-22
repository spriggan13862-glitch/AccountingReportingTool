"""M36 — PDF Financial Statement Ingestion: pdf_import_batch + pdf_import_line tables

Revision ID: 009
Revises: 008
Create Date: 2026-05-22
"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "pdf_import_batches" not in existing_tables:
        op.create_table(
            "pdf_import_batches",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("entity_id", sa.Integer, sa.ForeignKey("entities.id"), nullable=True),
            sa.Column("filename", sa.String(255), nullable=False),
            sa.Column("source_entity_name", sa.String(200), nullable=True),
            sa.Column("statement_date", sa.String(20), nullable=True),   # e.g. "2025-12-31"
            sa.Column("basis_of_accounting", sa.String(50), nullable=True),  # "income_tax", "gaap", etc.
            sa.Column("page_count", sa.Integer, nullable=True),
            sa.Column("line_count", sa.Integer, nullable=True),
            sa.Column("accounts_created", sa.Integer, nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="uploaded"),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column("raw_preview", sa.Text, nullable=True),  # JSON
            sa.Column("validation_summary", sa.Text, nullable=True),  # JSON subtotal check results
            sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        )

    if "pdf_import_lines" not in existing_tables:
        op.create_table(
            "pdf_import_lines",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("batch_id", sa.Integer, sa.ForeignKey("pdf_import_batches.id"), nullable=False),
            sa.Column("temp_account_code", sa.String(50), nullable=False),
            sa.Column("account_name", sa.String(200), nullable=False),
            sa.Column("statement_type", sa.String(20), nullable=False),   # balance_sheet / income_statement
            sa.Column("section", sa.String(50), nullable=False),           # current_assets, fixed_assets, etc.
            sa.Column("amount", sa.Numeric(18, 2), nullable=False),
            sa.Column("is_subtotal", sa.Boolean, nullable=False, server_default="0"),
            sa.Column("is_contra", sa.Boolean, nullable=False, server_default="0"),
            sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
            sa.Column("suggested_taxonomy_code", sa.String(50), nullable=True),
            sa.Column("mapping_confidence", sa.String(20), nullable=True),  # high / medium / low
            sa.Column("mapping_evidence", sa.String(200), nullable=True),
            sa.Column("page_number", sa.Integer, nullable=True),
            sa.Column("source_line_text", sa.Text, nullable=True),
        )


def downgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "pdf_import_lines" in existing_tables:
        op.drop_table("pdf_import_lines")
    if "pdf_import_batches" in existing_tables:
        op.drop_table("pdf_import_batches")
