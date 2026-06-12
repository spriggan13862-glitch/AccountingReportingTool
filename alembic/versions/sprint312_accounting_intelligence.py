"""Sprint 3.12 — Accounting Intelligence Engine: detected_issues and issue_detection_thresholds tables

Revision ID: sprint312_accounting_intelligence
Revises: dcc85a81e6cb
Create Date: 2026-06-12
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'sprint312_accounting_intelligence'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'detected_issues',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('run_id', sa.String(length=36), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('current_period_id', sa.Integer(), nullable=False),
        sa.Column('comparison_period_id', sa.Integer(), nullable=True),
        sa.Column('issue_code', sa.String(length=100), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('severity', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=500), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('detection_trigger', sa.Text(), nullable=True),
        sa.Column('affected_accounts_json', sa.Text(), nullable=True),
        sa.Column('supporting_metrics_json', sa.Text(), nullable=True),
        sa.Column('suggested_procedures', sa.Text(), nullable=True),
        sa.Column('suggested_ajes', sa.Text(), nullable=True),
        sa.Column('narrative_prompt', sa.Text(), nullable=True),
        sa.Column('narrative_output', sa.Text(), nullable=True),
        sa.Column('ai_explanation', sa.Text(), nullable=True),
        sa.Column('management_questions', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='open'),
        sa.Column('is_suppressed', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "severity IN ('informational','low','moderate','high','critical')",
            name='ck_det_issue_severity',
        ),
        sa.CheckConstraint(
            "status IN ('open','acknowledged','resolved','dismissed')",
            name='ck_det_issue_status',
        ),
        sa.ForeignKeyConstraint(['entity_id'], ['entities.id']),
        sa.ForeignKeyConstraint(['current_period_id'], ['accounting_periods.id']),
        sa.ForeignKeyConstraint(['comparison_period_id'], ['accounting_periods.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_det_issue_entity_period', 'detected_issues', ['entity_id', 'current_period_id'])
    op.create_index('idx_det_issue_run', 'detected_issues', ['run_id'])
    op.create_index('idx_det_issue_severity', 'detected_issues', ['severity', 'status'])

    op.create_table(
        'issue_detection_thresholds',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('issue_code', sa.String(length=100), nullable=False),
        sa.Column('threshold_type', sa.String(length=50), nullable=False),
        sa.Column('threshold_value', sa.String(length=50), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.CheckConstraint(
            "threshold_type IN ('pct_change','absolute','ratio','pp_change')",
            name='ck_thresh_type',
        ),
        sa.ForeignKeyConstraint(['entity_id'], ['entities.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_thresh_entity_code', 'issue_detection_thresholds', ['entity_id', 'issue_code'])


def downgrade() -> None:
    op.drop_index('idx_thresh_entity_code', table_name='issue_detection_thresholds')
    op.drop_table('issue_detection_thresholds')
    op.drop_index('idx_det_issue_severity', table_name='detected_issues')
    op.drop_index('idx_det_issue_run', table_name='detected_issues')
    op.drop_index('idx_det_issue_entity_period', table_name='detected_issues')
    op.drop_table('detected_issues')
