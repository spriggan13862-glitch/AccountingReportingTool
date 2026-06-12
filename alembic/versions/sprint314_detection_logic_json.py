"""Sprint 3.14 — Rule Normalization: add detection_logic_json to issue_templates

Revision ID: sprint314_detection_logic_json
Revises: sprint313_issue_templates
Create Date: 2026-06-12
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'sprint314_detection_logic_json'
down_revision: Union[str, None] = 'sprint313_issue_templates'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'issue_templates',
        sa.Column('detection_logic_json', sa.Text(), nullable=True),
    )
    op.create_index(
        'idx_tmpl_rule_type',
        'issue_templates',
        [sa.text("json_extract(detection_logic_json, '$.rule_type')")],
    )


def downgrade() -> None:
    op.drop_index('idx_tmpl_rule_type', table_name='issue_templates')
    op.drop_column('issue_templates', 'detection_logic_json')
