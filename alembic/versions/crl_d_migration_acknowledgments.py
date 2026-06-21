"""CRL-D: migration acknowledgment table

Revision ID: crl_d_migration_acknowledgments
Revises: crl_b_common_reporting_line_layer
Create Date: 2026-06-21
"""
from alembic import op
import sqlalchemy as sa


revision = "crl_d_migration_acknowledgments"
down_revision = "crl_b_common_reporting_line_layer"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crl_migration_acknowledgments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("report_hash", sa.String(64), nullable=False),
        sa.Column("acked_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("acked_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("notes", sa.String(500), nullable=True),
    )
    op.create_index(
        "ix_crl_mig_ack_org_hash",
        "crl_migration_acknowledgments",
        ["organization_id", "report_hash"],
    )


def downgrade() -> None:
    op.drop_index("ix_crl_mig_ack_org_hash", table_name="crl_migration_acknowledgments")
    op.drop_table("crl_migration_acknowledgments")
