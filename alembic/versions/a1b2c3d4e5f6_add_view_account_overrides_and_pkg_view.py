"""add view_account_overrides and deliverable_packages.reporting_view_id

Revision ID: a1b2c3d4e5f6
Revises: 7ec29efbfbdd
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '7ec29efbfbdd'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'view_account_overrides',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('view_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('taxonomy_line_id', sa.Integer(), nullable=True),
        sa.Column('display_label', sa.String(255), nullable=True),
        sa.Column('created_by', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['view_id'], ['reporting_taxonomy_views.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['taxonomy_line_id'], ['reporting_taxonomy_lines.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('view_id', 'account_id', name='uq_vao_view_account'),
    )

    op.add_column(
        'deliverable_packages',
        sa.Column('reporting_view_id', sa.Integer(), nullable=True),
    )
    with op.batch_alter_table('deliverable_packages') as batch_op:
        batch_op.create_foreign_key(
            'fk_dp_reporting_view',
            'reporting_taxonomy_views',
            ['reporting_view_id'],
            ['id'],
            ondelete='SET NULL',
        )


def downgrade():
    with op.batch_alter_table('deliverable_packages') as batch_op:
        batch_op.drop_constraint('fk_dp_reporting_view', type_='foreignkey')
    op.drop_column('deliverable_packages', 'reporting_view_id')
    op.drop_table('view_account_overrides')
