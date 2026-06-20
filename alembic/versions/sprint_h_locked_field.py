"""Sprint H — Add locked field to view_account_overrides

Revision ID: sprint_h_locked_field
Revises: 6d9da4ca362c
Create Date: 2026-06-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = 'sprint_h_locked_field'
down_revision = '6d9da4ca362c'
branch_labels = None
depends_on = None


def upgrade():
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'view_account_overrides' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('view_account_overrides')]
        if 'locked' not in columns:
            with op.batch_alter_table('view_account_overrides') as batch_op:
                batch_op.add_column(
                    sa.Column('locked', sa.Boolean(), nullable=True, server_default=sa.false())
                )


def downgrade():
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'view_account_overrides' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('view_account_overrides')]
        if 'locked' in columns:
            with op.batch_alter_table('view_account_overrides') as batch_op:
                batch_op.drop_column('locked')
