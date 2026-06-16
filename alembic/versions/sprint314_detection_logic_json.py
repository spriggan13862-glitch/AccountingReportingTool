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
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'issue_templates' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('issue_templates')]
        if 'detection_logic_json' not in columns:
            op.add_column(
                'issue_templates',
                sa.Column('detection_logic_json', sa.Text(), nullable=True),
            )
            indexes = [idx['name'] for idx in inspector.get_indexes('issue_templates')]
            if 'idx_tmpl_rule_type' not in indexes:
                op.create_index(
                    'idx_tmpl_rule_type',
                    'issue_templates',
                    [sa.text("json_extract(detection_logic_json, '$.rule_type')")],
                )


def downgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'issue_templates' in existing_tables:
        indexes = [idx['name'] for idx in inspector.get_indexes('issue_templates')]
        if 'idx_tmpl_rule_type' in indexes:
            op.drop_index('idx_tmpl_rule_type', table_name='issue_templates')
        columns = [c['name'] for c in inspector.get_columns('issue_templates')]
        if 'detection_logic_json' in columns:
            op.drop_column('issue_templates', 'detection_logic_json')
