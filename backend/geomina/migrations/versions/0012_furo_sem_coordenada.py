"""furo sem coordenada da boca (cadastrado para conferir depois)

Revisão: 0012
Anterior: 0011
Criada em: 2026-11-27
"""
import sqlalchemy as sa
from alembic import op


revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('furo', schema=None) as batch_op:
        batch_op.alter_column('x', existing_type=sa.Float(), nullable=True)
        batch_op.alter_column('y', existing_type=sa.Float(), nullable=True)
        batch_op.alter_column('z', existing_type=sa.Float(), nullable=True)
        batch_op.create_check_constraint('furo_xyz_juntos', '(x IS NULL) = (y IS NULL) AND (x IS NULL) = (z IS NULL)')


def downgrade() -> None:
    with op.batch_alter_table('furo', schema=None) as batch_op:
        batch_op.drop_constraint('furo_xyz_juntos', type_='check')
        batch_op.alter_column('z', existing_type=sa.Float(), nullable=False)
        batch_op.alter_column('y', existing_type=sa.Float(), nullable=False)
        batch_op.alter_column('x', existing_type=sa.Float(), nullable=False)
