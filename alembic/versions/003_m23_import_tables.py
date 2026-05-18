"""M23 import pipeline tables — ImportBatch, ImportLine, ImportValidationIssue, ImportTemplate.

Revision ID: 003
Revises: 002
Create Date: 2026-05-18
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "import_batches" not in existing_tables:
        op.create_table(
            "import_batches",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("entity_id", sa.Integer(), sa.ForeignKey("entities.id"), nullable=False),
            sa.Column("period_id", sa.Integer(), sa.ForeignKey("accounting_periods.id"), nullable=True),
            sa.Column("scenario_id", sa.Integer(), sa.ForeignKey("scenarios.id"), nullable=True),
            sa.Column("filename", sa.String(500), nullable=False),
            sa.Column("source_format", sa.String(20), nullable=False, server_default="csv"),
            sa.Column("content_hash", sa.String(64), nullable=False),
            sa.Column("column_mapping", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("as_of_date", sa.Date(), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default="uploaded"),
            sa.Column("row_count", sa.Integer(), nullable=True),
            sa.Column("mapped_row_count", sa.Integer(), nullable=True),
            sa.Column("unmapped_row_count", sa.Integer(), nullable=True),
            sa.Column("total_debits", sa.Numeric(20, 2), nullable=True),
            sa.Column("total_credits", sa.Numeric(20, 2), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("posted_je_id", sa.Integer(), sa.ForeignKey("journal_entries.id"), nullable=True),
            sa.Column("reversal_je_id", sa.Integer(), sa.ForeignKey("journal_entries.id"), nullable=True),
            sa.Column("uploaded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("reviewed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("uploaded_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        )
        op.create_index("idx_ibatch_entity", "import_batches", ["entity_id"])
        op.create_index("idx_ibatch_org", "import_batches", ["organization_id"])
        op.create_index("idx_ibatch_status", "import_batches", ["status"])
        op.create_index("idx_ibatch_hash", "import_batches", ["content_hash"])

    if "import_lines" not in existing_tables:
        op.create_table(
            "import_lines",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("batch_id", sa.Integer(), sa.ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False),
            sa.Column("line_number", sa.Integer(), nullable=False),
            sa.Column("raw_account_number", sa.String(100), nullable=True),
            sa.Column("raw_account_name", sa.String(500), nullable=True),
            sa.Column("raw_debit", sa.Numeric(20, 2), nullable=True),
            sa.Column("raw_credit", sa.Numeric(20, 2), nullable=True),
            sa.Column("raw_balance", sa.Numeric(20, 2), nullable=True),
            sa.Column("raw_description", sa.Text(), nullable=True),
            sa.Column("debit", sa.Numeric(20, 2), nullable=False, server_default="0"),
            sa.Column("credit", sa.Numeric(20, 2), nullable=False, server_default="0"),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("resolved_account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=True),
            sa.Column("mapping_status", sa.String(20), nullable=False, server_default="unmapped"),
            sa.Column("is_manually_mapped", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("mapped_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("mapped_at", sa.DateTime(), nullable=True),
            sa.Column("suggested_account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
        )
        op.create_index("idx_iline_batch", "import_lines", ["batch_id"])
        op.create_index("idx_iline_account", "import_lines", ["resolved_account_id"])
        op.create_index("idx_iline_status", "import_lines", ["mapping_status"])

    if "import_validation_issues" not in existing_tables:
        op.create_table(
            "import_validation_issues",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("batch_id", sa.Integer(), sa.ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False),
            sa.Column("import_line_id", sa.Integer(), sa.ForeignKey("import_lines.id", ondelete="CASCADE"), nullable=True),
            sa.Column("severity", sa.String(10), nullable=False),
            sa.Column("code", sa.String(100), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("field_name", sa.String(100), nullable=True),
            sa.Column("suggested_resolution", sa.Text(), nullable=True),
            sa.Column("resolved", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("resolved_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_ivi_batch", "import_validation_issues", ["batch_id"])
        op.create_index("idx_ivi_line", "import_validation_issues", ["import_line_id"])
        op.create_index("idx_ivi_severity", "import_validation_issues", ["severity"])

    if "import_templates" not in existing_tables:
        op.create_table(
            "import_templates",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("source_format", sa.String(20), nullable=False, server_default="csv"),
            sa.Column("column_mapping", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("idx_itemplate_org", "import_templates", ["organization_id"])


def downgrade() -> None:
    op.drop_table("import_templates")
    op.drop_table("import_validation_issues")
    op.drop_table("import_lines")
    op.drop_table("import_batches")
