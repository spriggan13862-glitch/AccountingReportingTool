"""sprint316_fix_materiality_and_pkg_constraint

Corrective migration: the DB was bootstrapped via create_all and stamped,
bypassing dcc85a81e6cb (which adds materiality) and sprint315 (which
updates the ck_pkg_type constraint). This migration applies the two missing
schema changes to bring the live DB into sync with the ORM models.

Revision ID: 6d9da4ca362c
Revises: sprint315_advisor_scenarios
Create Date: 2026-06-13
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '6d9da4ca362c'
down_revision: Union[str, None] = 'sprint315_advisor_scenarios'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # Add materiality column missing from journal_entries
    if 'journal_entries' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('journal_entries')]
        if 'materiality' not in columns:
            with op.batch_alter_table('journal_entries') as batch_op:
                batch_op.add_column(sa.Column('materiality', sa.String(length=50), nullable=True))

    # Rebuild adjustment_packages to update ck_pkg_type constraint
    if 'adjustment_packages' in existing_tables:
        with op.batch_alter_table('adjustment_packages', recreate='always') as batch_op:
            try:
                batch_op.drop_constraint('ck_pkg_type', type_='check')
            except Exception:
                pass
            batch_op.create_check_constraint(
                'ck_pkg_type',
                "package_type IN ('audit','management','tax','qoe','seller','buyer','sba','client_posting')",
            )


def downgrade() -> None:
    with op.batch_alter_table('adjustment_packages', recreate='always') as batch_op:
        batch_op.drop_constraint('ck_pkg_type', type_='check')
        batch_op.create_check_constraint(
            'ck_pkg_type',
            "package_type IN ('audit','management','tax','qoe','seller','buyer')",
        )

    with op.batch_alter_table('journal_entries') as batch_op:
        batch_op.drop_column('materiality')
