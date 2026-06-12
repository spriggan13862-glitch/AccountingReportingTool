"""Sprint 3.13 — Accounting Intelligence Repository: issue_templates table

Revision ID: sprint313_issue_templates
Revises: sprint312_accounting_intelligence
Create Date: 2026-06-12
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'sprint313_issue_templates'
down_revision: Union[str, None] = 'sprint312_accounting_intelligence'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'issue_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('subcategory', sa.String(length=100), nullable=True),
        sa.Column('issue_type', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=300), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('risk_level', sa.String(length=20), nullable=False, server_default='moderate'),
        sa.Column('materiality_note', sa.Text(), nullable=True),
        sa.Column('detection_logic', sa.Text(), nullable=True),
        sa.Column('potential_causes_json', sa.Text(), nullable=True),
        sa.Column('suggested_procedures_json', sa.Text(), nullable=True),
        sa.Column('suggested_ajes_json', sa.Text(), nullable=True),
        sa.Column('management_questions_json', sa.Text(), nullable=True),
        sa.Column('affected_account_types_json', sa.Text(), nullable=True),
        sa.Column('affected_statements_json', sa.Text(), nullable=True),
        sa.Column('audit_assertions_json', sa.Text(), nullable=True),
        sa.Column('references_json', sa.Text(), nullable=True),
        sa.Column('narrative_prompt_placeholder', sa.Text(), nullable=True),
        sa.Column('executive_summary_placeholder', sa.Text(), nullable=True),
        sa.Column('ai_summary_placeholder', sa.Text(), nullable=True),
        sa.Column('ai_narrative_output', sa.Text(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('organization_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.CheckConstraint(
            "risk_level IN ('low','moderate','high','critical')",
            name='ck_tmpl_risk_level',
        ),
        sa.CheckConstraint(
            "issue_type IN ('financial_analytics','balance_sheet','audit','qoe','sba','fraud','disclosure','presentation')",
            name='ck_tmpl_issue_type',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )
    op.create_index('idx_tmpl_category', 'issue_templates', ['category'])
    op.create_index('idx_tmpl_issue_type', 'issue_templates', ['issue_type'])
    op.create_index('idx_tmpl_risk_level', 'issue_templates', ['risk_level'])


def downgrade() -> None:
    op.drop_index('idx_tmpl_risk_level', table_name='issue_templates')
    op.drop_index('idx_tmpl_issue_type', table_name='issue_templates')
    op.drop_index('idx_tmpl_category', table_name='issue_templates')
    op.drop_table('issue_templates')
