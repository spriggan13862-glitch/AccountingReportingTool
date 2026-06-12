"""add_deliverable_workspace_models

Revision ID: 7ec29efbfbdd
Revises: dcc85a81e6cb
Create Date: 2026-06-12 02:35:52.044939
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7ec29efbfbdd'
down_revision: Union[str, None] = 'dcc85a81e6cb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'deliverable_packages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('package_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('owner', sa.String(length=200), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "package_type IN ('audit','advisor','management','tax','qoe','close','lender','custom')",
            name='ck_dp_package_type',
        ),
        sa.CheckConstraint(
            "status IN ('draft','internal_review','client_review','finalized','archived')",
            name='ck_dp_status',
        ),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_dp_org', 'deliverable_packages', ['organization_id'])
    op.create_index('idx_dp_status', 'deliverable_packages', ['status'])

    op.create_table(
        'deliverable_package_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('package_id', sa.Integer(), nullable=False),
        sa.Column('item_type', sa.String(length=50), nullable=False),
        sa.Column('item_ref', sa.String(length=200), nullable=False),
        sa.Column('item_label', sa.String(length=500), nullable=True),
        sa.Column('added_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('added_by_user_id', sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "item_type IN ('journal_entry','adjustment_set','report','financial_statement','document','reconciliation','workpaper')",
            name='ck_dpi_item_type',
        ),
        sa.ForeignKeyConstraint(['package_id'], ['deliverable_packages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['added_by_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_dpi_package', 'deliverable_package_items', ['package_id'])

    op.create_table(
        'deliverable_memos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('package_id', sa.Integer(), nullable=False),
        sa.Column('issue', sa.Text(), nullable=True),
        sa.Column('observation', sa.Text(), nullable=True),
        sa.Column('recommendation', sa.Text(), nullable=True),
        sa.Column('client_response', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "status IN ('open','pending_client','resolved','na')",
            name='ck_dm_status',
        ),
        sa.ForeignKeyConstraint(['package_id'], ['deliverable_packages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_dm_package', 'deliverable_memos', ['package_id'])


def downgrade() -> None:
    op.drop_index('idx_dm_package', table_name='deliverable_memos')
    op.drop_table('deliverable_memos')
    op.drop_index('idx_dpi_package', table_name='deliverable_package_items')
    op.drop_table('deliverable_package_items')
    op.drop_index('idx_dp_status', table_name='deliverable_packages')
    op.drop_index('idx_dp_org', table_name='deliverable_packages')
    op.drop_table('deliverable_packages')
