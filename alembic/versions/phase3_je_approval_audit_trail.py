"""Phase 3 — pending_approval JE status + audit trail events table

Adds 'pending_approval' to journal_entries status CHECK constraint and
creates journal_entry_events for lifecycle audit trail.

Revision ID: phase3_je_approval_audit_trail
Revises: sprint315_advisor_scenarios
Create Date: 2026-06-13
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'phase3_je_approval_audit_trail'
down_revision: Union[str, None] = '6d9da4ca362c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extend journal_entries.status to include 'pending_approval'
    with op.batch_alter_table('journal_entries', recreate='always') as batch_op:
        batch_op.drop_constraint('ck_je_status', type_='check')
        batch_op.create_check_constraint(
            'ck_je_status',
            "status IN ('draft','posted','reversed','voided','pending_approval')",
        )

    # Create journal_entry_events audit trail table
    op.create_table(
        'journal_entry_events',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('je_id', sa.Integer(), sa.ForeignKey('journal_entries.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('actor_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('actor_name', sa.String(100), nullable=True),
        sa.Column('occurred_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('note', sa.Text(), nullable=True),
        sa.CheckConstraint(
            "event_type IN ('created','submitted','approved','rejected','posted','reversed','voided','updated')",
            name='ck_je_event_type',
        ),
    )
    op.create_index('idx_je_events_je_id', 'journal_entry_events', ['je_id'])
    op.create_index('idx_je_events_occurred', 'journal_entry_events', ['occurred_at'])


def downgrade() -> None:
    op.drop_table('journal_entry_events')

    with op.batch_alter_table('journal_entries', recreate='always') as batch_op:
        batch_op.drop_constraint('ck_je_status', type_='check')
        batch_op.create_check_constraint(
            'ck_je_status',
            "status IN ('draft','posted','reversed','voided')",
        )
