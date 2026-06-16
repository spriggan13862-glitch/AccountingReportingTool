"""Phase 7 — Add 'staging' to entity_type

Revision ID: phase7_entity_staging
Revises: phase6_quickbooks_connection
Create Date: 2026-06-14
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'phase7_entity_staging'
down_revision: Union[str, None] = 'phase6_quickbooks_connection'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'entities' in existing_tables:
        with op.batch_alter_table('entities', recreate='always') as batch_op:
            batch_op.create_check_constraint(
                'ck_entities_type',
                "entity_type IN ('operating','consolidation','elimination','carveout','staging')"
            )

    if 'pdf_import_batches' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('pdf_import_batches')]
        if 'content_hash' not in columns:
            with op.batch_alter_table('pdf_import_batches') as batch_op:
                batch_op.add_column(sa.Column('content_hash', sa.String(64), nullable=True))

    if 'coa_import_batches' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('coa_import_batches')]
        if 'content_hash' not in columns:
            with op.batch_alter_table('coa_import_batches') as batch_op:
                batch_op.add_column(sa.Column('content_hash', sa.String(64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('entities', recreate='always') as batch_op:
        batch_op.create_check_constraint(
            'ck_entities_type',
            "entity_type IN ('operating','consolidation','elimination','carveout')"
        )

    with op.batch_alter_table('pdf_import_batches') as batch_op:
        batch_op.drop_column('content_hash')

    with op.batch_alter_table('coa_import_batches') as batch_op:
        batch_op.drop_column('content_hash')
