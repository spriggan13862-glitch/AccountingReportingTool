"""add adjustment workspace models and materiality

Revision ID: dcc85a81e6cb
Revises: af3a982c28ac
Create Date: 2026-06-12 01:14:46.088007
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'dcc85a81e6cb'
down_revision: Union[str, None] = 'af3a982c28ac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'adjustment_packages' not in existing_tables:
        op.create_table('adjustment_packages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('package_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint("package_type IN ('audit','management','tax','qoe','seller','buyer')", name='ck_pkg_type'),
        sa.CheckConstraint("status IN ('open','review','finalized')", name='ck_pkg_status'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
        )

    if 'adjustment_advisor_notes' not in existing_tables:
        op.create_table('adjustment_advisor_notes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('journal_entry_id', sa.Integer(), nullable=False),
        sa.Column('issue', sa.Text(), nullable=True),
        sa.Column('recommendation', sa.Text(), nullable=True),
        sa.Column('client_response', sa.Text(), nullable=True),
        sa.Column('resolution_status', sa.String(length=50), nullable=False),
        sa.Column('updated_by_user_id', sa.Integer(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.CheckConstraint("resolution_status IN ('open','pending_client','resolved','na')", name='ck_note_resolution'),
        sa.ForeignKeyConstraint(['journal_entry_id'], ['journal_entries.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['updated_by_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('journal_entry_id')
        )

    if 'adjustment_package_memberships' not in existing_tables:
        op.create_table('adjustment_package_memberships',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('package_id', sa.Integer(), nullable=False),
        sa.Column('journal_entry_id', sa.Integer(), nullable=False),
        sa.Column('added_by_user_id', sa.Integer(), nullable=True),
        sa.Column('added_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['added_by_user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['journal_entry_id'], ['journal_entries.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['package_id'], ['adjustment_packages.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )

    columns = [c['name'] for c in inspector.get_columns('journal_entries')]
    if 'materiality' not in columns:
        op.add_column('journal_entries', sa.Column('materiality', sa.String(length=50), nullable=True))


def downgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'journal_entries' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('journal_entries')]
        if 'materiality' in columns:
            op.drop_column('journal_entries', 'materiality')

    if 'adjustment_package_memberships' in existing_tables:
        op.drop_table('adjustment_package_memberships')

    if 'adjustment_advisor_notes' in existing_tables:
        op.drop_table('adjustment_advisor_notes')

    if 'adjustment_packages' in existing_tables:
        op.drop_table('adjustment_packages')
