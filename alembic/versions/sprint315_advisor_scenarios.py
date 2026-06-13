"""Sprint 3.15 — Scenario + Adjustment Package Engine

Adds advisor scenario tables and extends package_type constraint
to include 'sba' and 'client_posting'.

Revision ID: sprint315_advisor_scenarios
Revises: sprint314_detection_logic_json
Create Date: 2026-06-13
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'sprint315_advisor_scenarios'
down_revision: Union[str, None] = 'sprint314_detection_logic_json'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extend adjustment_packages.package_type to include 'sba' and 'client_posting'
    with op.batch_alter_table('adjustment_packages', recreate='always') as batch_op:
        batch_op.drop_constraint('ck_pkg_type', type_='check')
        batch_op.create_check_constraint(
            'ck_pkg_type',
            "package_type IN ('audit','management','tax','qoe','seller','buyer','sba','client_posting')",
        )

    # Create advisor_scenarios table
    op.create_table(
        'advisor_scenarios',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('organization_id', sa.String(100), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('scenario_type', sa.String(50), nullable=False, server_default='custom'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "scenario_type IN ('as_reported','management','management_tax','management_tax_qoe','sba','custom')",
            name='ck_adv_scenario_type',
        ),
    )
    op.create_index('idx_adv_scen_org', 'advisor_scenarios', ['organization_id'])

    # Create advisor_scenario_packages table
    op.create_table(
        'advisor_scenario_packages',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('scenario_id', sa.Integer(),
                  sa.ForeignKey('advisor_scenarios.id', ondelete='CASCADE'), nullable=False),
        sa.Column('package_id', sa.Integer(),
                  sa.ForeignKey('adjustment_packages.id', ondelete='CASCADE'), nullable=False),
        sa.Column('included', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('include_order', sa.Integer(), nullable=False, server_default='0'),
        sa.UniqueConstraint('scenario_id', 'package_id', name='uq_adv_scen_pkg'),
    )
    op.create_index('idx_adv_scen_pkg_scenario', 'advisor_scenario_packages', ['scenario_id'])


def downgrade() -> None:
    op.drop_index('idx_adv_scen_pkg_scenario', table_name='advisor_scenario_packages')
    op.drop_index('idx_adv_scen_org', table_name='advisor_scenarios')
    op.drop_table('advisor_scenario_packages')
    op.drop_table('advisor_scenarios')

    with op.batch_alter_table('adjustment_packages', recreate='always') as batch_op:
        batch_op.drop_constraint('ck_pkg_type', type_='check')
        batch_op.create_check_constraint(
            'ck_pkg_type',
            "package_type IN ('audit','management','tax','qoe','seller','buyer')",
        )
