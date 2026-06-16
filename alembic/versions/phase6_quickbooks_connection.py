"""Phase 6 — QuickBooks connection table

Revision ID: phase6_quickbooks_connection
Revises: phase4_deliverable_snapshots
Create Date: 2026-06-13
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'phase6_quickbooks_connection'
down_revision: Union[str, None] = 'phase4_deliverable_snapshots'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'quickbooks_connections' not in existing_tables:
        op.create_table(
            'quickbooks_connections',
            sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
            sa.Column('entity_id', sa.Integer(), sa.ForeignKey('entities.id', ondelete='CASCADE'), nullable=False),
            sa.Column('organization_id', sa.Integer(), nullable=False),
            sa.Column('connection_type', sa.String(20), nullable=False, server_default='online'),
            sa.Column('realm_id', sa.String(100), nullable=True),
            sa.Column('access_token', sa.String(2000), nullable=True),
            sa.Column('refresh_token', sa.String(2000), nullable=True),
            sa.Column('token_expires_at', sa.DateTime(), nullable=True),
            sa.Column('company_name', sa.String(200), nullable=True),
            sa.Column('last_sync_at', sa.DateTime(), nullable=True),
            sa.Column('status', sa.String(20), nullable=False, server_default='active'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
        )
        op.create_index('idx_qb_connections_entity', 'quickbooks_connections', ['entity_id'])


def downgrade() -> None:
    op.drop_table('quickbooks_connections')
