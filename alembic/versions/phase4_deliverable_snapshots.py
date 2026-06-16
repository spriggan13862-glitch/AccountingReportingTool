"""Phase 4 — Deliverable snapshots table

Creates deliverable_snapshots for immutable locked package versions.

Revision ID: phase4_deliverable_snapshots
Revises: phase3_je_approval_audit_trail
Create Date: 2026-06-13
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'phase4_deliverable_snapshots'
down_revision: Union[str, None] = 'phase3_je_approval_audit_trail'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'deliverable_snapshots' not in existing_tables:
        op.create_table(
            'deliverable_snapshots',
            sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
            sa.Column('package_id', sa.Integer(), sa.ForeignKey('deliverable_packages.id', ondelete='CASCADE'), nullable=False),
            sa.Column('snapshot_name', sa.String(200), nullable=False),
            sa.Column('entity_id', sa.Integer(), sa.ForeignKey('entities.id'), nullable=True),
            sa.Column('as_of_date', sa.Date(), nullable=True),
            sa.Column('scenario_ids', sa.Text(), nullable=True),
            sa.Column('data_view', sa.String(20), nullable=False, server_default='adjusted'),
            sa.Column('created_by', sa.String(100), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('notes', sa.Text(), nullable=True),
        )
        op.create_index('idx_deliverable_snapshots_pkg', 'deliverable_snapshots', ['package_id'])


def downgrade() -> None:
    op.drop_table('deliverable_snapshots')
