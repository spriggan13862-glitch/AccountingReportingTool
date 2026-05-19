"""M25 period governance and shadow-close infrastructure

Revision ID: 005
Revises: 004
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    existing_tables = sa.inspect(conn).get_table_names()
    existing_cols = {c["name"] for c in sa.inspect(conn).get_columns("accounting_periods")}

    # Add period_status column to accounting_periods
    if "period_status" not in existing_cols:
        op.add_column(
            "accounting_periods",
            sa.Column("period_status", sa.String(20), nullable=False, server_default="open"),
        )
        # Backfill: where is_closed=True → soft_closed (existing legacy close behaviour)
        op.execute(
            "UPDATE accounting_periods SET period_status = 'soft_closed' WHERE is_closed = 1"
        )

    if "period_governance_events" not in existing_tables:
        op.create_table(
            "period_governance_events",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("period_id", sa.Integer, sa.ForeignKey("accounting_periods.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("event_type", sa.String(30), nullable=False),
            sa.Column("from_status", sa.String(20), nullable=False),
            sa.Column("to_status", sa.String(20), nullable=False),
            sa.Column("actor_user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
            sa.Column("reason", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_pge_period", "period_governance_events", ["period_id"])

    if "shadow_close_runs" not in existing_tables:
        op.create_table(
            "shadow_close_runs",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("period_id", sa.Integer, sa.ForeignKey("accounting_periods.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("entity_id", sa.Integer, sa.ForeignKey("entities.id"), nullable=False, index=True),
            sa.Column("run_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("overall_status", sa.String(20), nullable=False),
            sa.Column("run_by_user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
            sa.Column("result_json", sa.JSON, nullable=False),
        )
        op.create_index("idx_scr_period", "shadow_close_runs", ["period_id"])
        op.create_index("idx_scr_entity", "shadow_close_runs", ["entity_id"])


def downgrade() -> None:
    op.drop_table("shadow_close_runs")
    op.drop_table("period_governance_events")
    op.drop_column("accounting_periods", "period_status")
