"""Add FSLI staging columns to import_lines for the simplified TB wizard.

Revision ID: agent_tb_simplify_fsli_staging
Revises: sprint_p2_reporting_view
Create Date: 2026-06-21
"""
from alembic import op
import sqlalchemy as sa


revision = "agent_tb_simplify_fsli_staging"
down_revision = "sprint_p2_reporting_view"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("import_lines") as batch:
        batch.add_column(
            sa.Column("suggested_fsli_taxonomy_node_id", sa.Integer(), nullable=True)
        )
        batch.add_column(
            sa.Column("suggested_fsli_confidence", sa.Numeric(4, 3), nullable=True)
        )
        batch.add_column(
            sa.Column("suggested_fsli_reason", sa.String(200), nullable=True)
        )
        batch.add_column(
            sa.Column("selected_fsli_taxonomy_node_id", sa.Integer(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("import_lines") as batch:
        batch.drop_column("selected_fsli_taxonomy_node_id")
        batch.drop_column("suggested_fsli_reason")
        batch.drop_column("suggested_fsli_confidence")
        batch.drop_column("suggested_fsli_taxonomy_node_id")
