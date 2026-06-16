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
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'view_account_overrides' not in existing_tables:
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

    if 'deliverable_packages' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('deliverable_packages')]
        if 'reporting_view_id' not in columns:
            op.add_column(
                'deliverable_packages',
                sa.Column('reporting_view_id', sa.Integer(), nullable=True),
            )
            fks = inspector.get_foreign_keys('deliverable_packages')
            fk_names = [fk['name'] for fk in fks if fk['name']]
            if 'fk_dp_reporting_view' not in fk_names:
                with op.batch_alter_table('deliverable_packages') as batch_op:
                    batch_op.create_foreign_key(
                        'fk_dp_reporting_view',
                        'reporting_taxonomy_views',
                        ['reporting_view_id'],
                        ['id'],
                        ondelete='SET NULL',
                    )


def downgrade():
    from sqlalchemy import inspect as sa_inspect
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'deliverable_packages' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('deliverable_packages')]
        if 'reporting_view_id' in columns:
            with op.batch_alter_table('deliverable_packages') as batch_op:
                batch_op.drop_column('reporting_view_id')

    if 'view_account_overrides' in existing_tables:
        op.drop_table('view_account_overrides')
