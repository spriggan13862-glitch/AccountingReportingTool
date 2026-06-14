"""add_original_preview_to_pdf_import_batch

Revision ID: af3a982c28ac
Revises: 013
Create Date: 2026-05-28 13:48:25.171947
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'af3a982c28ac'
down_revision: Union[str, None] = '013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect
    conn = op.get_bind()
    cols = [c['name'] for c in inspect(conn).get_columns('pdf_import_batches')]
    if 'original_preview' not in cols:
        op.add_column('pdf_import_batches', sa.Column('original_preview', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('pdf_import_batches', 'original_preview')
