"""M27 entity fiscal year fields and import raw headers

Revision ID: 006
Revises: 005
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    entity_cols = {c["name"] for c in sa.inspect(conn).get_columns("entities")}
    batch_cols = {c["name"] for c in sa.inspect(conn).get_columns("import_batches")}

    if "fiscal_year_end_month" not in entity_cols:
        op.add_column("entities", sa.Column("fiscal_year_end_month", sa.Integer, nullable=True))

    if "fiscal_year_convention" not in entity_cols:
        op.add_column("entities", sa.Column("fiscal_year_convention", sa.String(30), nullable=True))

    if "raw_headers" not in batch_cols:
        op.add_column("import_batches", sa.Column("raw_headers", sa.JSON, nullable=True))


def downgrade() -> None:
    op.drop_column("entities", "fiscal_year_end_month")
    op.drop_column("entities", "fiscal_year_convention")
    op.drop_column("import_batches", "raw_headers")
